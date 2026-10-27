import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { ActorRoleSchema, CreateTicketInputSchema, TicketStatusSchema, type ActorRole } from '@nexo/shared';
import { InvalidTransitionError, TicketNotFoundError, type TicketRepository } from './repository';
import { KbIndex } from './kb-search';

export interface AppOptions {
  repo: TicketRepository;
  serviceToken: string;
  /** Probabilidade (0–1) de uma requisição falhar com 503, simulando o legado instável. */
  flakyRate?: number;
  maxLatencyMs?: number;
  random?: () => number;
}

interface Actor {
  id: string;
  role: ActorRole;
  name: string | null;
}

type Env = { Variables: { actor: Actor } };

const CreateBody = CreateTicketInputSchema.extend({ requesterId: z.string().optional() });
const CommentBody = z.object({ text: z.string().trim().min(1).max(2000) });
const TransferBody = z.object({ queue: z.string().min(1), summary: z.string().trim().min(1).max(2000) });
const StatusBody = z.object({ status: TicketStatusSchema, note: z.string().max(2000).nullable().optional() });

async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  const json: unknown = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: `Dados inválidos: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
    });
  }
  return parsed.data;
}

/**
 * API HTTP do serviço de chamados. É um processo separado do agent, como seria
 * o sistema legado real. Autorização por ator: um funcionário só enxerga os
 * próprios chamados — chamados de outra pessoa respondem 404 (nem a existência vaza).
 */
export function createApp(opts: AppOptions): Hono<Env> {
  const { repo } = opts;
  const random = opts.random ?? Math.random;
  const app = new Hono<Env>();
  let kb = new KbIndex(repo.listArticles());

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('*', async (c, next) => {
    const auth = c.req.header('authorization');
    if (auth !== `Bearer ${opts.serviceToken}`) throw new HTTPException(401, { message: 'Token de serviço inválido' });
    const role = ActorRoleSchema.safeParse(c.req.header('x-actor-role'));
    const id = c.req.header('x-actor-id');
    if (!role.success || !id) throw new HTTPException(400, { message: 'Ator não informado' });
    if (role.data === 'sistema' && !c.req.path.startsWith('/directory/')) {
      throw new HTTPException(403, { message: 'O ator de sistema só acessa o diretório' });
    }
    const rawName = c.req.header('x-actor-name');
    c.set('actor', { id, role: role.data, name: rawName ? decodeURIComponent(rawName) : null });
    await next();
  });

  // Simulação do legado instável.
  app.use('*', async (c, next) => {
    const max = opts.maxLatencyMs ?? 0;
    if (max > 0) await new Promise((r) => setTimeout(r, Math.floor(random() * max)));
    if ((opts.flakyRate ?? 0) > 0 && random() < (opts.flakyRate ?? 0)) {
      return c.json({ error: 'Sistema de chamados temporariamente indisponível' }, 503, { 'retry-after': '1' });
    }
    await next();
  });

  const requireAnalyst = (c: Context<Env>) => {
    if (c.get('actor').role !== 'analista') throw new HTTPException(403, { message: 'Apenas analistas' });
  };

  /** Carrega um chamado respeitando a privacidade do ator. */
  const loadVisibleTicket = (c: Context<Env>, id: string) => {
    const actor = c.get('actor');
    const ticket = repo.getTicket(id);
    if (!ticket || (actor.role === 'funcionario' && ticket.requesterId !== actor.id)) {
      throw new HTTPException(404, { message: `Chamado ${id} não encontrado` });
    }
    return ticket;
  };

  app.get('/directory/employees', (c) => {
    const email = c.req.query('email');
    if (email) {
      if (c.get('actor').role === 'funcionario') throw new HTTPException(403, { message: 'Busca por e-mail não permitida' });
      const emp = repo.findEmployeeByEmail(email);
      if (!emp) throw new HTTPException(404, { message: 'Funcionário não encontrado' });
      return c.json(emp);
    }
    requireAnalyst(c);
    return c.json(repo.listEmployees());
  });

  app.get('/directory/employees/:id', (c) => {
    const actor = c.get('actor');
    const id = c.req.param('id');
    if (actor.role !== 'analista' && actor.id !== id) throw new HTTPException(404, { message: 'Funcionário não encontrado' });
    const emp = repo.getEmployee(id);
    if (!emp) throw new HTTPException(404, { message: 'Funcionário não encontrado' });
    return c.json(emp);
  });

  app.get('/tickets', (c) => {
    const actor = c.get('actor');
    const scope = c.req.query('scope') === 'all' ? 'all' : 'open';
    const requested = c.req.query('requesterId');
    if (actor.role === 'funcionario' && requested && requested !== actor.id) {
      throw new HTTPException(403, { message: 'Funcionários só consultam os próprios chamados' });
    }
    const requesterId = actor.role === 'funcionario' ? actor.id : requested;
    return c.json(repo.listTickets({ scope, ...(requesterId ? { requesterId } : {}) }));
  });

  app.get('/tickets/:id', (c) => {
    const ticket = loadVisibleTicket(c, c.req.param('id'));
    return c.json({ ticket, events: repo.listEvents(ticket.id) });
  });

  app.post('/tickets', async (c) => {
    const actor = c.get('actor');
    const body = await parseBody(c, CreateBody);
    const requesterId = actor.role === 'funcionario' ? actor.id : body.requesterId;
    if (!requesterId || !repo.getEmployee(requesterId)) throw new HTTPException(400, { message: 'Solicitante inválido' });
    const { ticket, replayed } = repo.createTicket(
      { ...body, requesterId },
      { kind: actor.role === 'analista' ? 'analista' : 'agent', name: actor.name },
      c.req.header('idempotency-key') ?? null,
    );
    return c.json(ticket, replayed ? 200 : 201);
  });

  app.post('/tickets/:id/comments', async (c) => {
    const actor = c.get('actor');
    const ticket = loadVisibleTicket(c, c.req.param('id'));
    const body = await parseBody(c, CommentBody);
    const updated = repo.addComment(
      ticket.id,
      { author: actor.role === 'analista' ? 'analista' : 'funcionario', authorName: actor.name, text: body.text },
      c.req.header('idempotency-key') ?? null,
    );
    return c.json(updated);
  });

  app.post('/tickets/:id/reopen', async (c) => {
    const actor = c.get('actor');
    const ticket = loadVisibleTicket(c, c.req.param('id'));
    const body = await parseBody(c, CommentBody);
    const updated = repo.reopen(
      ticket.id,
      { author: actor.role === 'analista' ? 'analista' : 'funcionario', authorName: actor.name, text: body.text },
      c.req.header('idempotency-key') ?? null,
    );
    return c.json(updated);
  });

  app.post('/tickets/:id/transfer', async (c) => {
    const ticket = loadVisibleTicket(c, c.req.param('id'));
    const body = await parseBody(c, TransferBody);
    return c.json(repo.transfer(ticket.id, { ...body, authorName: 'Nexo Assist' }));
  });

  app.post('/tickets/:id/status', async (c) => {
    requireAnalyst(c);
    const ticket = loadVisibleTicket(c, c.req.param('id'));
    const body = await parseBody(c, StatusBody);
    return c.json(
      repo.updateStatus(ticket.id, { status: body.status, analystName: c.get('actor').name ?? 'Analista', note: body.note ?? null }),
    );
  });

  app.get('/kb/search', (c) => {
    const q = c.req.query('q') ?? '';
    const limit = Math.min(Number(c.req.query('limit') ?? 3) || 3, 10);
    return c.json(kb.search(q, limit));
  });

  app.get('/kb/articles', (c) => c.json(repo.listArticles()));

  app.post('/kb/reindex', (c) => {
    requireAnalyst(c);
    kb = new KbIndex(repo.listArticles());
    return c.json({ ok: true });
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof TicketNotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof InvalidTransitionError) return c.json({ error: err.message }, 409);
    console.error('[tickets] erro inesperado', err);
    return c.json({ error: 'Erro interno do serviço de chamados' }, 500);
  });

  return app;
}
