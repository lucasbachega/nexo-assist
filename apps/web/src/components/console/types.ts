import type { ChatMessage, HandoffInfo, TicketView } from '@nexo/shared';

export type ConsoleFilter = 'todas' | 'para_voce' | 'com_agent' | 'minhas';

/** Espelha ConversationListItem do servidor (sem importar código de servidor no cliente). */
export interface ConversationItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeDepartment: string;
  status: 'agent' | 'aguardando_atendente' | 'com_analista' | 'encerrada';
  assignedAnalystId: string | null;
  assignedAnalystName: string | null;
  ticketId: string | null;
  preview: string;
  lastMessageAt: string;
  unread: number;
  statusLine: { text: string; tone: 'danger' | 'warning' | 'success' | 'info' | 'muted' };
  handoffDueAt: string | null;
  lowConfidence: number | null;
}

export interface ListResponse {
  items: ConversationItem[];
  counts: Record<ConsoleFilter, number>;
}

export interface DetailResponse {
  conversation: ConversationItem;
  handoff: HandoffInfo | null;
  messages: ChatMessage[];
}

export interface TicketsResponse {
  open: TicketView[];
  closed: TicketView[];
  available: boolean;
}
