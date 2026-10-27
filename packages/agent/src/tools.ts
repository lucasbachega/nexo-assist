import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  AFFECTED_LABEL,
  CategorySchema,
  DecisionSchema,
  PRIORITY_LABEL,
  PriorityFactsSchema,
  SLA_RULES,
  STATUS_LABEL,
  TicketTypeSchema,
  canReopen,
  classifyPriority,
  computeDeadline,
  findDuplicateCandidates,
  formatDateTime,
  formatTime,
  isOpenStatus,
  toTicketView,
  type DraftPayload,
  type Employee,
  type HandoffInfo,
  type Ticket,
} from '@nexo/shared';
import { TicketsApiError, TicketsUnavailableError, isNotFound } from '@nexo/tickets/client';
import type { AgentPorts } from './ports';
import type { TurnTracer } from './tracer';

/** Estado compartilhado entre as ferramentas durante um turno. */
export interface TurnState {
  handoff: HandoffInfo | null;
  draftCreated: boolean;
  focusTicketId: string | null;
}

const UNAVAILABLE = {
  erro: 'sistema_indisponivel',
  mensagem: 'O sistema de chamados não respondeu depois de algumas tentativas. Peça para tentar de novo em instantes.',
} as const;

/** Converte falhas conhecidas em respostas que o modelo sabe tratar. */
async function guard<T>(fn: () => Promise<T>): Promise<T | typeof UNAVAILABLE | { erro: string; mensagem: string }> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TicketsUnavailableError) return UNAVAILABLE;
    if (err instanceof TicketsApiError) return { erro: 'falha_no_sistema', mensagem: err.message };
    throw err;
  }
}

function ticketForModel(t: Ticket, now: Date) {
  const view = toTicketView(t, now);
  return {
    id: t.id,
    tipo: t.type,
    titulo: t.title,
    categoria: t.category,
    prioridade: PRIORITY_LABEL[t.priority],
    status: STATUS_LABEL[t.status],
    aberto_em: formatDateTime(t.createdAt),
    ultima_atualizacao_da_ti: view.sla.sinceLastUpdate,
    prazo: {
      regra: view.sla.rule,
      situacao: view.sla.summary,
      vencido: view.sla.overdue,
    },
  };
}

function osApplies(appliesTo: string[], employee: Employee): boolean {
  if (appliesTo.length === 0) return true;
  if (!employee.os) return false;
  const os = employee.os.toLowerCase();
  return appliesTo.some((a) => os.includes(a.toLowerCase()));
}

const AFFIRMATIVE =
  /\b(sim|pode|confirmo|confirma|confirmar|ok|okay|isso|certo|perfeito|manda|cria|criar|abre|abrir|beleza|fechado|positivo)\b/i;
const NEGATIVE = /\b(n[aã]o|espera|aguarda|cancela|errado)\b/i;

export function isTextConfirmation(message: string): boolean {
  return AFFIRMATIVE.test(message) && !NEGATIVE.test(message);
}

