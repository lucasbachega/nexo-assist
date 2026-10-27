import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TurnEvent } from '@nexo/shared';
import { TicketsClient } from '@nexo/tickets/client';
import { createApp } from '../../../services/tickets/src/app';
import { openDatabase } from '../../../services/tickets/src/db';
import { TicketRepository } from '../../../services/tickets/src/repository';
import { seed } from '../../../services/tickets/src/seed';
import { NOW, scriptedModel } from '../../../packages/agent/test/helpers';
import { openAppDatabase } from '../src/server/db-schema';
import { AppStore, type SessionRecord } from '../src/server/store';
import { createServices } from '../src/server/services';
import { isProviderConfigError } from '../src/server/services/chat';
import { ServiceError } from '../src/server/services/errors';

type Script = Parameters<typeof scriptedModel>[0];

function setup(script: Script = [], dbFile = ':memory:') {
  const tdb = openDatabase(':memory:');
  seed(tdb, NOW);
  const repo = new TicketRepository(tdb, () => NOW);
  const app = createApp({ repo, serviceToken: 't' });
  const fetchImpl = ((i: RequestInfo | URL, init?: RequestInit) => app.fetch(new Request(i, init))) as typeof fetch;
  const store = new AppStore(openAppDatabase(dbFile), () => NOW);
  let modelCalls = 0;
  const model = scriptedModel(script, () => {
    modelCalls += 1;
  });
  const services = createServices(
    {
      store,
      tickets: (actor) => new TicketsClient({ baseUrl: 'http://t', token: 't', actor, fetchImpl, baseDelayMs: 1 }),
      clock: () => NOW,
      limits: { perSession: 30, perHour: 60 },
      model: {
        config: model,
        label: 'roteiro',
        missingKey: null,
      },
    },
    { sessionTtlHours: 12 },
  );
  const login = (userId: string, role: 'funcionario' | 'analista', name: string, team: string | null = null): SessionRecord =>
    store.createSession({ userId, role, name, email: `${userId}@nexo.com.br`, department: 'X', team }, 12);
  const events: TurnEvent[] = [];
  return { services, store, repo, login, events, emit: (e: TurnEvent) => events.push(e), calls: () => modelCalls };
}

const VPN_DRAFT: Script = [
  {
    calls: [
      {
        tool: 'preparar_chamado',
        args: {
          tipo: 'INC',
          categoria: 'Rede e VPN',
          titulo: 'VPN não conecta no notebook — erro 809',
          descricao: 'Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809. Precisa para reunião às 14h.',
          fatos_prioridade: { affected: 'somente_voce', workStopped: true, hasWorkaround: false, sameDayCommitment: true },
        },
      },
    ],
  },
  {
    calls: [
      {
        tool: 'registrar_decisao',
        args: {
          understood: 'VPN',
          intent: 'abrir_chamado',
          action: 'Rascunho',
          confidence: 0.9,
          rationale: 'Reunião hoje',
          missingInfo: [],
        },
      },
    ],
  },
  { text: 'Coloquei prioridade alta por causa da reunião. Confira antes de eu criar:' },
];

