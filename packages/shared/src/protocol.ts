import { z } from 'zod';
import type { Affected, Category, Priority, TicketStatus, TicketType } from './domain';
import type { PriorityFacts } from './priority';
import type { SlaStatus } from './sla';

/* ------------------------------------------------------------------------- */
/* Visões de chamado que vão para a interface                                 */
/* ------------------------------------------------------------------------- */

export interface TicketView {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  status: TicketStatus;
  affected: Affected;
  createdAt: string;
  lastSupportUpdateAt: string;
  sla: SlaStatus;
}

/* ------------------------------------------------------------------------- */
/* Blocos de UI anexados às respostas do agent                                */
/* ------------------------------------------------------------------------- */

export interface DraftPayload {
  kind: 'criar' | 'complementar' | 'reabrir';
  /** Para complementar/reabrir. */
  ticketId: string | null;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  priorityRule: string;
  priorityFacts: PriorityFacts | null;
  affected: Affected;
  /** Prazo da primeira resposta se fosse criado agora (ISO). */
  slaDeadline: string | null;
  slaLabel: string;
  /** Texto do complemento (kind = complementar/reabrir). */
  comment: string | null;
}

export type DraftStatus = 'pendente' | 'processando' | 'confirmado' | 'cancelado' | 'falhou';

export interface DraftView {
  id: string;
  status: DraftStatus;
  payload: DraftPayload;
  resultTicketId: string | null;
  error: string | null;
}

export type UiBlock =
  | { type: 'ticket_list'; tickets: TicketView[]; selectable: boolean }
  | { type: 'ticket_card'; ticket: TicketView }
  | { type: 'draft'; draft: DraftView }
  | { type: 'quick_replies'; question: string | null; options: string[] }
  | { type: 'kb_article'; id: string; title: string; applicable: boolean; note: string | null }
  | { type: 'handoff'; queue: string; eta: string | null; summary: string };

/* ------------------------------------------------------------------------- */
/* Transparência: o que o agent fez, entendeu e por quê                       */
/* ------------------------------------------------------------------------- */

export const INTENTS = [
  'duvida',
  'consultar_chamado',
  'complementar_chamado',
  'abrir_chamado',
  'falar_com_analista',
  'fora_do_escopo',
  'conversa',
] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_LABEL: Record<Intent, string> = {
  duvida: 'Tirar uma dúvida',
  consultar_chamado: 'Consultar um chamado',
  complementar_chamado: 'Complementar um chamado',
  abrir_chamado: 'Abrir um chamado',
  falar_com_analista: 'Falar com um analista',
  fora_do_escopo: 'Fora do escopo de TI',
  conversa: 'Conversa / esclarecimento',
};

export const DecisionSchema = z.object({
  understood: z.string().describe('O que o funcionário quer, em uma frase, nas suas palavras'),
  intent: z.enum(INTENTS),
  action: z.string().describe('A ação escolhida neste turno, ex.: "Montei o rascunho e pedi confirmação"'),
  confidence: z.number().min(0).max(1).describe('Segurança na decisão, de 0 a 1'),
  rationale: z.string().describe('Por que esta ação, citando regras do service desk e dados consultados'),
  missingInfo: z.array(z.string()).describe('Informações que ainda faltam (vazio se nada falta)'),
});
export type Decision = z.infer<typeof DecisionSchema>;

export interface TraceStep {
  id: string;
  /** Rótulo curto no passado, mostrado acima da resposta: "consultou seus chamados". */
  label: string;
  tool: string;
  status: 'ok' | 'erro';
  startedAt: string;
  durationMs: number;
  /** Tentativas no sistema de chamados (o legado às vezes fica indisponível). */
  attempts: number;
  /** Linhas legíveis com o que foi consultado/decidido. */
  details: string[];
  /** Passos internos (ex.: registrar a decisão) aparecem só no detalhe, não nos rótulos. */
  silent: boolean;
}

export interface TurnTrace {
  steps: TraceStep[];
  decision: Decision | null;
  /** Regras aplicadas pelo código depois do modelo (ex.: confiança baixa → transferência). */
  guardrails: string[];
  model: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  latencyMs: number;
  /** true quando a decisão foi inferida pelo sistema porque o modelo não a registrou. */
  decisionInferred: boolean;
  /** true quando o turno falhou (ex.: provedor do modelo fora do ar). */
  failed?: boolean;
}

/* ------------------------------------------------------------------------- */
/* Conversas                                                                  */
/* ------------------------------------------------------------------------- */

export const CONVERSATION_STATUSES = ['agent', 'aguardando_atendente', 'com_analista', 'encerrada'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type MessageRole = 'user' | 'assistant' | 'analyst' | 'system';

export interface ChatMessage {
  id: string;
  seq: number;
  conversationId: string;
  role: MessageRole;
  authorName: string | null;
  text: string;
  blocks: UiBlock[];
  trace: TurnTrace | null;
  createdAt: string;
}

export interface HandoffInfo {
  reason: string;
  /** Motivo categorizado: pedido do funcionário, crítico, vencido ou baixa confiança. */
  trigger: 'pedido' | 'critico' | 'vencido' | 'baixa_confianca' | 'outro';
  queue: string;
  summary: string;
  ticketId: string | null;
  confidence: number | null;
  at: string;
  /** Até quando o analista deve assumir (ISO). */
  dueAt: string | null;
}

export interface ConversationView {
  id: string;
  employeeId: string;
  status: ConversationStatus;
  assignedAnalystId: string | null;
  assignedAnalystName: string | null;
  ticketId: string | null;
  handoff: HandoffInfo | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------------- */
/* Eventos do streaming de um turno (SSE)                                     */
/* ------------------------------------------------------------------------- */

export type TurnEvent =
  | { type: 'user_message'; message: ChatMessage }
  | { type: 'step_start'; id: string; label: string }
  | { type: 'step_end'; step: TraceStep }
  | { type: 'text'; delta: string }
  | { type: 'block'; block: UiBlock }
  | { type: 'decision'; decision: Decision }
  | { type: 'done'; message: ChatMessage; conversation: ConversationView; usage: SessionUsage }
  | { type: 'queued'; conversation: ConversationView; usage: SessionUsage }
  | { type: 'error'; message: string; retryable: boolean };

export interface SessionUsage {
  used: number;
  limit: number;
}