export function createTools(ports: AgentPorts, tracer: TurnTracer, state: TurnState) {
  const now = () => ports.now();
  const tickets = (ctx: { onAttempt: Parameters<typeof ports.tickets.withObserver>[0] }) => ports.tickets.withObserver(ctx.onAttempt);

  const buscar_central_ajuda = createTool({
    id: 'buscar_central_ajuda',
    description:
      'Busca artigos na central de ajuda de TI. Use para dúvidas e antes de abrir chamado. Informa se o artigo se aplica ao sistema operacional do funcionário.',
    inputSchema: z.object({ consulta: z.string().min(2).describe('Palavras-chave do problema ou da dúvida') }),
    execute: async ({ consulta }) =>
      guard(() =>
        tracer.step('buscou na central de ajuda', 'buscar_central_ajuda', async (ctx) => {
          const hits = await tickets(ctx).searchKb(consulta, 3);
          ctx.detail(`Busca: "${consulta}"`);
          if (hits.length === 0) ctx.detail('Nenhum artigo relevante encontrado');
          const artigos = hits.map((h) => {
            const aplica = osApplies(h.article.appliesToOs, ports.employee);
            ctx.detail(
              `${h.article.id} "${h.article.title}" — relevância ${Math.round(h.score * 100)}%${
                h.article.appliesToOs.length
                  ? `; vale para ${h.article.appliesToOs.join(', ')} (${aplica ? 'se aplica' : `não se aplica: ${ports.employee.os ?? 'SO desconhecido'}`})`
                  : ''
              }`,
            );
            return {
              id: h.article.id,
              titulo: h.article.title,
              conteudo: h.article.body,
              relevancia: h.score,
              se_aplica_ao_funcionario: aplica,
              restricao: h.article.appliesToOs.length ? `Vale apenas para ${h.article.appliesToOs.join(', ')}` : null,
            };
          });
          const best = artigos[0];
          if (best && best.relevancia >= 0.45) {
            tracer.addBlock({
              type: 'kb_article',
              id: best.id,
              title: best.titulo,
              applicable: best.se_aplica_ao_funcionario,
              note: best.se_aplica_ao_funcionario ? null : `${best.restricao}; o seu é ${ports.employee.os ?? 'outro sistema'}`,
            });
          }
          return { sistema_do_funcionario: ports.employee.os, artigos };
        }),
      ),
  });

  const listar_meus_chamados = createTool({
    id: 'listar_meus_chamados',
    description:
      'Lista os chamados do funcionário (abertos e resolvidos nos últimos 30 dias), com status e prazo. Use para responder "como está meu chamado" ou para checar duplicidade antes de abrir um novo.',
    inputSchema: z.object({
      mostrar_ao_funcionario: z
        .boolean()
        .describe('true para exibir a lista selecionável na tela (quando ele precisa escolher um chamado)'),
    }),
    execute: async ({ mostrar_ao_funcionario }) =>
      guard(() =>
        tracer.step('consultou seus chamados', 'listar_meus_chamados', async (ctx) => {
          const all = await tickets(ctx).listTickets({ scope: 'all' });
          const cutoff = now().getTime() - 30 * 86_400_000;
          const abertos = all.filter((t) => isOpenStatus(t.status));
          const recentes = all.filter((t) => !isOpenStatus(t.status) && t.resolvedAt && new Date(t.resolvedAt).getTime() >= cutoff);
          ctx.detail(`${abertos.length} aberto(s), ${recentes.length} resolvido(s) nos últimos 30 dias`);
          for (const t of abertos) {
            const v = toTicketView(t, now());
            ctx.detail(`${t.id} · ${STATUS_LABEL[t.status]} · ${v.sla.overdue ? 'prazo vencido' : v.sla.summary}`);
          }
          if (mostrar_ao_funcionario && abertos.length > 0) {
            tracer.addBlock({ type: 'ticket_list', tickets: abertos.map((t) => toTicketView(t, now())), selectable: true });
          }
          return {
            abertos: abertos.map((t) => ticketForModel(t, now())),
            resolvidos_recentes: recentes.map((t) => ({
              ...ticketForModel(t, now()),
              pode_reabrir: canReopen(t, now()),
            })),
          };
        }),
      ),
  });

  const consultar_chamado = createTool({
    id: 'consultar_chamado',
    description:
      'Consulta um chamado do funcionário pelo número (ex.: INC-20311), com histórico e situação do prazo. Exibe o cartão do chamado.',
    inputSchema: z.object({ id: z.string().regex(/^(INC|REQ)-\d+$/i, 'Use o formato INC-12345 ou REQ-12345') }),
    execute: async ({ id }) =>
      guard(async () => {
        const upper = id.toUpperCase();
        try {
          const { ticket, events } = await tracer.step(`consultou o ${upper}`, 'consultar_chamado', async (ctx) => {
            const r = await tickets(ctx).getTicket(upper);
            ctx.detail(`${r.ticket.title} · ${STATUS_LABEL[r.ticket.status]} · prioridade ${PRIORITY_LABEL[r.ticket.priority]}`);
            return r;
          });
          const view = toTicketView(ticket, now());
          tracer.note('calculou o prazo', 'consultar_chamado', [
            `Prioridade ${PRIORITY_LABEL[ticket.priority]} → prazo de ${view.sla.rule} por atualização`,
            `Última atualização da TI: ${formatDateTime(ticket.lastSupportUpdateAt)} (${view.sla.sinceLastUpdate})`,
            view.sla.deadline
              ? `Limite: ${formatDateTime(view.sla.deadline)} → ${view.sla.overdue ? 'VENCIDO' : 'dentro do prazo'}`
              : `Prazo não corre neste status (${STATUS_LABEL[ticket.status]})`,
          ]);
          tracer.addBlock({ type: 'ticket_card', ticket: view });
          state.focusTicketId = ticket.id;
          return {
            ...ticketForModel(ticket, now()),
            descricao: ticket.description,
            pode_reabrir: canReopen(ticket, now()),
            historico_recente: events
              .slice(-4)
              .map((e) => ({ quando: formatDateTime(e.at), autor: e.authorName ?? e.author, texto: e.text })),
          };
        } catch (err) {
          if (isNotFound(err)) {
            return { erro: 'nao_encontrado', mensagem: `${upper} não está entre os chamados deste funcionário.` };
          }
          throw err;
        }
      }),
  });

  const preparar_chamado = createTool({
    id: 'preparar_chamado',
    description:
      'Monta o RASCUNHO de um chamado novo para o funcionário conferir (não cria o chamado). Verifica duplicidade e calcula prioridade e prazo pelas regras do service desk.',
    inputSchema: z.object({
      tipo: TicketTypeSchema.describe('INC: algo parou/não funciona. REQ: pedido de acesso, equipamento ou software'),
      categoria: CategorySchema,
      titulo: z.string().min(5).max(90).describe('Título curto e específico, ex.: "VPN não conecta no notebook — erro 809"'),
      descricao: z
        .string()
        .min(15)
        .max(600)
        .describe('Descrição completa para o analista: o que acontece, desde quando, mensagem de erro, o que já foi tentado e o impacto'),
      fatos_prioridade: PriorityFactsSchema,
      ignorar_duplicados: z.array(z.string()).optional().describe('Chamados que o funcionário já confirmou serem de outro problema'),
    }),
    execute: async (input) =>
      guard(async () => {
        const dup = await tracer.step('verificou duplicidade', 'preparar_chamado', async (ctx) => {
          const own = await tickets(ctx).listTickets({ scope: 'all' });
          const candidates = findDuplicateCandidates(
            { title: input.titulo, description: input.descricao, category: input.categoria },
            own,
            now(),
          ).filter((c) => !(input.ignorar_duplicados ?? []).map((x) => x.toUpperCase()).includes(c.ticket.id));
          if (candidates.length === 0) ctx.detail('Nenhum chamado aberto ou resolvido há até 7 dias sobre o mesmo problema');
          for (const c of candidates) ctx.detail(c.reason);
          return candidates[0] ?? null;
        });

        if (dup) {
          return {
            status: dup.strength === 'forte' ? 'duplicado' : 'possivel_duplicado',
            chamado_existente: ticketForModel(dup.ticket, now()),
            acao_recomendada: dup.action === 'atualizar' ? 'complementar o chamado existente' : 'reabrir o chamado resolvido',
            instrucao:
              dup.strength === 'forte'
                ? 'Não abra chamado novo. Ofereça complementar/reabrir o existente (preparar_complemento).'
                : 'Pergunte ao funcionário se é o mesmo problema do chamado existente. Se não for, chame preparar_chamado de novo com ignorar_duplicados.',
          };
        }

        const decision = classifyPriority(input.tipo, input.fatos_prioridade);
        const f = input.fatos_prioridade;
        tracer.note('classificou a prioridade', 'preparar_chamado', [
          `Afetados: ${AFFECTED_LABEL[f.affected]} · impede de trabalhar: ${f.workStopped ? 'sim' : 'não'} · alternativa: ${f.hasWorkaround ? 'sim' : 'não'} · compromisso hoje: ${f.sameDayCommitment ? 'sim' : 'não'}`,
          `Regra aplicada: ${decision.rule}`,
        ]);
        const deadline = computeDeadline(now(), decision.priority);
        const slaRule = SLA_RULES[decision.priority].label;
        const sameDay = formatDateTime(deadline).slice(0, 6) === formatDateTime(now()).slice(0, 6);
        const deadlineLabel = sameDay ? formatTime(deadline) : formatDateTime(deadline);
        tracer.note('consultou o SLA', 'preparar_chamado', [
          `Prioridade ${PRIORITY_LABEL[decision.priority]}: primeira resposta em ${slaRule}`,
          `Se criado agora, resposta até ${deadlineLabel}`,
        ]);

        const payload: DraftPayload = {
          kind: 'criar',
          ticketId: null,
          type: input.tipo,
          title: input.titulo,
          description: input.descricao,
          category: input.categoria,
          priority: decision.priority,
          priorityRule: decision.rule,
          priorityFacts: f,
          affected: f.affected,
          slaDeadline: deadline.toISOString(),
          slaLabel: slaRule,
          comment: null,
        };
        const draft = await tracer.step('montou o rascunho', 'preparar_chamado', async (ctx) => {
          const d = await ports.drafts.create(payload);
          ctx.detail(`Rascunho ${d.id} aguardando confirmação do funcionário — nada foi criado ainda`);
          return d;
        });
        tracer.addBlock({ type: 'draft', draft });
        state.draftCreated = true;
        return {
          status: 'rascunho_aguardando_confirmacao',
          rascunho: draft.id,
          prioridade: PRIORITY_LABEL[decision.priority],
          motivo_da_prioridade: decision.rule,
          prazo_primeira_resposta: `${slaRule} (até ${deadlineLabel})`,
        };
      }),
  });

  const preparar_complemento = createTool({
    id: 'preparar_complemento',
    description:
      'Monta o rascunho para complementar um chamado aberto com novas informações, ou reabrir um resolvido há até 7 dias. Só é aplicado depois da confirmação.',
    inputSchema: z.object({
      chamado_id: z.string().regex(/^(INC|REQ)-\d+$/i),
      texto: z.string().min(3).max(1000).describe('A informação nova, escrita para o analista'),
    }),
    execute: async ({ chamado_id, texto }) =>
      guard(async () => {
        const id = chamado_id.toUpperCase();
        let ticket: Ticket;
        try {
          ticket = await tracer.step(`consultou o ${id}`, 'preparar_complemento', async (ctx) => (await tickets(ctx).getTicket(id)).ticket);
        } catch (err) {
          if (isNotFound(err)) return { erro: 'nao_encontrado', mensagem: `${id} não está entre os chamados deste funcionário.` };
          throw err;
        }
        const open = isOpenStatus(ticket.status);
        if (!open && !canReopen(ticket, now())) {
          return {
            erro: 'nao_pode_reabrir',
            mensagem: `${id} está ${STATUS_LABEL[ticket.status].toLowerCase()} há mais de 7 dias. Pelas regras, é preciso abrir um chamado novo.`,
          };
        }
        const kind: DraftPayload['kind'] = open ? 'complementar' : 'reabrir';
        const draft = await tracer.step(open ? 'montou o complemento' : 'montou a reabertura', 'preparar_complemento', async (ctx) => {
          const d = await ports.drafts.create({
            kind,
            ticketId: ticket.id,
            type: ticket.type,
            title: ticket.title,
            description: ticket.description,
            category: ticket.category,
            priority: ticket.priority,
            priorityRule: 'Mantida a prioridade do chamado',
            priorityFacts: null,
            affected: ticket.affected,
            slaDeadline: null,
            slaLabel: SLA_RULES[ticket.priority].label,
            comment: texto,
          });
          ctx.detail(`${open ? 'Complemento' : 'Reabertura'} ${d.id} para ${ticket.id} aguardando confirmação`);
          return d;
        });
        tracer.addBlock({ type: 'draft', draft });
        state.draftCreated = true;
        state.focusTicketId = ticket.id;
        return { status: 'rascunho_aguardando_confirmacao', rascunho: draft.id, acao: kind, chamado: ticket.id };
      }),
  });

  const confirmar_rascunho = createTool({
    id: 'confirmar_rascunho',
    description:
      'Executa um rascunho pendente quando o funcionário confirmou claramente por texto (ex.: "sim, pode criar"). O sistema verifica a confirmação.',
    inputSchema: z.object({ rascunho: z.string().describe('Código do rascunho, ex.: D-381') }),
    execute: async ({ rascunho }) =>
      guard(async () => {
        const pending = ports.conversation.pendingDrafts.find((d) => d.id.toUpperCase() === rascunho.toUpperCase());
        if (!pending) return { erro: 'rascunho_inexistente', mensagem: 'Não há rascunho pendente com esse código.' };
        if (!isTextConfirmation(ports.conversation.lastUserMessage)) {
          tracer.note('aguardou confirmação', 'confirmar_rascunho', [
            `A última mensagem não é uma confirmação clara: "${ports.conversation.lastUserMessage}"`,
          ]);
          return { erro: 'sem_confirmacao', mensagem: 'A mensagem não é uma confirmação clara. Peça para confirmar no botão.' };
        }
        const label =
          pending.payload.kind === 'criar'
            ? 'criou o chamado'
            : pending.payload.kind === 'reabrir'
              ? 'reabriu o chamado'
              : 'atualizou o chamado';
        const result = await tracer.step(label, 'confirmar_rascunho', async (ctx) => {
          const r = await ports.drafts.confirm(pending.id);
          ctx.detail(`Confirmado por texto: "${ports.conversation.lastUserMessage}"`);
          if (r.ticket) ctx.detail(`${r.ticket.id} · prioridade ${PRIORITY_LABEL[r.ticket.priority]}`);
          return r;
        });
        if (result.ticket) {
          tracer.addBlock({ type: 'ticket_card', ticket: toTicketView(result.ticket, now()) });
          state.focusTicketId = result.ticket.id;
        }
        if (result.handoff) {
          state.handoff = result.handoff;
          tracer.addBlock({ type: 'handoff', queue: result.handoff.queue, eta: result.handoff.dueAt, summary: result.handoff.summary });
        }
        return {
          status: 'concluido',
          chamado: result.ticket?.id ?? null,
          transferido_para: result.handoff?.queue ?? null,
        };
      }),
  });

  const transferir_para_analista = createTool({
    id: 'transferir_para_analista',
    description: 'Transfere a conversa para um analista humano. A partir daí você para de responder até o analista devolver a conversa.',
    inputSchema: z.object({
      motivo: z.enum(['pedido', 'critico', 'vencido', 'baixa_confianca', 'outro']).describe('Por que transferir'),
      resumo: z
        .string()
        .min(20)
        .max(800)
        .describe('Resumo do caso para o analista: problema, o que já foi tentado, impacto e chamado relacionado'),
      chamado_id: z
        .string()
        .regex(/^(INC|REQ)-\d+$/i)
        .optional(),
      confianca: z.number().min(0).max(1).optional().describe('Sua confiança atual, se o motivo for baixa_confianca'),
    }),
    execute: async ({ motivo, resumo, chamado_id, confianca }) =>
      guard(async () => {
        if (state.handoff) return { status: 'ja_transferida' };
        const queue = motivo === 'critico' || motivo === 'vencido' ? 'Suporte N2' : 'Suporte N1';
        const reasonText: Record<typeof motivo, string> = {
          pedido: 'Funcionário pediu para falar com um analista',
          critico: 'Caso crítico',
          vencido: 'Chamado com prazo vencido',
          baixa_confianca: 'Agent sem segurança para decidir',
          outro: 'Encaminhado pelo agent',
        };
        const handoff = await tracer.step(`transferiu para ${queue}`, 'transferir_para_analista', async (ctx) => {
          const h = await ports.handoff.transfer({
            trigger: motivo,
            reason: reasonText[motivo],
            summary: resumo,
            ticketId: chamado_id?.toUpperCase() ?? ports.conversation.ticketId,
            queue,
            confidence: confianca ?? null,
          });
          ctx.detail(`Motivo: ${reasonText[motivo]}`);
          ctx.detail(`Fila: ${queue}${h.dueAt ? ` · analista até ${formatTime(h.dueAt)}` : ''}`);
          ctx.detail(`Resumo enviado: ${resumo}`);
          return h;
        });
        state.handoff = handoff;
        tracer.addBlock({ type: 'handoff', queue: handoff.queue, eta: handoff.dueAt, summary: handoff.summary });
        return {
          status: 'transferida',
          fila: queue,
          analista_responde_ate: handoff.dueAt ? formatTime(handoff.dueAt) : null,
          prazo_da_fila: queue === 'Suporte N2' ? '2 h úteis' : '30 min úteis',
        };
      }),
  });

  const oferecer_opcoes = createTool({
    id: 'oferecer_opcoes',
    description: 'Mostra botões de resposta rápida abaixo da sua mensagem. Use para perguntas com respostas previsíveis.',
    inputSchema: z.object({
      pergunta: z.string().max(120).optional().describe('Pergunta curta exibida em destaque acima dos botões'),
      opcoes: z.array(z.string().min(1).max(40)).min(2).max(4),
    }),
    execute: async ({ pergunta, opcoes }) =>
      tracer.step(
        'ofereceu opções',
        'oferecer_opcoes',
        async (ctx) => {
          ctx.detail(`${pergunta ? `${pergunta} ` : ''}[${opcoes.join(' | ')}]`);
          tracer.addBlock({ type: 'quick_replies', question: pergunta ?? null, options: opcoes });
          return { status: 'exibidas' };
        },
        { silent: true },
      ),
  });

  const registrar_decisao = createTool({
    id: 'registrar_decisao',
    description:
      'Registra, para auditoria e transparência, o que você entendeu, a ação escolhida, sua confiança e o porquê. Obrigatório uma vez por turno, antes da resposta final.',
    inputSchema: DecisionSchema,
    execute: async (decision) =>
      tracer.step(
        'registrou a decisão',
        'registrar_decisao',
        async (ctx) => {
          ctx.detail(`Confiança ${Math.round(decision.confidence * 100)}%`);
          tracer.setDecision(decision);
          return { status: 'registrada' };
        },
        { silent: true },
      ),
  });

  return {
    buscar_central_ajuda,
    listar_meus_chamados,
    consultar_chamado,
    preparar_chamado,
    preparar_complemento,
    confirmar_rascunho,
    transferir_para_analista,
    oferecer_opcoes,
    registrar_decisao,
  };
}
