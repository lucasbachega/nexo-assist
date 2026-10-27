import type { HandoffInfo, TurnTrace } from '@nexo/shared';
import type { AppStore } from './store';

/**
 * Conversas de exemplo para o console do analista não começar vazio.
 * Só roda com o banco vazio; desligue com SEED_DEMO_CONVERSATIONS=false.
 */
const trace = (t: Partial<TurnTrace> & Pick<TurnTrace, 'decision'>): TurnTrace => ({
  steps: [],
  guardrails: [],
  model: 'exemplo',
  usage: null,
  latencyMs: 0,
  decisionInferred: false,
  ...t,
});

const step = (label: string, tool: string, details: string[]) => ({
  id: label,
  label,
  tool,
  status: 'ok' as const,
  startedAt: new Date().toISOString(),
  durationMs: 180,
  attempts: 1,
  details,
  silent: false,
});

export function seedDemoConversations(store: AppStore): void {
  if (process.env.SEED_DEMO_CONVERSATIONS === 'false') return;
  if (store.listConversations(1).length > 0) return;
  const now = Date.now();
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

  store.transaction(() => {
    // Carla — transferida (pedido urgente de acesso, compromisso hoje)
    const carla = store.createConversation({ id: 'emp-carla', name: 'Carla Mendes', department: 'Comercial' });
    store.addMessage({
      conversationId: carla.id,
      role: 'user',
      authorId: 'emp-carla',
      authorName: 'Carla Mendes',
      text: 'Preciso de acesso ao módulo de vendas do SAP ainda hoje para lançar os pedidos do mês.',
    });
    store.addMessage({
      conversationId: carla.id,
      role: 'assistant',
      authorName: 'Nexo Assist',
      text: 'Você já tem o REQ-10460 aberto sobre isso, com prioridade alta. Como precisa ainda hoje, encaminhei para um analista do Suporte N1.',
      trace: trace({
        steps: [
          step('consultou seus chamados', 'listar_meus_chamados', ['REQ-10460 · Aberto · resposta em 4 h úteis']),
          step('transferiu para Suporte N1', 'transferir_para_analista', ['Motivo: Funcionário pediu para falar com um analista']),
        ],
        decision: {
          understood: 'Precisa do acesso ao SAP vendas hoje',
          intent: 'falar_com_analista',
          action: 'Transferiu para o Suporte N1',
          confidence: 0.86,
          rationale: 'Já existe REQ-10460 (sem duplicar). Compromisso no mesmo dia e pedido explícito de agilidade → analista.',
          missingInfo: [],
        },
      }),
    });
    const carlaHandoff: HandoffInfo = {
      reason: 'Funcionário pediu para falar com um analista',
      trigger: 'pedido',
      queue: 'Suporte N1',
      summary:
        'Carla precisa de acesso ao módulo de vendas do SAP hoje para lançar pedidos do mês. Já existe o REQ-10460 (prioridade alta). Nenhuma alternativa disponível.',
      ticketId: 'REQ-10460',
      confidence: 0.86,
      at: minutesAgo(5),
      dueAt: new Date(now + 25 * 60_000).toISOString(),
    };
    store.updateConversation(carla.id, {
      status: 'aguardando_atendente',
      handoff: carlaHandoff,
      ticketId: 'REQ-10460',
      unreadForAnalyst: 1,
      lastConfidence: 0.86,
    });
    store.addMessage({ conversationId: carla.id, role: 'system', text: 'Transferida para Suporte N1' });

    // Bruno — agent sem segurança (confiança 41%)
    const bruno = store.createConversation({ id: 'emp-bruno', name: 'Bruno Tavares', department: 'Marketing' });
    store.addMessage({
      conversationId: bruno.id,
      role: 'user',
      authorId: 'emp-bruno',
      authorName: 'Bruno Tavares',
      text: 'A agência disse que nossa conta de anúncios foi suspensa por causa do pixel do site. Vocês conseguem resolver?',
    });
    store.addMessage({
      conversationId: bruno.id,
      role: 'assistant',
      authorName: 'Nexo Assist',
      text: 'Não tenho certeza se isso é com a TI ou com o time de marketing digital. Vou chamar um analista para isso.',
      trace: trace({
        steps: [
          step('buscou na central de ajuda', 'buscar_central_ajuda', [
            'Busca: "conta de anúncios suspensa pixel"',
            'Nenhum artigo relevante encontrado',
          ]),
          step('transferiu para Suporte N1', 'transferir_para_analista', ['Motivo: Agent sem segurança para decidir', 'Fila: Suporte N1']),
        ],
        decision: {
          understood: 'Conta de anúncios suspensa por causa do pixel do site',
          intent: 'conversa',
          action: 'Encaminhou a um analista',
          confidence: 0.41,
          rationale: 'Pode envolver o site (TI) ou a conta de mídia (marketing). Sem artigo e sem categoria clara.',
          missingInfo: [],
        },
      }),
    });
    const brunoHandoff: HandoffInfo = {
      reason: 'Agent sem segurança para decidir',
      trigger: 'baixa_confianca',
      queue: 'Suporte N1',
      summary: 'Conta de anúncios suspensa pela plataforma por causa do pixel do site. Não está claro se é TI (site) ou marketing digital.',
      ticketId: null,
      confidence: 0.41,
      at: minutesAgo(14),
      dueAt: new Date(now + 16 * 60_000).toISOString(),
    };
    store.updateConversation(bruno.id, {
      status: 'aguardando_atendente',
      handoff: brunoHandoff,
      unreadForAnalyst: 1,
      lastConfidence: 0.41,
    });

    // Elisa — agent atendendo, chamado criado
    const elisa = store.createConversation({ id: 'emp-elisa', name: 'Elisa Prado', department: 'Pessoas (RH)' });
    store.addMessage({
      conversationId: elisa.id,
      role: 'user',
      authorId: 'emp-elisa',
      authorName: 'Elisa Prado',
      text: 'Ninguém me escuta nas reuniões do Teams, mas o fone funciona no YouTube.',
    });
    store.addMessage({
      conversationId: elisa.id,
      role: 'assistant',
      authorName: 'Nexo Assist',
      text: 'Chamado INC-20519 criado. Um analista responde em até 3 dias úteis.',
      trace: trace({
        decision: {
          understood: 'Teams sem áudio, fone funciona fora do Teams',
          intent: 'abrir_chamado',
          action: 'Criou o chamado após confirmação',
          confidence: 0.92,
          rationale: 'Artigo KB-008 já seguido (fone funciona fora do Teams) → chamado. Atrapalha mas há alternativa (celular) → Média.',
          missingInfo: [],
        },
      }),
    });
    store.updateConversation(elisa.id, { ticketId: 'INC-20519', lastConfidence: 0.92 });

    // Fábio — resolvido pelo agent
    const fabio = store.createConversation({ id: 'emp-fabio', name: 'Fábio Nunes', department: 'Operações' });
    store.addMessage({
      conversationId: fabio.id,
      role: 'user',
      authorId: 'emp-fabio',
      authorName: 'Fábio Nunes',
      text: 'Como eu troco a senha da rede? Vai expirar amanhã.',
    });
    store.addMessage({
      conversationId: fabio.id,
      role: 'assistant',
      authorName: 'Nexo Assist',
      text: 'Em Meu perfil > Redefinir senha você recebe um link no e-mail corporativo. A nova senha precisa ter 12 caracteres.',
      trace: trace({
        decision: {
          understood: 'Quer trocar a senha da rede antes de expirar',
          intent: 'duvida',
          action: 'Respondeu com o artigo KB-003',
          confidence: 0.95,
          rationale: 'Dúvida respondida pela central de ajuda — não precisa de chamado.',
          missingInfo: [],
        },
      }),
    });
    store.addMessage({
      conversationId: fabio.id,
      role: 'user',
      authorId: 'emp-fabio',
      authorName: 'Fábio Nunes',
      text: 'Isso resolveu, obrigado!',
    });
    store.updateConversation(fabio.id, { status: 'encerrada', lastConfidence: 0.95 });

    // Gabriela — resolvido pelo agent
    const gabi = store.createConversation({ id: 'emp-gabriela', name: 'Gabriela Rocha', department: 'Comercial' });
    store.addMessage({
      conversationId: gabi.id,
      role: 'user',
      authorId: 'emp-gabriela',
      authorName: 'Gabriela Rocha',
      text: 'Qual a senha do Wi-Fi para um cliente que vem amanhã?',
    });
    store.addMessage({
      conversationId: gabi.id,
      role: 'assistant',
      authorName: 'Nexo Assist',
      text: 'A senha do Wi-Fi de visitantes (Nexo-Visitantes) muda toda segunda e fica com a recepção — é só pedir lá na chegada.',
      trace: trace({
        decision: {
          understood: 'Wi-Fi para visitante',
          intent: 'duvida',
          action: 'Respondeu com o artigo KB-007',
          confidence: 0.93,
          rationale: 'Coberto pela central de ajuda.',
          missingInfo: [],
        },
      }),
    });
    store.updateConversation(gabi.id, { status: 'encerrada', lastConfidence: 0.93 });
  });
}
