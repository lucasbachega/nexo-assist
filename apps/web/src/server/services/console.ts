import { isOpenStatus, toTicketView, type ChatMessage, type TicketView } from '@nexo/shared';
import { TicketsUnavailableError } from '@nexo/tickets/client';
import type { ConversationRecord, SessionRecord } from '../store';
import { analystActor, type ServiceDeps } from './deps';
import { ServiceError } from './errors';

export const CONSOLE_FILTERS = ['todas', 'para_voce', 'com_agent', 'minhas'] as const;
export type ConsoleFilter = (typeof CONSOLE_FILTERS)[number];

export interface ConversationListItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeDepartment: string;
  status: ConversationRecord['status'];
  assignedAnalystId: string | null;
  assignedAnalystName: string | null;
  ticketId: string | null;
  preview: string;
  lastMessageAt: string;
  unread: number;
  /** Linha de estado da lista, ex.: "Transferida · INC-20311". */
  statusLine: { text: string; tone: 'danger' | 'warning' | 'success' | 'info' | 'muted' };
  handoffDueAt: string | null;
  lowConfidence: number | null;
}

const LOW_CONFIDENCE = 0.5;

function needsAnalyst(c: ConversationRecord) {
  return c.status === 'aguardando_atendente';
}

function matchesFilter(c: ConversationRecord, filter: ConsoleFilter, analystId: string) {
  switch (filter) {
    case 'todas':
      return true;
    case 'para_voce':
      return needsAnalyst(c);
    case 'com_agent':
      return c.status === 'agent';
    case 'minhas':
      return c.status === 'com_analista' && c.assignedAnalystId === analystId;
  }
}

/**
 * Console do analista: fila de conversas, assumir (agent pausado),
 * responder, devolver ao agent e encerrar.
 */
export class ConsoleService {
  constructor(private readonly deps: ServiceDeps) {}

  private toItem(c: ConversationRecord, analystId: string): ConversationListItem {
    const prefix = c.lastMessageRole === 'assistant' ? 'Nexo: ' : c.lastMessageRole === 'analyst' ? 'Você: ' : '';
    let statusLine: ConversationListItem['statusLine'];
    if (c.status === 'aguardando_atendente') {
      statusLine =
        c.handoff?.trigger === 'baixa_confianca'
          ? { text: `Agent pediu ajuda · confiança ${Math.round((c.handoff.confidence ?? c.lastConfidence ?? 0) * 100)}%`, tone: 'warning' }
          : { text: `Transferida${c.ticketId ? ` · ${c.ticketId}` : ''}`, tone: 'danger' };
    } else if (c.status === 'com_analista') {
      statusLine =
        c.assignedAnalystId === analystId
          ? { text: 'Você está atendendo', tone: 'info' }
          : { text: `Com ${c.assignedAnalystName ?? 'analista'}`, tone: 'info' };
    } else if (c.status === 'encerrada') {
      statusLine = { text: c.assignedAnalystName ? `Encerrada por ${c.assignedAnalystName}` : 'Resolvida pelo agent', tone: 'muted' };
    } else if (c.lastConfidence !== null && c.lastConfidence < LOW_CONFIDENCE) {
      statusLine = { text: `Agent atendendo · confiança ${Math.round(c.lastConfidence * 100)}%`, tone: 'warning' };
    } else {
      statusLine = { text: 'Agent atendendo', tone: 'success' };
    }
    return {
      id: c.id,
      employeeId: c.employeeId,
      employeeName: c.employeeName,
      employeeDepartment: c.employeeDepartment,
      status: c.status,
      assignedAnalystId: c.assignedAnalystId,
      assignedAnalystName: c.assignedAnalystName,
      ticketId: c.ticketId,
      preview: `${prefix}${c.lastMessagePreview ?? ''}`,
      lastMessageAt: c.lastMessageAt,
      unread: c.status === 'agent' ? 0 : c.unreadForAnalyst,
      statusLine,
      handoffDueAt: c.status === 'aguardando_atendente' ? (c.handoff?.dueAt ?? null) : null,
      lowConfidence: c.lastConfidence,
    };
  }

  list(analyst: SessionRecord, filter: ConsoleFilter, query: string) {
    const all = this.deps.store.listConversations(200);
    const q = query.trim().toLowerCase();
    const searched = q
      ? all.filter(
          (c) =>
            c.employeeName.toLowerCase().includes(q) ||
            (c.ticketId ?? '').toLowerCase().includes(q) ||
            (c.lastMessagePreview ?? '').toLowerCase().includes(q),
        )
      : all;
    const counts = Object.fromEntries(
      CONSOLE_FILTERS.map((f) => [f, searched.filter((c) => matchesFilter(c, f, analyst.userId)).length]),
    ) as Record<ConsoleFilter, number>;
    // Quem espera um analista vem primeiro; depois, mais recentes.
    const items = searched
      .filter((c) => matchesFilter(c, filter, analyst.userId))
      .sort((a, b) => Number(needsAnalyst(b)) - Number(needsAnalyst(a)) || b.lastMessageAt.localeCompare(a.lastMessageAt))
      .map((c) => this.toItem(c, analyst.userId));
    return { items, counts };
  }

