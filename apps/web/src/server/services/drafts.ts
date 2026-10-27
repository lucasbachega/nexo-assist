import { z } from 'zod';
import {
  AffectedSchema,
  CategorySchema,
  PRIORITY_LABEL,
  SLA_RULES,
  TicketTypeSchema,
  classifyPriority,
  computeDeadline,
  computeSlaStatus,
  formatDateTime,
  formatTime,
  toTicketView,
  type ChatMessage,
  type DraftPayload,
  type DraftView,
  type Employee,
  type HandoffInfo,
  type Ticket,
  type TraceStep,
  type TurnTrace,
  type UiBlock,
} from '@nexo/shared';
import { TicketsApiError, TicketsUnavailableError } from '@nexo/tickets/client';
import { employeeActor, type ServiceDeps } from './deps';
import { ServiceError } from './errors';
import type { HandoffService } from './handoff';

export const DraftEditSchema = z.object({
  title: z.string().trim().min(5).max(120).optional(),
  description: z.string().trim().min(10).max(2000).optional(),
  category: CategorySchema.optional(),
  type: TicketTypeSchema.optional(),
  affected: AffectedSchema.optional(),
  comment: z.string().trim().min(3).max(1000).optional(),
});
export type DraftEdit = z.infer<typeof DraftEditSchema>;

export interface ConfirmResult {
  draft: DraftView;
  ticket: Ticket | null;
  handoff: HandoffInfo | null;
  messages: ChatMessage[];
}

const publicDraft = (d: DraftView): DraftView => ({
  id: d.id,
  status: d.status,
  payload: d.payload,
  resultTicketId: d.resultTicketId,
  error: d.error,
});

/**
 * Rascunhos: a regra "só cria ou atualiza depois da confirmação do funcionário"
 * mora aqui. Confirmar é uma ação determinística (botão ou texto validado),
 * sem passar pelo modelo — mais barato e auditável.
 */
