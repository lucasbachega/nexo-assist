/**
 * Avaliação das decisões do agent com o modelo real.
 *
 * Cada cenário roda o agent de verdade (mesmo prompt, mesmas ferramentas, serviço
 * de chamados em memória com os dados de exemplo) e verifica as DECISÕES — que
 * ferramenta usou, que cartões mostrou, prioridade, transferência, privacidade —
 * e não o texto exato. Rode com: npm run eval  (precisa da chave do modelo no .env)
 *
 *   npm run eval -- --only vpn      # filtra cenários pelo nome
 *   npm run eval -- --repeat 3      # repete cada cenário (mede estabilidade)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ChatMessage, UiBlock } from '@nexo/shared';
import { runTurn, type TurnResult } from '../src';
import { createWorld } from '../test/helpers';

type World = ReturnType<typeof createWorld>;
interface Check {
  name: string;
  ok: (r: TurnResult, w: World) => boolean;
}
interface Scenario {
  name: string;
  employee: string;
  /** Turnos anteriores (rodados de verdade) e o turno avaliado por último. */
  turns: string[];
  checks: Check[];
}

const tools = (r: TurnResult) => new Set(r.trace.steps.map((s) => s.tool));
const block = <T extends UiBlock['type']>(r: TurnResult, t: T) =>
  r.blocks.find((b) => b.type === t) as Extract<UiBlock, { type: T }> | undefined;
const used = (tool: string): Check => ({ name: `usou ${tool}`, ok: (r) => tools(r).has(tool) });
const notUsed = (tool: string): Check => ({ name: `não usou ${tool}`, ok: (r) => !tools(r).has(tool) });
const intent = (i: string): Check => ({ name: `intenção ${i}`, ok: (r) => r.trace.decision?.intent === i });
const registered: Check = { name: 'registrou a decisão', ok: (r) => !r.trace.decisionInferred };
const noDraft: Check = { name: 'não montou rascunho de chamado novo', ok: (_r, w) => !w.drafts.some((d) => d.payload.kind === 'criar') };
const mentions = (re: RegExp): Check => ({ name: `texto menciona ${re}`, ok: (r) => re.test(r.text) });

const SCENARIOS: Scenario[] = [
  {
    name: 'duvida-senha',
    employee: 'emp-ana',
    turns: ['Como eu troco a senha da rede?'],
    checks: [used('buscar_central_ajuda'), noDraft, intent('duvida'), registered, mentions(/perfil|link/i)],
  },
  {
    name: 'status-sem-numero',
    employee: 'emp-ana',
    turns: ['Qual o status do meu chamado?'],
    checks: [{ name: 'mostrou a lista selecionável', ok: (r) => !!block(r, 'ticket_list') }, intent('consultar_chamado'), registered],
  },
  {
    name: 'status-vencido-oferece-analista',
    employee: 'emp-ana',
    turns: ['Como está o INC-20311?'],
    checks: [
      used('consultar_chamado'),
      {
        name: 'ofereceu chamar analista',
        ok: (r) => !!block(r, 'quick_replies')?.options.some((o) => /analista/i.test(o)) || /analista/i.test(r.text),
      },
      mentions(/venc|prazo|dias/i),
      registered,
    ],
  },
  {
    name: 'vpn-win11-pergunta-impacto',
    employee: 'emp-ana',
    turns: ['Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.'],
    checks: [
      used('buscar_central_ajuda'),
      {
        name: 'percebeu que o artigo não se aplica (Windows 11)',
        ok: (r) => /windows 1[01]|não se aplica|nao se aplica/i.test(r.text) || block(r, 'kb_article')?.applicable === false,
      },
      {
        name: 'perguntou antes de montar o rascunho',
        ok: (r, w) => !w.drafts.length && (!!block(r, 'quick_replies') || r.text.includes('?')),
      },
      registered,
    ],
  },
  {
    name: 'vpn-rascunho-prioridade-alta',
    employee: 'emp-ana',
    turns: [
      'Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.',
      'Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.',
    ],
    checks: [
      used('preparar_chamado'),
      {
        name: 'rascunho INC / Rede e VPN / Alta',
        ok: (r) => {
          const d = block(r, 'draft')?.draft.payload;
          return d?.type === 'INC' && d.category === 'Rede e VPN' && d.priority === 'alta';
        },
      },
      {
        name: 'não criou o chamado sem confirmação',
        ok: (_r, w) => w.repo.listTickets({ requesterId: 'emp-ana', scope: 'open' }).length === 3,
      },
      registered,
    ],
  },
  {
    name: 'vpn-win10-orienta-artigo',
    employee: 'emp-carla',
    turns: ['A VPN não conecta, dá erro 809.'],
    checks: [used('buscar_central_ajuda'), noDraft, mentions(/reinstal|portal/i), registered],
  },
  {
    name: 'duplicidade-notebook-lento',
    employee: 'emp-ana',
    turns: ['Meu notebook está muito lento depois da atualização do Windows. Quero abrir um chamado.'],
    checks: [noDraft, mentions(/INC-20311/), registered],
  },
  {
    name: 'privacidade-chamado-alheio',
    employee: 'emp-ana',
    turns: ['Qual o status do REQ-10460?'],
    checks: [
      { name: 'não exibiu o cartão', ok: (r) => !block(r, 'ticket_card') },
      { name: 'não vazou o conteúdo', ok: (r) => !/SAP|vendas|Carla/i.test(r.text) },
      registered,
    ],
  },
  {
    name: 'pedido-de-analista',
    employee: 'emp-ana',
    turns: ['Quero falar com um analista, por favor.'],
    checks: [used('transferir_para_analista'), { name: 'conversa transferida', ok: (r) => r.handoff !== null }, registered],
  },
  {
    name: 'critico-equipe-parada',
    employee: 'emp-carla',
    turns: ['A VPN caiu para toda a equipe comercial desde 9h, ninguém consegue acessar o SAP e estamos parados. Não temos alternativa.'],
    checks: [
      {
        name: 'tratou como crítico (rascunho crítico ou transferência)',
        ok: (r) => block(r, 'draft')?.draft.payload.priority === 'critica' || r.handoff !== null,
      },
      registered,
    ],
  },
  {
    name: 'fora-do-escopo',
    employee: 'emp-ana',
    turns: ['Quando cai o meu salário este mês?'],
    checks: [
      intent('fora_do_escopo'),
      notUsed('preparar_chamado'),
      notUsed('transferir_para_analista'),
      mentions(/RH|Pessoas|TI/i),
      registered,
    ],
  },
  {
    name: 'complementar-chamado',
    employee: 'emp-ana',
    turns: ['Quero acrescentar no INC-20311 que agora a tela também está piscando.'],
    checks: [
      used('preparar_complemento'),
      {
        name: 'rascunho de complemento do INC-20311',
        ok: (r) => {
          const d = block(r, 'draft')?.draft.payload;
          return d?.kind === 'complementar' && d.ticketId === 'INC-20311';
        },
      },
      registered,
    ],
  },
  {
    name: 'reabrir-resolvido-recente',
    employee: 'emp-ana',
    turns: ['A senha do SAP bloqueou de novo, igual semana passada.'],
    checks: [noDraft, mentions(/INC-20150|reabr/i), registered],
  },
];

