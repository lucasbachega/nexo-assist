import { runTurn, type AgentPorts } from '@nexo/agent';
import type { ChatMessage, ConversationView, Employee, SessionUsage, TurnEvent } from '@nexo/shared';
import { TicketsUnavailableError } from '@nexo/tickets/client';
import type { ConversationRecord, SessionRecord } from '../store';
import { employeeActor, type ServiceDeps } from './deps';
import type { DraftService } from './drafts';
import { ServiceError } from './errors';
import type { HandoffService } from './handoff';

const MAX_MESSAGE_LENGTH = 2000;

/** Erros do provedor que não se resolvem tentando de novo: chave inválida, sem crédito, sem permissão. */
export function isProviderConfigError(message: string): boolean {
  return /api[ _-]?key|x-api-key|authentication|unauthorized|credit balance|billing|permission/i.test(message);
}

function toConversationView(c: ConversationRecord): ConversationView {
  return {
    id: c.id,
    employeeId: c.employeeId,
    status: c.status,
    assignedAnalystId: c.assignedAnalystId,
    assignedAnalystName: c.assignedAnalystName,
    ticketId: c.ticketId,
    handoff: c.handoff,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * Orquestra o chat do funcionário: persistência, limites de uso, estado da
 * conversa (agent × analista) e a execução do turno do agent com streaming.
 */
export class ChatService {
  /** Um turno por conversa por vez (processo único; ver README para escala horizontal). */
  private readonly running = new Set<string>();
  private readonly employeeCache = new Map<string, { employee: Employee; at: number }>();

  constructor(
    private readonly deps: ServiceDeps,
    private readonly drafts: DraftService,
    private readonly handoff: HandoffService,
  ) {}

  async loadEmployee(session: SessionRecord): Promise<Employee> {
    const cached = this.employeeCache.get(session.userId);
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.employee;
    try {
      const employee = await this.deps.tickets(employeeActor({ id: session.userId, name: session.name })).getEmployee(session.userId);
      this.employeeCache.set(session.userId, { employee, at: Date.now() });
      return employee;
    } catch (err) {
      if (cached) return cached.employee;
      if (err instanceof TicketsUnavailableError) {
        // Sem o diretório, seguimos com os dados da sessão (sem equipamento).
        return {
          id: session.userId,
          name: session.name,
          email: session.email,
          role: 'funcionario',
          department: session.department,
          device: null,
          os: null,
          team: null,
        };
      }
      throw err;
    }
  }

  usage(session: SessionRecord): SessionUsage {
    return { used: this.deps.store.countUserMessagesInSession(session.id), limit: this.deps.limits.perSession };
  }

  /** Conversa atual do funcionário: a aberta mais recente, ou a última encerrada (só leitura). */
  state(session: SessionRecord) {
    const conv = this.deps.store.latestConversation(session.userId);
    return {
      conversation: conv ? toConversationView(conv) : null,
      messages: conv ? this.deps.store.listMessages(conv.id) : [],
      usage: this.usage(session),
    };
  }

  poll(session: SessionRecord, conversationId: string, afterSeq: number) {
    const conv = this.deps.store.getConversation(conversationId);
    if (!conv || conv.employeeId !== session.userId) throw new ServiceError(404, 'Conversa não encontrada');
    return { conversation: toConversationView(conv), messages: this.deps.store.listMessages(conv.id, afterSeq) };
  }

  private activeConversation(session: SessionRecord): ConversationRecord {
    const latest = this.deps.store.latestConversation(session.userId);
    if (latest && latest.status !== 'encerrada') return latest;
    return this.deps.store.createConversation({ id: session.userId, name: session.name, department: session.department });
  }

  async send(session: SessionRecord, rawText: string, emit: (e: TurnEvent) => void, signal?: AbortSignal): Promise<void> {
    const { store, clock, limits } = this.deps;
    const text = rawText.trim();
    if (!text) throw new ServiceError(400, 'Escreva uma mensagem');
    if (text.length > MAX_MESSAGE_LENGTH) throw new ServiceError(400, `A mensagem pode ter até ${MAX_MESSAGE_LENGTH} caracteres`);

    const usage = this.usage(session);
    if (usage.used >= usage.limit) {
      throw new ServiceError(
        429,
        `Você atingiu o limite de ${usage.limit} mensagens nesta sessão. Saia e entre de novo para continuar.`,
        'limite_sessao',
      );
    }
    const hourAgo = new Date(clock().getTime() - 3600_000).toISOString();
    if (store.countUserMessagesSince(session.userId, hourAgo) >= limits.perHour) {
      throw new ServiceError(429, 'Muitas mensagens na última hora. Aguarde alguns minutos ou ligue no ramal 4000.', 'limite_hora');
    }

    if (limits.perDayGlobal) {
      const dayAgo = new Date(clock().getTime() - 86_400_000).toISOString();
      if (store.countAllUserMessagesSince(dayAgo) >= limits.perDayGlobal) {
        throw new ServiceError(
          429,
          'O assistente atingiu o limite de uso de hoje. Ligue no ramal 4000 para falar com o service desk.',
          'limite_global',
        );
      }
    }

    let conv = this.activeConversation(session);
    if (this.running.has(conv.id)) throw new ServiceError(409, 'Aguarde a resposta anterior terminar');
    this.running.add(conv.id);
    try {
      const history = store.listMessages(conv.id);
      const userMessage = store.addMessage({
        conversationId: conv.id,
        role: 'user',
        authorId: session.userId,
        authorName: session.name,
        text,
        sessionId: session.id,
      });
      emit({ type: 'user_message', message: userMessage });

      // Com um analista (ou aguardando um), o agent não responde.
      if (conv.status !== 'agent') {
        conv = store.getConversation(conv.id)!;
        emit({ type: 'queued', conversation: toConversationView(conv), usage: this.usage(session) });
        return;
      }

      const assistant = await this.runAgent(session, conv, history, text, emit, signal);
      conv = store.getConversation(conv.id)!;
      emit({ type: 'done', message: assistant, conversation: toConversationView(conv), usage: this.usage(session) });
    } finally {
      this.running.delete(conv.id);
    }
  }

  private async runAgent(
    session: SessionRecord,
    conv: ConversationRecord,
    history: ChatMessage[],
    text: string,
    emit: (e: TurnEvent) => void,
    signal?: AbortSignal,
  ): Promise<ChatMessage> {
    const { store } = this.deps;
    if (this.deps.model.missingKey) {
      return store.addMessage({
        conversationId: conv.id,
        role: 'assistant',
        authorName: 'Nexo Assist',
        text: `O assistente ainda não está configurado: defina ${this.deps.model.missingKey} no arquivo .env e reinicie o app.`,
      });
    }

    const employee = await this.loadEmployee(session);
    const tickets = this.deps.tickets(employeeActor(employee));
    const ports: AgentPorts = {
      employee,
      tickets,
      now: this.deps.clock,
      conversation: {
        id: conv.id,
        ticketId: conv.ticketId,
        pendingDrafts: store.listDrafts(conv.id).filter((d) => d.status === 'pendente' || d.status === 'falhou'),
        lastUserMessage: text,
      },
      drafts: {
        create: async (payload) => store.createDraft(conv.id, employee.id, payload),
        confirm: async (draftId) => {
          const r = await this.drafts.confirm(employee, draftId, { announce: false });
          return { draft: r.draft, ticket: r.ticket, handoff: r.handoff };
        },
      },
      handoff: { transfer: (req) => this.handoff.transfer(conv.id, req, tickets) },
    };

    try {
      const result = await runTurn({
        ports,
        history,
        userMessage: text,
        model: this.deps.model.config,
        modelLabel: this.deps.model.label,
        emit,
        ...(signal ? { signal } : {}),
      });
      const message = store.addMessage({
        conversationId: conv.id,
        role: 'assistant',
        authorName: 'Nexo Assist',
        text: result.text,
        blocks: result.blocks,
        trace: result.trace,
      });
      const latest = store.getConversation(conv.id)!;
      store.updateConversation(conv.id, {
        ticketId: result.focusTicketId ?? latest.ticketId,
        lastConfidence: result.trace.decision?.confidence ?? latest.lastConfidence,
      });
      if (latest.status === 'aguardando_atendente' && latest.handoff) {
        store.addMessage({ conversationId: conv.id, role: 'system', text: `Transferida para ${latest.handoff.queue}` });
      }
      return message;
    } catch (err) {
      if (signal?.aborted) throw err;
      console.error('[chat] falha no turno do agent', err);
      const reason = err instanceof Error ? err.message : String(err);
      const configProblem = isProviderConfigError(reason);
      // A falha fica registrada na conversa, para o histórico continuar coerente.
      return store.addMessage({
        conversationId: conv.id,
        role: 'assistant',
        authorName: 'Nexo Assist',
        text: configProblem
          ? 'O assistente está indisponível por um problema de configuração. Avise a TI no ramal 4000.'
          : 'Tive um problema para responder agora. Pode tentar de novo em instantes?',
        trace: {
          steps: [],
          decision: null,
          guardrails: [`Falha ao gerar a resposta: ${reason}`],
          model: this.deps.model.label,
          usage: null,
          latencyMs: 0,
          decisionInferred: false,
          failed: true,
        },
      });
    }
  }
}