  private get(id: string) {
    const conv = this.deps.store.getConversation(id);
    if (!conv) throw new ServiceError(404, 'Conversa não encontrada');
    return conv;
  }

  detail(analyst: SessionRecord, id: string, afterSeq = 0) {
    const conv = this.get(id);
    if (afterSeq === 0 && conv.unreadForAnalyst > 0 && conv.assignedAnalystId === analyst.userId) {
      this.deps.store.updateConversation(id, { unreadForAnalyst: 0 });
    }
    return { conversation: this.toItem(conv, analyst.userId), handoff: conv.handoff, messages: this.deps.store.listMessages(id, afterSeq) };
  }

  async assume(analyst: SessionRecord, id: string) {
    const conv = this.get(id);
    if (conv.status === 'com_analista' && conv.assignedAnalystId !== analyst.userId) {
      throw new ServiceError(409, `${conv.assignedAnalystName ?? 'Outro analista'} já está atendendo esta conversa`);
    }
    if (conv.status === 'encerrada') throw new ServiceError(409, 'Esta conversa já foi encerrada');
    this.deps.store.updateConversation(id, {
      status: 'com_analista',
      assignedAnalystId: analyst.userId,
      assignedAnalystName: analyst.name,
      unreadForAnalyst: 0,
    });
    const msg = this.deps.store.addMessage({ conversationId: id, role: 'system', text: `${analyst.name} assumiu · agent pausado` });
    // Assumir conta como atualização da TI no chamado (zera o prazo).
    if (conv.ticketId) {
      try {
        await this.deps
          .tickets(analystActor({ id: analyst.userId, name: analyst.name }))
          .updateStatus(conv.ticketId, 'em_andamento', `Atendimento assumido por ${analyst.name} via chat`);
      } catch (err) {
        if (!(err instanceof TicketsUnavailableError)) console.error('[console] falha ao atualizar chamado', err);
      }
    }
    return msg;
  }

  sendMessage(analyst: SessionRecord, id: string, text: string): ChatMessage {
    const conv = this.get(id);
    if (conv.status !== 'com_analista' || conv.assignedAnalystId !== analyst.userId) {
      throw new ServiceError(409, 'Assuma o atendimento para responder');
    }
    const clean = text.trim();
    if (!clean) throw new ServiceError(400, 'Escreva uma mensagem');
    return this.deps.store.addMessage({
      conversationId: id,
      role: 'analyst',
      authorId: analyst.userId,
      authorName: analyst.name,
      text: clean.slice(0, 4000),
    });
  }

  returnToAgent(analyst: SessionRecord, id: string) {
    const conv = this.get(id);
    if (conv.status === 'encerrada') throw new ServiceError(409, 'Esta conversa já foi encerrada');
    if (conv.status === 'com_analista' && conv.assignedAnalystId !== analyst.userId) {
      throw new ServiceError(409, 'Só quem está atendendo pode devolver a conversa');
    }
    this.deps.store.updateConversation(id, {
      status: 'agent',
      assignedAnalystId: null,
      assignedAnalystName: null,
      handoff: null,
      unreadForAnalyst: 0,
      lastConfidence: null,
    });
    return this.deps.store.addMessage({ conversationId: id, role: 'system', text: `${analyst.name} devolveu a conversa ao Nexo Assist` });
  }

  close(analyst: SessionRecord, id: string) {
    const conv = this.get(id);
    if (conv.status === 'com_analista' && conv.assignedAnalystId !== analyst.userId) {
      throw new ServiceError(409, 'Só quem está atendendo pode encerrar a conversa');
    }
    this.deps.store.updateConversation(id, {
      status: 'encerrada',
      unreadForAnalyst: 0,
      assignedAnalystId: analyst.userId,
      assignedAnalystName: analyst.name,
    });
    return this.deps.store.addMessage({ conversationId: id, role: 'system', text: `Atendimento encerrado por ${analyst.name}` });
  }

  async employeeTickets(
    analyst: SessionRecord,
    employeeId: string,
  ): Promise<{ open: TicketView[]; closed: TicketView[]; available: boolean }> {
    try {
      const all = await this.deps
        .tickets(analystActor({ id: analyst.userId, name: analyst.name }))
        .listTickets({ requesterId: employeeId, scope: 'all' });
      const now = this.deps.clock();
      return {
        open: all.filter((t) => isOpenStatus(t.status)).map((t) => toTicketView(t, now)),
        closed: all.filter((t) => !isOpenStatus(t.status)).map((t) => toTicketView(t, now)),
        available: true,
      };
    } catch (err) {
      if (err instanceof TicketsUnavailableError) return { open: [], closed: [], available: false };
      throw err;
    }
  }
}