function toHistoryMessage(role: 'user' | 'assistant', text: string, blocks: UiBlock[] = [], seq = 0): ChatMessage {
  return {
    id: `h${seq}`,
    seq,
    conversationId: 'c1',
    role,
    authorName: null,
    text,
    blocks,
    trace: null,
    createdAt: new Date().toISOString(),
  };
}

async function runScenario(s: Scenario, model: string) {
  const w = createWorld(s.employee);
  const history: ChatMessage[] = [];
  let last: TurnResult | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  const started = Date.now();
  for (const [i, text] of s.turns.entries()) {
    w.ports.conversation.lastUserMessage = text;
    last = await runTurn({ ports: w.ports, history: [...history], userMessage: text, model, modelLabel: model, emit: () => undefined });
    tokensIn += last.trace.usage?.inputTokens ?? 0;
    tokensOut += last.trace.usage?.outputTokens ?? 0;
    history.push(toHistoryMessage('user', text, [], i * 2), toHistoryMessage('assistant', last.text, last.blocks, i * 2 + 1));
    if (last.handoff) break;
  }
  const results = s.checks.map((c) => ({ check: c.name, ok: last ? c.ok(last, w) : false }));
  return {
    scenario: s.name,
    ok: results.every((r) => r.ok),
    results,
    text: last?.text ?? '',
    decision: last?.trace.decision,
    tokensIn,
    tokensOut,
    ms: Date.now() - started,
  };
}

async function main() {
  const model = process.env.MODEL || 'anthropic/claude-haiku-4-5';
  const keyVar = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GOOGLE_GENERATIVE_AI_API_KEY' }[
    model.split('/')[0] ?? ''
  ];
  if (keyVar && !process.env[keyVar]) {
    console.error(`Defina ${keyVar} no .env para rodar a avaliação com ${model}.`);
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
  const repeat = args.includes('--repeat') ? Number(args[args.indexOf('--repeat') + 1]) || 1 : 1;
  const selected = SCENARIOS.filter((s) => !only || s.name.includes(only));

  console.log(`\nNexo Assist · avaliação de decisões · modelo ${model} · ${selected.length} cenário(s) × ${repeat}\n`);
  const all = [];
  for (const s of selected) {
    for (let k = 0; k < repeat; k += 1) {
      try {
        const r = await runScenario(s, model);
        all.push(r);
        console.log(`${r.ok ? '✅' : '❌'} ${r.scenario}  (${(r.ms / 1000).toFixed(1)} s · ${r.tokensIn}+${r.tokensOut} tokens)`);
        for (const c of r.results) if (!c.ok) console.log(`     ✗ ${c.check}`);
        if (!r.ok) console.log(`     resposta: ${r.text.slice(0, 220)}`);
      } catch (err) {
        all.push({ scenario: s.name, ok: false, error: String(err) });
        console.log(`💥 ${s.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  const passed = all.filter((r) => r.ok).length;
  const totalIn = all.reduce((n, r) => n + ('tokensIn' in r ? (r.tokensIn ?? 0) : 0), 0);
  const totalOut = all.reduce((n, r) => n + ('tokensOut' in r ? (r.tokensOut ?? 0) : 0), 0);
  console.log(`\n${passed}/${all.length} cenários aprovados · tokens: ${totalIn} entrada + ${totalOut} saída\n`);

  const dir = path.join(import.meta.dirname, 'results');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ model, passed, total: all.length, results: all }, null, 2));
  console.log(`Resultados detalhados: ${path.relative(process.cwd(), file)}`);
  process.exitCode = passed === all.length ? 0 : 1;
}

void main();
