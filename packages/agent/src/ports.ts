import type { DraftPayload, DraftView, Employee, HandoffInfo, SupportQueue, Ticket } from '@nexo/shared';
import type { TicketsClient } from '@nexo/tickets/client';

/**
 * Portas do agent: tudo o que ele precisa do mundo externo, injetado por quem o
 * executa (o app web). O agent não conhece banco de dados nem HTTP de entrada,
 * e a identidade do funcionário nunca vem do modelo — vem da sessão autenticada.
 */
export interface AgentPorts {
  employee: Employee;
  /** Cliente do serviço de chamados já autenticado como este funcionário. */
  tickets: TicketsClient;
  drafts: DraftPort;
  handoff: HandoffPort;
  conversation: ConversationContext;
  now: () => Date;
}

export interface ConversationContext {
  id: string;
  /** Chamado em foco nesta conversa (último consultado/criado), se houver. */
  ticketId: string | null;
  pendingDrafts: DraftView[];
  /** Última mensagem do funcionário — usada pela trava de confirmação por texto. */
  lastUserMessage: string;
}

export interface DraftPort {
  /** Persiste um rascunho pendente. Rascunhos pendentes anteriores do mesmo tipo são substituídos. */
  create(payload: DraftPayload): Promise<DraftView>;
  /** Executa o rascunho (cria/atualiza/reabre) — mesmo caminho do botão Confirmar. */
  confirm(draftId: string): Promise<{ draft: DraftView; ticket: Ticket | null; handoff: HandoffInfo | null }>;
}

export interface HandoffRequest {
  trigger: HandoffInfo['trigger'];
  reason: string;
  summary: string;
  ticketId: string | null;
  queue: SupportQueue;
  confidence: number | null;
}

export interface HandoffPort {
  transfer(request: HandoffRequest): Promise<HandoffInfo>;
}
