import {
  OPEN_STATUSES,
  type CreateTicketInput,
  type Employee,
  type KbArticle,
  type Ticket,
  type TicketEvent,
  type TicketStatus,
} from '@nexo/shared';
import type { Db } from './db';

interface TicketRow {
  id: string;
  type: Ticket['type'];
  title: string;
  description: string;
  category: Ticket['category'];
  priority: Ticket['priority'];
  status: TicketStatus;
  affected: Ticket['affected'];
  requester_id: string;
  assigned_queue: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  last_support_update_at: string;
  resolved_at: string | null;
}

const toTicket = (r: TicketRow): Ticket => ({
  id: r.id,
  type: r.type,
  title: r.title,
  description: r.description,
  category: r.category,
  priority: r.priority,
  status: r.status,
  affected: r.affected,
  requesterId: r.requester_id,
  assignedQueue: r.assigned_queue,
  assignedTo: r.assigned_to,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastSupportUpdateAt: r.last_support_update_at,
  resolvedAt: r.resolved_at,
});

export type EventAuthor = TicketEvent['author'];

export class TicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Chamado ${id} não encontrado`);
  }
}

export class InvalidTransitionError extends Error {}

/**
 * Acesso a dados do serviço de chamados. Não conhece HTTP nem autorização:
 * quem decide o que cada ator pode ver é a camada de rotas.
 */
export class TicketRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private now(): string {
    return this.clock().toISOString();
  }

  findEmployeeByEmail(email: string): Employee | null {
    const row = this.db.prepare('SELECT * FROM employees WHERE email = ?').get(email.trim()) as Employee | undefined;
    return row ?? null;
  }

  getEmployee(id: string): Employee | null {
    return (this.db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as Employee | undefined) ?? null;
  }

  listEmployees(): Employee[] {
    return this.db.prepare('SELECT * FROM employees ORDER BY name').all() as Employee[];
  }

  listTickets(filter: { requesterId?: string; scope: 'open' | 'all' }): Ticket[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.requesterId) {
      where.push('requester_id = ?');
      params.push(filter.requesterId);
    }
    if (filter.scope === 'open') {
      where.push(`status IN (${OPEN_STATUSES.map(() => '?').join(',')})`);
      params.push(...OPEN_STATUSES);
    }
    const sql = `SELECT * FROM tickets ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC LIMIT 100`;
    return (this.db.prepare(sql).all(...params) as TicketRow[]).map(toTicket);
  }

  getTicket(id: string): Ticket | null {
    const row = this.db.prepare('SELECT * FROM tickets WHERE id = ? COLLATE NOCASE').get(id) as TicketRow | undefined;
    return row ? toTicket(row) : null;
  }

  listEvents(ticketId: string): TicketEvent[] {
    const rows = this.db.prepare('SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY id').all(ticketId) as Array<{
      id: number;
      ticket_id: string;
      at: string;
      author: EventAuthor;
      author_name: string | null;
      kind: TicketEvent['kind'];
      text: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      at: r.at,
      author: r.author,
      authorName: r.author_name,
      kind: r.kind,
      text: r.text,
    }));
  }

  private nextId(type: Ticket['type']): string {
    const row = this.db.prepare('SELECT next_value FROM sequences WHERE type = ?').get(type) as { next_value: number } | undefined;
    const value = row?.next_value ?? (type === 'INC' ? 20500 : 10450);
    this.db
      .prepare('INSERT INTO sequences (type, next_value) VALUES (?, ?) ON CONFLICT(type) DO UPDATE SET next_value = excluded.next_value')
      .run(type, value + 1);
    return `${type}-${value}`;
  }

  private addEvent(
    ticketId: string,
    author: EventAuthor,
    authorName: string | null,
    kind: TicketEvent['kind'],
    text: string,
    at = this.now(),
  ) {
    this.db
      .prepare('INSERT INTO ticket_events (ticket_id, at, author, author_name, kind, text) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ticketId, at, author, authorName, kind, text);
  }

  /** Retorna o chamado já criado por esta chave, se houver (retry seguro). */
  private byIdempotencyKey(key: string | null): Ticket | null {
    if (!key) return null;
    const row = this.db.prepare('SELECT ticket_id FROM idempotency_keys WHERE key = ?').get(key) as { ticket_id: string } | undefined;
    return row ? this.getTicket(row.ticket_id) : null;
  }

  private remember(key: string | null, ticketId: string) {
    if (!key) return;
    this.db.prepare('INSERT OR IGNORE INTO idempotency_keys (key, ticket_id, created_at) VALUES (?, ?, ?)').run(key, ticketId, this.now());
  }

  createTicket(
    input: CreateTicketInput,
    author: { kind: EventAuthor; name: string | null },
    idempotencyKey: string | null,
  ): { ticket: Ticket; replayed: boolean } {
    return this.db.transaction(() => {
      const existing = this.byIdempotencyKey(idempotencyKey);
      if (existing) return { ticket: existing, replayed: true };
      const id = this.nextId(input.type);
      const now = this.now();
      this.db
        .prepare(
          `INSERT INTO tickets (id, type, title, description, category, priority, status, affected, requester_id,
             assigned_queue, assigned_to, created_at, updated_at, last_support_update_at, resolved_at)
           VALUES (?, ?, ?, ?, ?, ?, 'aberto', ?, ?, NULL, NULL, ?, ?, ?, NULL)`,
        )
        .run(
          id,
          input.type,
          input.title,
          input.description,
          input.category,
          input.priority,
          input.affected,
          input.requesterId,
          now,
          now,
          now,
        );
      this.addEvent(id, author.kind, author.name, 'criado', 'Chamado aberto', now);
      this.remember(idempotencyKey, id);
      return { ticket: this.getTicket(id) as Ticket, replayed: false };
    })();
  }

  addComment(id: string, comment: { author: EventAuthor; authorName: string | null; text: string }, idempotencyKey: string | null): Ticket {
    return this.db.transaction(() => {
      const replay = this.byIdempotencyKey(idempotencyKey);
      if (replay) return replay;
      const ticket = this.getTicket(id);
      if (!ticket) throw new TicketNotFoundError(id);
      const now = this.now();
      const fromSupport = comment.author === 'analista';
      // Resposta do funcionário devolve o chamado para a TI.
      const status: TicketStatus = !fromSupport && ticket.status === 'aguardando_usuario' ? 'em_andamento' : ticket.status;
      this.db
        .prepare(
          `UPDATE tickets SET updated_at = ?, status = ?, last_support_update_at = CASE WHEN ? THEN ? ELSE last_support_update_at END WHERE id = ?`,
        )
        .run(now, status, fromSupport ? 1 : 0, now, ticket.id);
      this.addEvent(ticket.id, comment.author, comment.authorName, 'comentario', comment.text, now);
      this.remember(idempotencyKey, ticket.id);
      return this.getTicket(ticket.id) as Ticket;
    })();
  }

  reopen(id: string, comment: { author: EventAuthor; authorName: string | null; text: string }, idempotencyKey: string | null): Ticket {
    return this.db.transaction(() => {
      const replay = this.byIdempotencyKey(idempotencyKey);
      if (replay) return replay;
      const ticket = this.getTicket(id);
      if (!ticket) throw new TicketNotFoundError(id);
      if (ticket.status !== 'resolvido') throw new InvalidTransitionError('Só chamados resolvidos podem ser reabertos');
      const now = this.now();
      // Reabrir inicia um novo ciclo de prazo.
      this.db
        .prepare(`UPDATE tickets SET status = 'aberto', resolved_at = NULL, updated_at = ?, last_support_update_at = ? WHERE id = ?`)
        .run(now, now, ticket.id);
      this.addEvent(ticket.id, comment.author, comment.authorName, 'reaberto', comment.text, now);
      this.remember(idempotencyKey, ticket.id);
      return this.getTicket(ticket.id) as Ticket;
    })();
  }

  transfer(id: string, input: { queue: string; summary: string; authorName: string | null }): Ticket {
    return this.db.transaction(() => {
      const ticket = this.getTicket(id);
      if (!ticket) throw new TicketNotFoundError(id);
      const now = this.now();
      this.db
        .prepare(`UPDATE tickets SET status = 'aguardando_analista', assigned_queue = ?, updated_at = ? WHERE id = ?`)
        .run(input.queue, now, ticket.id);
      this.addEvent(ticket.id, 'agent', input.authorName, 'transferencia', `Transferido para ${input.queue}: ${input.summary}`, now);
      return this.getTicket(ticket.id) as Ticket;
    })();
  }

  /** Ação de analista: muda status e conta como atualização da TI (zera o prazo). */
  updateStatus(id: string, input: { status: TicketStatus; analystName: string; note: string | null }): Ticket {
    return this.db.transaction(() => {
      const ticket = this.getTicket(id);
      if (!ticket) throw new TicketNotFoundError(id);
      const now = this.now();
      const resolvedAt = input.status === 'resolvido' ? now : null;
      this.db
        .prepare(`UPDATE tickets SET status = ?, assigned_to = ?, updated_at = ?, last_support_update_at = ?, resolved_at = ? WHERE id = ?`)
        .run(input.status, input.analystName, now, now, resolvedAt, ticket.id);
      this.addEvent(ticket.id, 'analista', input.analystName, 'status', input.note ?? `Status alterado para ${input.status}`, now);
      return this.getTicket(ticket.id) as Ticket;
    })();
  }

  listArticles(): KbArticle[] {
    const rows = this.db.prepare('SELECT * FROM kb_articles ORDER BY id').all() as Array<{
      id: string;
      title: string;
      body: string;
      category: KbArticle['category'];
      tags: string;
      applies_to_os: string;
      updated_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category,
      tags: JSON.parse(r.tags) as string[],
      appliesToOs: JSON.parse(r.applies_to_os) as string[],
      updatedAt: r.updated_at,
    }));
  }

  isEmpty(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM employees').get() as { n: number };
    return row.n === 0;
  }
}
