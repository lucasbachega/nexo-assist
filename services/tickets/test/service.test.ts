import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { TicketsClient, TicketsApiError, TicketsUnavailableError, type AttemptInfo } from '../src/client';
import { openDatabase } from '../src/db';
import { TicketRepository } from '../src/repository';
import { seed } from '../src/seed';

const TOKEN = 'test-token';
const NOW = new Date('2026-10-27T13:35:00Z');

function setup(opts: { flakyRate?: number; random?: () => number } = {}) {
  const db = openDatabase(':memory:');
  seed(db, NOW);
  const repo = new TicketRepository(db, () => NOW);
  const app = createApp({ repo, serviceToken: TOKEN, ...opts });
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => app.fetch(new Request(input, init))) as typeof fetch;
  const client = (actor: { id: string; role: 'funcionario' | 'analista'; name?: string }, onAttempt?: (a: AttemptInfo) => void) =>
    new TicketsClient({ baseUrl: 'http://tickets.test', token: TOKEN, actor: { name: null, ...actor }, fetchImpl, baseDelayMs: 1, maxRetryAfterMs: 5, ...(onAttempt ? { onAttempt } : {}) });
  return { app, repo, client };
}

describe('serviço de chamados', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it('exige o token de serviço', async () => {
    const res = await env.app.request('/tickets', { headers: { 'x-actor-id': 'emp-ana', 'x-actor-role': 'funcionario' } });
    expect(res.status).toBe(401);
  });

  it('lista só os chamados abertos do próprio funcionário', async () => {
    const tickets = await env.client({ id: 'emp-ana', role: 'funcionario' }).listTickets();
    expect(tickets.map((t) => t.id).sort()).toEqual(['INC-20298', 'INC-20311', 'REQ-10442']);
  });

  describe('privacidade', () => {
    it('chamado de outra pessoa responde 404, sem revelar que existe', async () => {
      const ana = env.client({ id: 'emp-ana', role: 'funcionario' });
      await expect(ana.getTicket('REQ-10460')).rejects.toMatchObject({ status: 404 });
    });

    it('funcionário não lista chamados de outro solicitante', async () => {
      const ana = env.client({ id: 'emp-ana', role: 'funcionario' });
      await expect(ana.listTickets({ requesterId: 'emp-carla' })).rejects.toBeInstanceOf(TicketsApiError);
    });

    it('funcionário não comenta em chamado alheio', async () => {
      const ana = env.client({ id: 'emp-ana', role: 'funcionario' });
      await expect(ana.addComment('REQ-10460', 'oi', 'k1')).rejects.toMatchObject({ status: 404 });
    });

    it('analista enxerga chamados de qualquer funcionário', async () => {
      const rafael = env.client({ id: 'ana-rafael', role: 'analista' });
      const { ticket } = await rafael.getTicket('REQ-10460');
      expect(ticket.requesterId).toBe('emp-carla');
    });
  });

  it('cria chamado sempre em nome do funcionário autenticado e de forma idempotente', async () => {
    const ana = env.client({ id: 'emp-ana', role: 'funcionario' });
    const input = { type: 'INC' as const, title: 'VPN não conecta — erro 809', description: 'Desde ontem a VPN mostra erro 809.', category: 'Rede e VPN' as const, priority: 'alta' as const, affected: 'somente_voce' as const, requesterId: 'emp-carla' };
    const a = await ana.createTicket(input, 'draft-D-1');
    const b = await ana.createTicket(input, 'draft-D-1');
    expect(a.id).toBe('INC-20520');
    expect(b.id).toBe(a.id);
    expect(a.requesterId).toBe('emp-ana');
  });

  it('comentário do funcionário não zera o prazo; atualização do analista zera', async () => {
    const ana = env.client({ id: 'emp-ana', role: 'funcionario' });
    const before = (await ana.getTicket('INC-20311')).ticket;
    const after = await ana.addComment('INC-20311', 'Continua lento hoje de manhã.', 'c1');
    expect(after.lastSupportUpdateAt).toBe(before.lastSupportUpdateAt);
    const rafael = env.client({ id: 'ana-rafael', role: 'analista', name: 'Rafael Lima' });
    const updated = await rafael.updateStatus('INC-20311', 'em_andamento', 'Assumido');
    expect(updated.lastSupportUpdateAt).toBe(NOW.toISOString());
  });

  it('reabre apenas chamados resolvidos', async () => {
    const ana = env.client({ id: 'emp-ana', role: 'funcionario' });
    const reopened = await ana.reopen('INC-20150', 'Bloqueou de novo.', 'r1');
    expect(reopened.status).toBe('aberto');
    await expect(ana.reopen('INC-20311', 'x', 'r2')).rejects.toMatchObject({ status: 409 });
  });

  it('busca na central de ajuda encontra o artigo do erro 809', async () => {
    const hits = await env.client({ id: 'emp-ana', role: 'funcionario' }).searchKb('vpn não conecta erro 809');
    expect(hits[0]?.article.id).toBe('KB-001');
    expect(hits[0]?.article.appliesToOs).toEqual(['Windows 10']);
  });
});

describe('resiliência do cliente com o legado instável', () => {
  it('repete após 503 e registra as tentativas', async () => {
    let calls = 0;
    // Falha nas duas primeiras chamadas, depois responde.
    const env = setup({ flakyRate: 0.5, random: () => (calls++ < 2 ? 0 : 0.99) });
    const attempts: AttemptInfo[] = [];
    const tickets = await env.client({ id: 'emp-ana', role: 'funcionario' }, (a) => attempts.push(a)).listTickets();
    expect(tickets.length).toBe(3);
    expect(attempts.map((a) => a.status)).toEqual([503, 503, 200]);
  });

  it('desiste após o máximo de tentativas com erro claro', async () => {
    const env = setup({ flakyRate: 1, random: () => 0 });
    await expect(env.client({ id: 'emp-ana', role: 'funcionario' }).listTickets()).rejects.toBeInstanceOf(TicketsUnavailableError);
  });
});
