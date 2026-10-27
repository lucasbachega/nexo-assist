import { describe, expect, it } from 'vitest';
import { runTurn, toModelMessages, isTextConfirmation } from '../src';
import { createWorld, scriptedModel } from './helpers';

const decision = (over: Record<string, unknown> = {}) => ({
  understood: 'Quer abrir chamado da VPN com erro 809',
  intent: 'abrir_chamado',
  action: 'Montei o rascunho',
  confidence: 0.9,
  rationale: 'Artigo do erro 809 não se aplica ao Windows 11; reunião hoje → Alta',
  missingInfo: [],
  ...over,
});

describe('turno do agent (Mastra + ferramentas + serviço de chamados)', () => {
  it('abre chamado: consulta central e chamados, calcula prioridade e só monta o rascunho', async () => {
    const w = createWorld('emp-ana');
    const result = await runTurn({
      ports: w.ports,
      history: [],
      userMessage: 'Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.',
      model: scriptedModel([
        { calls: [{ tool: 'buscar_central_ajuda', args: { consulta: 'VPN erro 809' } }, { tool: 'listar_meus_chamados', args: { mostrar_ao_funcionario: false } }] },
        {
          calls: [
            {
              tool: 'preparar_chamado',
              args: {
                tipo: 'INC',
                categoria: 'Rede e VPN',
                titulo: 'VPN não conecta no notebook — erro 809',
                descricao: 'Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809. Precisa dela para a reunião das 14h.',
                fatos_prioridade: { affected: 'somente_voce', workStopped: true, hasWorkaround: false, sameDayCommitment: true },
              },
            },
          ],
        },
        { calls: [{ tool: 'registrar_decisao', args: decision() }] },
        { text: 'Coloquei prioridade alta por causa da reunião — a resposta chega antes das 14h. Confira antes de eu criar:' },
      ]),
      modelLabel: 'teste',
      emit: w.emit,
    });

    expect(result.trace.steps.filter((s) => !s.silent).map((s) => s.label)).toEqual([
      'buscou na central de ajuda',
      'consultou seus chamados',
      'verificou duplicidade',
      'classificou a prioridade',
      'consultou o SLA',
      'montou o rascunho',
    ]);
    const draft = result.blocks.find((b) => b.type === 'draft');
    expect(draft?.type === 'draft' && draft.draft.payload.priority).toBe('alta');
    const kb = result.blocks.find((b) => b.type === 'kb_article');
    expect(kb?.type === 'kb_article' && kb.applicable).toBe(false); // artigo vale só para Windows 10
    expect(result.trace.decision?.confidence).toBe(0.9);
    expect(result.trace.decisionInferred).toBe(false);
    // Nada foi criado no sistema de chamados: só o rascunho.
    expect(w.repo.listTickets({ requesterId: 'emp-ana', scope: 'open' })).toHaveLength(3);
    expect(w.events.some((e) => e.type === 'text')).toBe(true);
  });

  it('privacidade: chamado de outra pessoa não é exibido', async () => {
    const w = createWorld('emp-ana');
    const result = await runTurn({
      ports: w.ports,
      history: [],
      userMessage: 'Como está o REQ-10460?',
      model: scriptedModel([
        { calls: [{ tool: 'consultar_chamado', args: { id: 'REQ-10460' } }] },
        { calls: [{ tool: 'registrar_decisao', args: decision({ intent: 'consultar_chamado', confidence: 0.8 }) }] },
        { text: 'Não encontrei esse chamado entre os seus.' },
      ]),
      modelLabel: 'teste',
      emit: w.emit,
    });
    expect(result.blocks.find((b) => b.type === 'ticket_card')).toBeUndefined();
    expect(result.trace.steps[0]?.status).toBe('erro');
  });

  it('duplicidade: não monta rascunho novo para um problema que já tem chamado aberto', async () => {
    const w = createWorld('emp-ana');
    const result = await runTurn({
      ports: w.ports,
      history: [],
      userMessage: 'Meu notebook está muito lento depois da atualização do Windows',
      model: scriptedModel([
        {
          calls: [
            {
              tool: 'preparar_chamado',
              args: {
                tipo: 'INC',
                categoria: 'Hardware',
                titulo: 'Notebook lento após atualização',
                descricao: 'O notebook ficou muito lento depois da atualização do Windows.',
                fatos_prioridade: { affected: 'somente_voce', workStopped: false, hasWorkaround: true, sameDayCommitment: false },
              },
            },
          ],
        },
        { text: 'Você já tem o INC-20311 sobre isso. Quer que eu complemente?' },
      ]),
      modelLabel: 'teste',
      emit: w.emit,
    });
    expect(w.drafts).toHaveLength(0);
    expect(result.blocks.find((b) => b.type === 'draft')).toBeUndefined();
    expect(result.trace.decisionInferred).toBe(true);
  });

  it('guardrail: confiança baixa sem informação faltando transfere para analista', async () => {
    const w = createWorld('emp-bruno');
    const result = await runTurn({
      ports: w.ports,
      history: [],
      userMessage: 'O sistema de orçamento novo da agência travou minha conta de anúncios',
      model: scriptedModel([
        { calls: [{ tool: 'registrar_decisao', args: decision({ intent: 'conversa', confidence: 0.35 }) }] },
        { text: 'Não tenho certeza de como ajudar.' },
      ]),
      modelLabel: 'teste',
      emit: w.emit,
    });
    expect(w.handoffs[0]?.trigger).toBe('baixa_confianca');
    expect(result.handoff?.queue).toBe('Suporte N1');
    expect(result.trace.guardrails.join(' ')).toMatch(/35%/);
  });

  it('confirmação por texto só executa com uma confirmação clara', async () => {
    const w = createWorld('emp-ana', 'hmm, não sei');
    await w.ports.drafts.create({ kind: 'criar', ticketId: null, type: 'INC', title: 'Teams sem áudio', description: 'Ninguém me escuta no Teams desde hoje.', category: 'Software', priority: 'media', priorityRule: '', priorityFacts: null, affected: 'somente_voce', slaDeadline: null, slaLabel: '', comment: null });
    await runTurn({
      ports: w.ports,
      history: [],
      userMessage: 'hmm, não sei',
      model: scriptedModel([{ calls: [{ tool: 'confirmar_rascunho', args: { rascunho: 'D-381' } }] }, { text: 'Use o botão Confirmar.' }]),
      modelLabel: 'teste',
      emit: w.emit,
    });
    expect(w.drafts[0]?.status).toBe('pendente');
    expect(isTextConfirmation('sim, pode criar')).toBe(true);
    expect(isTextConfirmation('não, espera')).toBe(false);
  });
});

describe('histórico para o modelo', () => {
  it('resume os cartões e começa pelo usuário', () => {
    const msgs = toModelMessages(
      [
        { id: '1', seq: 1, conversationId: 'c', role: 'system', authorName: null, text: 'Chamado INC-1 criado', blocks: [], trace: null, createdAt: '' },
        { id: '2', seq: 2, conversationId: 'c', role: 'analyst', authorName: 'Rafael Lima', text: 'Oi!', blocks: [], trace: null, createdAt: '' },
      ],
      'obrigada',
    );
    expect(msgs[0]?.role).toBe('user');
    expect(msgs[1]?.content).toContain('[Analista Rafael Lima]');
    expect(msgs.at(-1)).toEqual({ role: 'user', content: 'obrigada' });
  });
});
