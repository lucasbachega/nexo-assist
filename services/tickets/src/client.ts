import type {
  CreateTicketInput,
  Employee,
  KbArticle,
  KbSearchHit,
  Role,
  Ticket,
  TicketEvent,
  TicketStatus,
} from '@nexo/shared';

/**
 * Cliente tipado do serviço de chamados, com resiliência para o legado instável:
 *  - timeout por tentativa;
 *  - retry com backoff exponencial + jitter;
 *  - 503 é sempre seguro de repetir (o legado recusou antes de processar);
 *  - timeout/erro de rede só é repetido em operações idempotentes
 *    (GET ou POST com Idempotency-Key), para nunca duplicar um chamado.
 */

export interface TicketsActor {
  id: string;
  role: Role;
  name: string | null;
}

export interface AttemptInfo {
  method: string;
  path: string;
  attempt: number;
  ok: boolean;
  status: number | null;
  error: string | null;
  durationMs: number;
}

export interface TicketsClientOptions {
  baseUrl: string;
  token: string;
  actor: TicketsActor;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Teto para respeitar o header Retry-After (padrão 1 s). */
  maxRetryAfterMs?: number;
  fetchImpl?: typeof fetch;
  onAttempt?: (info: AttemptInfo) => void;
  signal?: AbortSignal;
}

export class TicketsApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TicketsApiError';
  }
}

export class TicketsUnavailableError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = 'TicketsUnavailableError';
  }
}

export const isNotFound = (e: unknown) => e instanceof TicketsApiError && e.status === 404;

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TicketsClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: TicketsClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Mesmo cliente com outro observador (ex.: por turno do agent, para a trilha). */
  withObserver(onAttempt: (info: AttemptInfo) => void): TicketsClient {
    return new TicketsClient({ ...this.opts, onAttempt });
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    init: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    const maxAttempts = this.opts.maxAttempts ?? 3;
    const baseDelay = this.opts.baseDelayMs ?? 250;
    const idempotent = method === 'GET' || Boolean(init.idempotencyKey);
    let lastError = 'falha desconhecida';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const started = Date.now();
      const timeout = AbortSignal.timeout(this.opts.timeoutMs ?? 4000);
      const signal = this.opts.signal ? AbortSignal.any([timeout, this.opts.signal]) : timeout;
      const headers: Record<string, string> = {
        authorization: `Bearer ${this.opts.token}`,
        'x-actor-id': this.opts.actor.id,
        'x-actor-role': this.opts.actor.role,
        accept: 'application/json',
      };
      if (this.opts.actor.name) headers['x-actor-name'] = encodeURIComponent(this.opts.actor.name);
      if (init.body !== undefined) headers['content-type'] = 'application/json';
      if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;

      let retryable = false;
      let retryAfterMs = 0;
      try {
        const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
          method,
          headers,
          body: init.body !== undefined ? JSON.stringify(init.body) : null,
          signal,
        });
        const durationMs = Date.now() - started;
        if (res.ok) {
          this.opts.onAttempt?.({ method, path, attempt, ok: true, status: res.status, error: null, durationMs });
          return (await res.json()) as T;
        }
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        lastError = payload.error ?? `HTTP ${res.status}`;
        this.opts.onAttempt?.({ method, path, attempt, ok: false, status: res.status, error: lastError, durationMs });
        if (!RETRYABLE_STATUS.has(res.status)) throw new TicketsApiError(res.status, lastError);
        // 503 = recusado antes de processar → sempre seguro repetir.
        retryable = res.status === 503 || idempotent;
        retryAfterMs = Math.min(Number(res.headers.get('retry-after') ?? 0) * 1000, this.opts.maxRetryAfterMs ?? 1000);
      } catch (err) {
        if (err instanceof TicketsApiError) throw err;
        if (this.opts.signal?.aborted) throw err;
        lastError = err instanceof Error && err.name === 'TimeoutError' ? 'tempo esgotado' : 'erro de rede';
        this.opts.onAttempt?.({ method, path, attempt, ok: false, status: null, error: lastError, durationMs: Date.now() - started });
        retryable = idempotent;
      }

      if (!retryable || attempt === maxAttempts) break;
      const backoff = baseDelay * 2 ** (attempt - 1);
      await sleep(Math.max(retryAfterMs, backoff) * (0.5 + Math.random() * 0.5));
    }
    throw new TicketsUnavailableError(`Sistema de chamados indisponível (${lastError})`, maxAttempts);
  }

  /* -------------------------------- diretório ------------------------------- */

  findEmployeeByEmail(email: string) {
    return this.request<Employee>('GET', `/directory/employees?email=${encodeURIComponent(email)}`);
  }
  getEmployee(id: string) {
    return this.request<Employee>('GET', `/directory/employees/${encodeURIComponent(id)}`);
  }
  listEmployees() {
    return this.request<Employee[]>('GET', '/directory/employees');
  }

  /* --------------------------------- chamados -------------------------------- */

  listTickets(params: { requesterId?: string; scope?: 'open' | 'all' } = {}) {
    const q = new URLSearchParams();
    q.set('scope', params.scope ?? 'open');
    if (params.requesterId) q.set('requesterId', params.requesterId);
    return this.request<Ticket[]>('GET', `/tickets?${q.toString()}`);
  }
  getTicket(id: string) {
    return this.request<{ ticket: Ticket; events: TicketEvent[] }>('GET', `/tickets/${encodeURIComponent(id)}`);
  }
  createTicket(input: Omit<CreateTicketInput, 'requesterId'> & { requesterId?: string }, idempotencyKey: string) {
    return this.request<Ticket>('POST', '/tickets', { body: input, idempotencyKey });
  }
  addComment(id: string, text: string, idempotencyKey: string) {
    return this.request<Ticket>('POST', `/tickets/${encodeURIComponent(id)}/comments`, { body: { text }, idempotencyKey });
  }
  reopen(id: string, text: string, idempotencyKey: string) {
    return this.request<Ticket>('POST', `/tickets/${encodeURIComponent(id)}/reopen`, { body: { text }, idempotencyKey });
  }
  transfer(id: string, queue: string, summary: string) {
    return this.request<Ticket>('POST', `/tickets/${encodeURIComponent(id)}/transfer`, { body: { queue, summary } });
  }
  updateStatus(id: string, status: TicketStatus, note: string | null) {
    return this.request<Ticket>('POST', `/tickets/${encodeURIComponent(id)}/status`, { body: { status, note } });
  }

  /* ----------------------------- central de ajuda ----------------------------- */

  searchKb(query: string, limit = 3) {
    return this.request<KbSearchHit[]>('GET', `/kb/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }
  listArticles() {
    return this.request<KbArticle[]>('GET', '/kb/articles');
  }
}
