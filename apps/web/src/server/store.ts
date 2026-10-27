import { randomUUID } from 'node:crypto';
import type {
  ChatMessage,
  ConversationStatus,
  ConversationView,
  DraftPayload,
  DraftStatus,
  DraftView,
  HandoffInfo,
  MessageRole,
  Role,
  TurnTrace,
  UiBlock,
} from '@nexo/shared';
import type { Db } from './db-types';

export interface SessionRecord {
  id: string;
  userId: string;
  role: Role;
  name: string;
  email: string;
  department: string;
  team: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ConversationRecord extends ConversationView {
  employeeName: string;
  employeeDepartment: string;
  lastConfidence: number | null;
  unreadForAnalyst: number;
  lastMessagePreview: string | null;
  lastMessageRole: MessageRole | null;
  lastMessageAt: string;
}

interface ConversationRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_department: string;
  status: ConversationStatus;
  assigned_analyst_id: string | null;
  assigned_analyst_name: string | null;
  ticket_id: string | null;
  handoff_json: string | null;
  last_confidence: number | null;
  unread_for_analyst: number;
  last_message_preview: string | null;
  last_message_role: MessageRole | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  seq: number;
  id: string;
  conversation_id: string;
  role: MessageRole;
  author_id: string | null;
  author_name: string | null;
  text: string;
  blocks_json: string;
  trace_json: string | null;
  session_id: string | null;
  created_at: string;
}

