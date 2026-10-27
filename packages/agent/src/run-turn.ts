import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { ChatMessage, Decision, HandoffInfo, Intent, TurnTrace, UiBlock } from '@nexo/shared';
import { toModelMessages } from './history';
import type { AgentPorts } from './ports';
import { buildInstructions } from './prompt';
import { createTools, type TurnState } from './tools';
import { TurnTracer, type Emit } from './tracer';

/** Abaixo disso, sem informação faltando, o agent "não sabe o que fazer" → analista. */
export const LOW_CONFIDENCE_THRESHOLD = 0.4;

export interface RunTurnInput {
  ports: AgentPorts;
  /** Mensagens anteriores da conversa (sem a atual). */
  history: ChatMessage[];
  userMessage: string;
  model: MastraModelConfig;
  /** Nome legível do modelo para o painel de transparência. */
  modelLabel: string;
  emit: Emit;
  signal?: AbortSignal;
  /** Limites de custo por turno. */
  maxSteps?: number;
  maxOutputTokens?: number;
  historyWindow?: number;
}

export interface TurnResult {
  text: string;
  blocks: UiBlock[];
  trace: TurnTrace;
  handoff: HandoffInfo | null;
  focusTicketId: string | null;
}

/**
 * Executa um turno do Nexo Assist:
 *  1. monta instruções + contexto do turno e o histórico compacto;
 *  2. roda o agent Mastra com as ferramentas (streaming de texto e passos);
 *  3. aplica as regras pós-modelo (guardrails) e fecha a trilha de decisão.
 */
export async function runTurn(input: RunTurnInput): Promise<TurnResult> {
  const started = Date.now();
  const { ports, emit } = input;
  const tracer = new TurnTracer(emit);
  const state: TurnState = { handedOff: false, draftCreated: false, focusTicketId: null };
  let handoff: HandoffInfo | null = null;

  const agent = new Agent({
    id: 'nexo-assist',
    name: 'Nexo Assist',
    instructions: buildInstructions(ports),
    model: input.model,
    tools: createTools(ports, tracer, state),
  });

  const messages = toModelMessages(input.history, input.userMessage, input.historyWindow ?? 16);
  const stream = await agent.stream(messages, {
    maxSteps: input.maxSteps ?? 8,
    modelSettings: { temperature: 0.2, maxOutputTokens: input.maxOutputTokens ?? 900 },
    ...(input.signal ? { abortSignal: input.signal } : {}),
  });

  let text = '';
  for await (const chunk of stream.fullStream) {
    if (chunk.type === 'text-delta') {
      text += chunk.payload.text;
      emit({ type: 'text', delta: chunk.payload.text });
    } else if (chunk.type === 'error') {
      const err = chunk.payload.error;
      throw err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Falha ao gerar a resposta');
    }
  }
  const usage = await stream.totalUsage.catch(() => null);

  // Em transferências, os passos já foram registrados pelas ferramentas.
  const guardrails: string[] = [];
  let decision = tracer.decision;
  let decisionInferred = false;
  if (!decision) {
    decision = inferDecision(tracer, state);
    decisionInferred = true;
    guardrails.push('O modelo não registrou a decisão neste turno; o resumo foi inferido pelo sistema a partir das ações.');
  }

  // Guardrail: confiança baixa sem informação faltando → analista (regra de transferência do Anexo A).
  if (
    !decisionInferred &&
    !state.handedOff &&
    decision.confidence < LOW_CONFIDENCE_THRESHOLD &&
    decision.missingInfo.length === 0 &&
    decision.intent !== 'fora_do_escopo'
  ) {
    handoff = await tracer.step('transferiu para Suporte N1', 'guardrail_confianca', async (ctx) => {
      const h = await ports.handoff.transfer({
        trigger: 'baixa_confianca',
        reason: 'Agent sem segurança para decidir',
        summary: `${decision!.understood}. ${decision!.rationale}`,
        ticketId: state.focusTicketId ?? ports.conversation.ticketId,
        queue: 'Suporte N1',
        confidence: decision!.confidence,
      });
      ctx.detail(`Confiança ${Math.round(decision!.confidence * 100)}% < mínimo de ${LOW_CONFIDENCE_THRESHOLD * 100}%`);
      return h;
    });
    state.handedOff = true;
    tracer.addBlock({ type: 'handoff', queue: handoff.queue, eta: handoff.dueAt, summary: handoff.summary });
    const note = 'Para não te passar uma informação errada, vou chamar um analista para te ajudar com isso.';
    text = text ? `${text.trim()}\n\n${note}` : note;
    emit({ type: 'text', delta: `\n\n${note}` });
    guardrails.push(
      `Confiança de ${Math.round(decision.confidence * 100)}% abaixo do mínimo de ${LOW_CONFIDENCE_THRESHOLD * 100}% → conversa transferida automaticamente.`,
    );
  }

  if (!text.trim()) {
    text = fallbackText(state);
    emit({ type: 'text', delta: text });
    guardrails.push('O modelo não escreveu texto final; usada uma frase padrão.');
  }

  if (!handoff && state.handedOff) {
    const hb = tracer.blocks.find((b) => b.type === 'handoff');
    if (hb && hb.type === 'handoff') {
      handoff = {
        reason: '',
        trigger: 'outro',
        queue: hb.queue,
        summary: hb.summary,
        ticketId: state.focusTicketId,
        confidence: null,
        at: new Date().toISOString(),
        dueAt: hb.eta,
      };
    }
  }

  const trace: TurnTrace = {
    steps: tracer.steps,
    decision,
    guardrails,
    model: input.modelLabel,
    usage: usage ? { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 } : null,
    latencyMs: Date.now() - started,
    decisionInferred,
  };

  return { text: text.trim(), blocks: tracer.blocks, trace, handoff, focusTicketId: state.focusTicketId };
}

function fallbackText(state: TurnState): string {
  if (state.handedOff) return 'Encaminhei para um analista. Ele vai continuar o atendimento por aqui.';
  if (state.draftCreated) return 'Confira os dados antes de eu continuar:';
  return 'Pode me contar um pouco mais sobre o que está acontecendo?';
}

/** Quando o modelo esquece de registrar a decisão, inferimos pelo que ele fez. */
export function inferDecision(tracer: TurnTracer, state: TurnState): Decision {
  const tools = new Set(tracer.steps.map((s) => s.tool));
  let intent: Intent = 'conversa';
  let action = 'Respondeu sem usar ferramentas';
  if (state.handedOff) {
    intent = 'falar_com_analista';
    action = 'Transferiu para um analista';
  } else if (tools.has('preparar_chamado') || tools.has('confirmar_rascunho')) {
    intent = 'abrir_chamado';
    action = 'Preparou o chamado para confirmação';
  } else if (tools.has('preparar_complemento')) {
    intent = 'complementar_chamado';
    action = 'Preparou o complemento para confirmação';
  } else if (tools.has('consultar_chamado') || tools.has('listar_meus_chamados')) {
    intent = 'consultar_chamado';
    action = 'Consultou os chamados';
  } else if (tools.has('buscar_central_ajuda')) {
    intent = 'duvida';
    action = 'Buscou na central de ajuda';
  }
  return {
    understood: 'Não registrado pelo modelo',
    intent,
    action,
    confidence: 0.5,
    rationale: `Inferido pelas ações executadas: ${[...tools].join(', ') || 'nenhuma'}.`,
    missingInfo: [],
  };
}