describe('chat do funcionário', () => {
  it('rascunho → confirmação cria o chamado no serviço e anuncia na conversa', async () => {
    const w = setup(VPN_DRAFT);
    const ana = w.login('emp-ana', 'funcionario', 'Ana Souza');
    await w.services.chat.send(ana, 'Só eu. Tenho reunião às 14h.', w.emit);

    const done = w.events.find((e) => e.type === 'done');
    expect(done?.type).toBe('done');
    const state = w.services.chat.state(ana);
    const draftBlock = state.messages.at(-1)?.blocks.find((b) => b.type === 'draft');
    expect(draftBlock?.type).toBe('draft');
    const draftId = draftBlock?.type === 'draft' ? draftBlock.draft.id : '';
    expect(w.repo.listTickets({ requesterId: 'emp-ana', scope: 'open' })).toHaveLength(3); // ainda não criou

    const employee = await w.services.chat.loadEmployee(ana);
    const result = await w.services.drafts.confirm(employee, draftId, { announce: true });
    expect(result.ticket?.priority).toBe('alta');
    expect(w.repo.listTickets({ requesterId: 'emp-ana', scope: 'open' })).toHaveLength(4);
    expect(result.messages[0]?.text).toMatch(/Pronto: abri o INC-\d+ com prioridade alta/);

    // Confirmar de novo é idempotente (duplo clique não duplica).
    await w.services.drafts.confirm(employee, draftId, { announce: true });
    expect(w.repo.listTickets({ requesterId: 'emp-ana', scope: 'open' })).toHaveLength(4);
    expect(w.services.chat.state(ana).conversation?.ticketId).toBe(result.ticket?.id);
  });

  it('privacidade: um funcionário não confirma nem lê a conversa de outro', async () => {
    const w = setup(VPN_DRAFT);
    const ana = w.login('emp-ana', 'funcionario', 'Ana Souza');
    await w.services.chat.send(ana, 'VPN', w.emit);
    const conv = w.services.chat.state(ana).conversation!;
    const draft = w.store.listDrafts(conv.id)[0]!;
    const carla = w.login('emp-carla', 'funcionario', 'Carla Mendes');
    const carlaEmp = await w.services.chat.loadEmployee(carla);
    await expect(w.services.drafts.confirm(carlaEmp, draft.id, { announce: true })).rejects.toMatchObject({ status: 404 });
    expect(() => w.services.chat.poll(carla, conv.id, 0)).toThrow(ServiceError);
  });

  it('transferência: agent para de responder até o analista devolver', async () => {
    const w = setup([
      {
        calls: [
          {
            tool: 'transferir_para_analista',
            args: {
              motivo: 'pedido',
              resumo: 'Funcionária quer falar com um analista sobre o INC-20311 vencido.',
              chamado_id: 'INC-20311',
            },
          },
        ],
      },
      {
        calls: [
          {
            tool: 'registrar_decisao',
            args: {
              understood: 'Quer analista',
              intent: 'falar_com_analista',
              action: 'Transferiu',
              confidence: 0.95,
              rationale: 'Pedido explícito',
              missingInfo: [],
            },
          },
        ],
      },
      { text: 'Encaminhei para o Suporte N1.' },
    ]);
    const ana = w.login('emp-ana', 'funcionario', 'Ana Souza');
    await w.services.chat.send(ana, 'Quero falar com um analista.', w.emit);
    let state = w.services.chat.state(ana);
    expect(state.conversation?.status).toBe('aguardando_atendente');
    expect(state.messages.at(-1)?.text).toBe('Transferida para Suporte N1');
    expect(w.repo.getTicket('INC-20311')?.assignedQueue).toBe('Suporte N1');

    const callsBefore = w.calls();
    w.events.length = 0;
    await w.services.chat.send(ana, 'Ainda está lento.', w.emit);
    expect(w.calls()).toBe(callsBefore); // agent não foi chamado
    expect(w.events.map((e) => e.type)).toEqual(['user_message', 'queued']);

    // Console: assume, responde, devolve.
    const rafael = w.login('ana-rafael', 'analista', 'Rafael Lima', 'Suporte N2');
    const list = w.services.console.list(rafael, 'para_voce', '');
    expect(list.items[0]?.unread).toBeGreaterThan(0);
    await w.services.console.assume(rafael, state.conversation!.id);
    expect(w.repo.getTicket('INC-20311')?.status).toBe('em_andamento'); // prazo zerado
    w.services.console.sendMessage(rafael, state.conversation!.id, 'Oi, Ana! Vou verificar o driver.');
    const juliana = w.login('ana-juliana', 'analista', 'Juliana Costa', 'Suporte N1');
    expect(() => w.services.console.sendMessage(juliana, state.conversation!.id, 'oi')).toThrow(/Assuma/);
    w.services.console.returnToAgent(rafael, state.conversation!.id);
    state = w.services.chat.state(ana);
    expect(state.conversation?.status).toBe('agent');
    expect(state.messages.map((m) => m.role)).toContain('analyst');
  });

  it('limite de 30 mensagens por sessão', async () => {
    const w = setup([]);
    const ana = w.login('emp-ana', 'funcionario', 'Ana Souza');
    const conv = w.store.createConversation({ id: 'emp-ana', name: 'Ana Souza', department: 'X' });
    for (let i = 0; i < 30; i += 1)
      w.store.addMessage({ conversationId: conv.id, role: 'user', authorId: 'emp-ana', text: `m${i}`, sessionId: ana.id });
    await expect(w.services.chat.send(ana, 'mais uma', w.emit)).rejects.toMatchObject({ status: 429 });
  });

  it('persistência: conversa e estado sobrevivem a reiniciar o app', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'nexo-')), 'app.db');
    const w1 = setup(VPN_DRAFT, file);
    const ana = w1.login('emp-ana', 'funcionario', 'Ana Souza');
    await w1.services.chat.send(ana, 'VPN com erro 809', w1.emit);
    const conv = w1.services.chat.state(ana).conversation!;
    w1.store.updateConversation(conv.id, { status: 'com_analista', assignedAnalystId: 'ana-rafael', assignedAnalystName: 'Rafael Lima' });

    // "Reinício": novo processo abre o mesmo arquivo.
    const w2 = setup([], file);
    const again = w2.store.getSession(ana.id)!;
    const state = w2.services.chat.state(again);
    expect(state.conversation?.id).toBe(conv.id);
    expect(state.conversation?.status).toBe('com_analista');
    expect(state.messages.some((m) => m.blocks.some((b) => b.type === 'draft'))).toBe(true);
  });

  it('reconhece erros de configuração do provedor do modelo', () => {
    expect(isProviderConfigError('Your credit balance is too low to access the Anthropic API.')).toBe(true);
    expect(isProviderConfigError('invalid x-api-key')).toBe(true);
    expect(isProviderConfigError('Overloaded')).toBe(false);
  });
});