export class DraftService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly handoff: HandoffService,
  ) {}

  private loadOwned(employee: Employee, draftId: string) {
    const draft = this.deps.store.getDraft(draftId);
    if (!draft || draft.employeeId !== employee.id) throw new ServiceError(404, 'Rascunho não encontrado');
    return draft;
  }

  async confirm(employee: Employee, draftId: string, opts: { announce: boolean }): Promise<ConfirmResult> {
    const { store } = this.deps;
    const draft = this.loadOwned(employee, draftId);
    if (draft.status === 'confirmado') return { draft: publicDraft(draft), ticket: null, handoff: null, messages: [] };
    if (draft.status === 'cancelado') throw new ServiceError(409, 'Este rascunho foi cancelado');
    if (!store.claimDraft(draft.id)) throw new ServiceError(409, 'Este rascunho já está sendo processado');

    const client = this.deps.tickets(employeeActor(employee));
    const p = draft.payload;
    const started = Date.now();
    let ticket: Ticket;
    try {
      if (p.kind === 'criar') {
        ticket = await client.createTicket(
          { type: p.type, title: p.title, description: p.description, category: p.category, priority: p.priority, affected: p.affected },
          `draft:${draft.id}`,
        );
      } else if (p.kind === 'complementar') {
        ticket = await client.addComment(p.ticketId!, p.comment ?? '', `draft:${draft.id}`);
      } else {
        ticket = await client.reopen(p.ticketId!, p.comment ?? 'Reaberto pelo funcionário', `draft:${draft.id}`);
      }
    } catch (err) {
      const message =
        err instanceof TicketsUnavailableError
          ? 'O sistema de chamados não respondeu. Seus dados estão salvos — tente confirmar de novo.'
          : err instanceof TicketsApiError
            ? err.message
            : 'Falha inesperada ao registrar o chamado';
      store.updateDraft(draft.id, { status: 'falhou', error: message });
      throw new ServiceError(err instanceof TicketsUnavailableError ? 503 : 502, message, 'sistema_indisponivel');
    }

    const confirmed = store.updateDraft(draft.id, { status: 'confirmado', resultTicketId: ticket.id, error: null });
    store.updateConversation(draft.conversationId, { ticketId: ticket.id });

    // Regra do Anexo A: casos críticos vão direto para um analista.
    let handoff: HandoffInfo | null = null;
    if (p.kind === 'criar' && p.priority === 'critica') {
      handoff = await this.handoff.transfer(
        draft.conversationId,
        {
          trigger: 'critico',
          reason: 'Caso crítico: algo parado para uma equipe ou para a empresa',
          summary: `${p.title}. ${p.description} Afetados: ${p.affected}.`,
          ticketId: ticket.id,
          queue: 'Suporte N2',
          confidence: null,
        },
        client,
      );
    }

    const messages: ChatMessage[] = [];
    if (opts.announce) {
      messages.push(store.addMessage(this.buildAnnouncement(draft.conversationId, confirmed, ticket, handoff, Date.now() - started)));
      if (handoff) {
        messages.push(
          store.addMessage({ conversationId: draft.conversationId, role: 'system', text: `Transferida para ${handoff.queue}` }),
        );
      }
    }
    return { draft: publicDraft(confirmed), ticket, handoff, messages };
  }

  private buildAnnouncement(conversationId: string, draft: DraftView, ticket: Ticket, handoff: HandoffInfo | null, durationMs: number) {
    const p = draft.payload;
    const now = this.deps.clock();
    const sla = computeSlaStatus(ticket, now);
    const deadline = sla.deadline
      ? formatDateTime(sla.deadline).slice(0, 6) === formatDateTime(now).slice(0, 6)
        ? formatTime(sla.deadline)
        : formatDateTime(sla.deadline)
      : null;
    let text: string;
    let label: string;
    if (p.kind === 'criar') {
      label = 'criou o chamado';
      text = `Pronto: abri o ${ticket.id} com prioridade ${PRIORITY_LABEL[ticket.priority].toLowerCase()}.${deadline ? ` Um analista responde até ${deadline}.` : ''}`;
    } else if (p.kind === 'complementar') {
      label = 'atualizou o chamado';
      text = `Pronto: adicionei a informação ao ${ticket.id}. O analista responsável vai ver no histórico.`;
    } else {
      label = 'reabriu o chamado';
      text = `Pronto: reabri o ${ticket.id}. O prazo de resposta recomeçou${deadline ? ` — resposta até ${deadline}` : ''}.`;
    }
    if (handoff) text += ` Como é um caso crítico, já chamei um analista do ${handoff.queue}.`;

    const steps: TraceStep[] = [
      {
        id: 's1',
        label,
        tool: 'confirmar_rascunho',
        status: 'ok',
        startedAt: new Date(now.getTime() - durationMs).toISOString(),
        durationMs,
        attempts: 1,
        details: [`Confirmado pelo funcionário no botão Confirmar (rascunho ${draft.id})`, `${ticket.id} · ${ticket.title}`],
        silent: false,
      },
    ];
    if (handoff) {
      steps.push({
        id: 's2',
        label: `transferiu para ${handoff.queue}`,
        tool: 'regra_critico',
        status: 'ok',
        startedAt: now.toISOString(),
        durationMs: 0,
        attempts: 1,
        details: ['Regra do service desk: casos críticos são transferidos para um analista'],
        silent: false,
      });
    }
    const trace: TurnTrace = {
      steps,
      decision: {
        understood: 'O funcionário conferiu e confirmou o rascunho',
        intent: p.kind === 'criar' ? 'abrir_chamado' : 'complementar_chamado',
        action: label.charAt(0).toUpperCase() + label.slice(1),
        confidence: 1,
        rationale:
          'Ação executada pelo sistema, não pelo modelo: a regra exige confirmação explícita antes de criar ou atualizar chamados, e ela veio do botão Confirmar.',
        missingInfo: [],
      },
      guardrails: handoff ? ['Prioridade crítica → transferência automática para o Suporte N2'] : [],
      model: null,
      usage: null,
      latencyMs: durationMs,
      decisionInferred: false,
    };
    const blocks: UiBlock[] = [{ type: 'ticket_card', ticket: toTicketView(ticket, now) }];
    if (handoff) blocks.push({ type: 'handoff', queue: handoff.queue, eta: handoff.dueAt, summary: handoff.summary });
    return { conversationId, role: 'assistant' as const, authorName: 'Nexo Assist', text, blocks, trace };
  }

  cancel(employee: Employee, draftId: string): { draft: DraftView; message: ChatMessage } {
    const draft = this.loadOwned(employee, draftId);
    if (draft.status !== 'pendente' && draft.status !== 'falhou') throw new ServiceError(409, 'Este rascunho não pode mais ser cancelado');
    const updated = this.deps.store.updateDraft(draft.id, { status: 'cancelado', error: null });
    const message = this.deps.store.addMessage({
      conversationId: draft.conversationId,
      role: 'assistant',
      authorName: 'Nexo Assist',
      text:
        draft.payload.kind === 'criar'
          ? 'Tudo bem, não abri o chamado. Se mudar de ideia ou quiser ajustar algo, é só me dizer.'
          : `Tudo bem, não alterei o ${draft.payload.ticketId}.`,
      trace: {
        steps: [],
        decision: {
          understood: 'O funcionário cancelou o rascunho',
          intent: 'conversa',
          action: 'Descartou o rascunho sem criar nada',
          confidence: 1,
          rationale: 'Cancelamento feito pelo botão Cancelar; nenhum chamado foi criado ou alterado.',
          missingInfo: [],
        },
        guardrails: [],
        model: null,
        usage: null,
        latencyMs: 0,
        decisionInferred: false,
      },
    });
    return { draft: publicDraft(updated), message };
  }

  /** Edição pelo botão Editar. Mudar "quem é afetado" ou o tipo recalcula prioridade e prazo. */
  edit(employee: Employee, draftId: string, patch: DraftEdit): DraftView {
    const draft = this.loadOwned(employee, draftId);
    if (draft.status !== 'pendente' && draft.status !== 'falhou') throw new ServiceError(409, 'Só rascunhos pendentes podem ser editados');
    const p = draft.payload;
    const next: DraftPayload = {
      ...p,
      title: patch.title ?? p.title,
      description: patch.description ?? p.description,
      category: patch.category ?? p.category,
      type: patch.type ?? p.type,
      affected: patch.affected ?? p.affected,
      comment: patch.comment ?? p.comment,
    };
    if (next.kind === 'criar' && p.priorityFacts && (patch.affected || patch.type)) {
      const facts = { ...p.priorityFacts, affected: next.affected };
      const decision = classifyPriority(next.type, facts);
      const deadline = computeDeadline(this.deps.clock(), decision.priority);
      next.priorityFacts = facts;
      next.priority = decision.priority;
      next.priorityRule = decision.rule;
      next.slaDeadline = deadline.toISOString();
      next.slaLabel = SLA_RULES[decision.priority].label;
    }
    return publicDraft(this.deps.store.updateDraft(draft.id, { payload: next, status: 'pendente', error: null }));
  }
}