interface DraftRow {
  id: string;
  conversation_id: string;
  employee_id: string;
  status: DraftStatus;
  payload_json: string;
  result_ticket_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const toConversation = (r: ConversationRow): ConversationRecord => ({
  id: r.id,
  employeeId: r.employee_id,
  employeeName: r.employee_name,
  employeeDepartment: r.employee_department,
  status: r.status,
  assignedAnalystId: r.assigned_analyst_id,
  assignedAnalystName: r.assigned_analyst_name,
  ticketId: r.ticket_id,
  handoff: r.handoff_json ? (JSON.parse(r.handoff_json) as HandoffInfo) : null,
  lastConfidence: r.last_confidence,
  unreadForAnalyst: r.unread_for_analyst,
  lastMessagePreview: r.last_message_preview,
  lastMessageRole: r.last_message_role,
  lastMessageAt: r.last_message_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toDraft = (r: DraftRow): DraftView & { conversationId: string; employeeId: string } => ({
  id: r.id,
  status: r.status,
  payload: JSON.parse(r.payload_json) as DraftPayload,
  resultTicketId: r.result_ticket_id,
  error: r.error,
  conversationId: r.conversation_id,
  employeeId: r.employee_id,
});

export type ConversationPatch = Partial<{
  status: ConversationStatus;
  assignedAnalystId: string | null;
  assignedAnalystName: string | null;
  ticketId: string | null;
  handoff: HandoffInfo | null;
  lastConfidence: number | null;
  unreadForAnalyst: number;
}>;

export interface NewMessage {
  conversationId: string;
  role: MessageRole;
  authorId?: string | null;
  authorName?: string | null;
  text: string;
  blocks?: UiBlock[];
  trace?: TurnTrace | null;
  sessionId?: string | null;
}

/**
 * Repositório do app sobre SQLite. Toda a SQL do app fica aqui; os serviços
 * trabalham com tipos de domínio. Trocar por Postgres é trocar esta classe.
 */
export class AppStore {
  constructor(
    private readonly db: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private now() {
    return this.clock().toISOString();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /* --------------------------------- sessões -------------------------------- */

  createSession(s: Omit<SessionRecord, 'id' | 'createdAt' | 'expiresAt'>, ttlHours: number): SessionRecord {
    const id = randomUUID() + randomUUID().replace(/-/g, '');
    const createdAt = this.now();
    const expiresAt = new Date(this.clock().getTime() + ttlHours * 3600_000).toISOString();
    this.db
      .prepare(
        'INSERT INTO sessions (id, user_id, role, name, email, department, team, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, s.userId, s.role, s.name, s.email, s.department, s.team, createdAt, expiresAt);
    return { ...s, id, createdAt, expiresAt };
  }

  getSession(id: string): SessionRecord | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').get(id, this.now()) as
      | { id: string; user_id: string; role: Role; name: string; email: string; department: string; team: string | null; created_at: string; expires_at: string }
      | undefined;
    if (!r) return null;
    return { id: r.id, userId: r.user_id, role: r.role, name: r.name, email: r.email, department: r.department, team: r.team, createdAt: r.created_at, expiresAt: r.expires_at };
  }

  deleteSession(id: string) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  /* -------------------------------- conversas ------------------------------- */

  createConversation(e: { id: string; name: string; department: string }): ConversationRecord {
    const id = `conv_${randomUUID()}`;
    const now = this.now();
    this.db
      .prepare(
        `INSERT INTO conversations (id, employee_id, employee_name, employee_department, status, last_message_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'agent', ?, ?, ?)`,
      )
      .run(id, e.id, e.name, e.department, now, now, now);
    return this.getConversation(id) as ConversationRecord;
  }

  getConversation(id: string): ConversationRecord | null {
    const r = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined;
    return r ? toConversation(r) : null;
  }

  /** Conversa mais recente do funcionário (aberta, ou a última encerrada). */
  latestConversation(employeeId: string): ConversationRecord | null {
    const r = this.db
      .prepare(`SELECT * FROM conversations WHERE employee_id = ? ORDER BY (status != 'encerrada') DESC, created_at DESC LIMIT 1`)
      .get(employeeId) as ConversationRow | undefined;
    return r ? toConversation(r) : null;
  }

  listConversations(limit = 100): ConversationRecord[] {
    return (this.db.prepare('SELECT * FROM conversations ORDER BY last_message_at DESC LIMIT ?').all(limit) as ConversationRow[]).map(toConversation);
  }

  updateConversation(id: string, patch: ConversationPatch): ConversationRecord {
    const map: Record<keyof ConversationPatch, string> = {
      status: 'status',
      assignedAnalystId: 'assigned_analyst_id',
      assignedAnalystName: 'assigned_analyst_name',
      ticketId: 'ticket_id',
      handoff: 'handoff_json',
      lastConfidence: 'last_confidence',
      unreadForAnalyst: 'unread_for_analyst',
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [k, v] of Object.entries(patch) as Array<[keyof ConversationPatch, unknown]>) {
      if (v === undefined) continue;
      sets.push(`${map[k]} = ?`);
      values.push(k === 'handoff' ? (v ? JSON.stringify(v) : null) : v);
    }
    sets.push('updated_at = ?');
    values.push(this.now(), id);
    this.db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getConversation(id) as ConversationRecord;
  }

  /* -------------------------------- mensagens ------------------------------- */

  addMessage(m: NewMessage): ChatMessage {
    const id = `msg_${randomUUID()}`;
    const createdAt = this.now();
    const blocks = m.blocks ?? [];
    return this.transaction(() => {
      const info = this.db
        .prepare(
          `INSERT INTO messages (id, conversation_id, role, author_id, author_name, text, blocks_json, trace_json, session_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, m.conversationId, m.role, m.authorId ?? null, m.authorName ?? null, m.text, JSON.stringify(blocks), m.trace ? JSON.stringify(m.trace) : null, m.sessionId ?? null, createdAt);
      // Eventos de sistema não viram prévia na lista do console.
      const preview = m.role === 'system' ? null : m.text.replace(/\s+/g, ' ').slice(0, 140);
      const unreadBump = m.role === 'user' ? 1 : 0;
      this.db
        .prepare(
          `UPDATE conversations SET last_message_preview = COALESCE(?, last_message_preview),
             last_message_role = CASE WHEN ? IS NULL THEN last_message_role ELSE ? END,
             last_message_at = ?, updated_at = ?,
             unread_for_analyst = CASE WHEN status != 'agent' THEN unread_for_analyst + ? ELSE unread_for_analyst END
           WHERE id = ?`,
        )
        .run(preview, preview, m.role, createdAt, createdAt, unreadBump, m.conversationId);
      return {
        id,
        seq: Number(info.lastInsertRowid),
        conversationId: m.conversationId,
        role: m.role,
        authorName: m.authorName ?? null,
        text: m.text,
        blocks,
        trace: m.trace ?? null,
        createdAt,
      };
    });
  }

  /** Mensagens da conversa (opcionalmente só depois de `afterSeq`), com rascunhos atualizados. */
  listMessages(conversationId: string, afterSeq = 0): ChatMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? AND seq > ? ORDER BY seq')
      .all(conversationId, afterSeq) as MessageRow[];
    const drafts = new Map(this.listDrafts(conversationId).map((d) => [d.id, d]));
    return rows.map((r) => {
      const blocks = (JSON.parse(r.blocks_json) as UiBlock[]).map((b): UiBlock => {
        if (b.type !== 'draft') return b;
        const fresh = drafts.get(b.draft.id);
        return fresh ? { type: 'draft', draft: { id: fresh.id, status: fresh.status, payload: fresh.payload, resultTicketId: fresh.resultTicketId, error: fresh.error } } : b;
      });
      return {
        id: r.id,
        seq: r.seq,
        conversationId: r.conversation_id,
        role: r.role,
        authorName: r.author_name,
        text: r.text,
        blocks,
        trace: r.trace_json ? (JSON.parse(r.trace_json) as TurnTrace) : null,
        createdAt: r.created_at,
      };
    });
  }

  countUserMessagesInSession(sessionId: string): number {
    const r = this.db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND role = 'user'`).get(sessionId) as { n: number };
    return r.n;
  }

  countUserMessagesSince(authorId: string, sinceIso: string): number {
    const r = this.db
      .prepare(`SELECT COUNT(*) AS n FROM messages WHERE author_id = ? AND role = 'user' AND created_at >= ?`)
      .get(authorId, sinceIso) as { n: number };
    return r.n;
  }

  /* -------------------------------- rascunhos ------------------------------- */

  private nextDraftId(): string {
    const r = this.db.prepare(`UPDATE counters SET value = value + 1 WHERE name = 'draft' RETURNING value`).get() as { value: number };
    return `D-${r.value}`;
  }

  /** Cria um rascunho pendente; pendentes equivalentes anteriores são cancelados (substituídos). */
  createDraft(conversationId: string, employeeId: string, payload: DraftPayload): DraftView {
    return this.transaction(() => {
      const now = this.now();
      const pending = this.listDrafts(conversationId).filter((d) => d.status === 'pendente');
      for (const d of pending) {
        const same = d.payload.kind === 'criar' ? payload.kind === 'criar' : d.payload.ticketId === payload.ticketId;
        if (same) this.updateDraft(d.id, { status: 'cancelado', error: 'Substituído por um rascunho mais recente' });
      }
      const id = this.nextDraftId();
      this.db
        .prepare(
          `INSERT INTO drafts (id, conversation_id, employee_id, status, payload_json, created_at, updated_at) VALUES (?, ?, ?, 'pendente', ?, ?, ?)`,
        )
        .run(id, conversationId, employeeId, JSON.stringify(payload), now, now);
      return { id, status: 'pendente', payload, resultTicketId: null, error: null };
    });
  }

  getDraft(id: string) {
    const r = this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as DraftRow | undefined;
    return r ? toDraft(r) : null;
  }

  listDrafts(conversationId: string) {
    return (this.db.prepare('SELECT * FROM drafts WHERE conversation_id = ? ORDER BY created_at').all(conversationId) as DraftRow[]).map(toDraft);
  }

  updateDraft(id: string, patch: Partial<{ status: DraftStatus; payload: DraftPayload; resultTicketId: string | null; error: string | null }>) {
    const current = this.getDraft(id);
    if (!current) throw new Error(`Rascunho ${id} não encontrado`);
    this.db
      .prepare('UPDATE drafts SET status = ?, payload_json = ?, result_ticket_id = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(
        patch.status ?? current.status,
        JSON.stringify(patch.payload ?? current.payload),
        patch.resultTicketId !== undefined ? patch.resultTicketId : current.resultTicketId,
        patch.error !== undefined ? patch.error : current.error,
        this.now(),
        id,
      );
    return this.getDraft(id)!;
  }

  /**
   * Trava otimista para "confirmar": só um pedido muda pendente → processando.
   * Evita criar dois chamados com dois cliques rápidos (além da idempotência no serviço).
   */
  claimDraft(id: string): boolean {
    const r = this.db.prepare(`UPDATE drafts SET status = 'processando', updated_at = ? WHERE id = ? AND status IN ('pendente', 'falhou')`).run(this.now(), id);
    return r.changes === 1;
  }
}
