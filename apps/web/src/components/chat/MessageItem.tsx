'use client';

import { useState } from 'react';
import { ArrowRightLeft, Bot, CircleCheck, Headset, RotateCcw } from 'lucide-react';
import { formatTime, type ChatMessage, type Decision, type TurnTrace, type UiBlock } from '@nexo/shared';
import { cn } from '@/lib/cn';
import { AgentHeader, type LiveStep } from '@/components/decision/AgentHeader';
import { DecisionPanel } from '@/components/decision/DecisionPanel';
import { DraftCard } from '@/components/blocks/DraftCard';
import { HandoffCard } from '@/components/blocks/HandoffCard';
import { QuickReplies } from '@/components/blocks/QuickReplies';
import { TicketCard } from '@/components/blocks/TicketCard';
import { TicketListBlock } from '@/components/blocks/TicketListBlock';

export interface InteractionContext {
  /** Próxima mensagem do funcionário depois desta (null se ainda não respondeu). */
  nextUserText: string | null;
  latestPendingDraftId: string | null;
  /** Último texto enviado pelo funcionário — usado em "Tentar de novo". */
  lastUserText: string | null;
  busy: boolean;
  onSend: (text: string) => void;
  onMessages: (messages: ChatMessage[]) => void;
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end animate-fade-up">
      <p className="max-w-[78%] rounded-2xl bg-navy px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-white">{text}</p>
    </div>
  );
}

function SystemIcon({ text }: { text: string }) {
  const cls = 'h-3.5 w-3.5';
  if (/assumiu/i.test(text)) return <Headset className={cls} />;
  if (/devolveu/i.test(text)) return <Bot className={cls} />;
  if (/encerrad/i.test(text)) return <CircleCheck className={cls} />;
  return <ArrowRightLeft className={cls} />;
}

export function SystemDivider({ text, at }: { text: string; at?: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[12.5px] text-muted" role="status">
      <span className="h-px flex-1 bg-line" />
      <SystemIcon text={text} />
      <span>
        {text}
        {at ? ` · ${formatTime(at)}` : ''}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function AnalystBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="max-w-[78%] animate-fade-up">
      <div className="mb-1.5 flex items-center gap-2 text-[13px]">
        <span className="font-semibold text-ink">{message.authorName}</span>
        <span className="rounded bg-green-soft px-1.5 py-0.5 text-[11.5px] font-medium text-green-ink">Analista</span>
      </div>
      <p className="rounded-2xl border border-[#cfe9d8] bg-analyst-bubble px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-ink">
        {message.text}
      </p>
    </div>
  );
}

/** A opção escolhida é a que inicia a próxima mensagem do funcionário (ex.: "Só eu. Tenho reunião…"). */
function pickChosen(options: string[], next: string | null): string | null {
  if (!next) return null;
  const n = next.toLowerCase();
  return options.find((o) => n.startsWith(o.toLowerCase())) ?? null;
}

const stepsFromTrace = (trace: TurnTrace | null): LiveStep[] =>
  (trace?.steps ?? []).filter((s) => !s.silent).map((s) => ({ id: s.id, label: s.label, status: s.status }));

/** Resposta do agent: rótulos das ações, texto, opções rápidas, cartões e detalhe da decisão. */
export function AssistantTurn({
  text,
  blocks,
  trace,
  liveSteps,
  streaming,
  decision,
  ctx,
}: {
  text: string;
  blocks: UiBlock[];
  trace: TurnTrace | null;
  liveSteps?: LiveStep[];
  streaming?: boolean;
  decision?: Decision | null;
  ctx: InteractionContext;
}) {
  const [open, setOpen] = useState(false);
  const steps = liveSteps ?? stepsFromTrace(trace);
  const quick = blocks.find((b): b is Extract<UiBlock, { type: 'quick_replies' }> => b.type === 'quick_replies');
  // Como no protótipo: o cartão do chamado consultado vem antes do texto; listas e rascunhos, depois.
  // O artigo da central usado aparece no detalhe da decisão, não como cartão.
  const before = blocks.filter((b) => b.type === 'ticket_card');
  const after = blocks.filter((b) => b.type !== 'quick_replies' && b.type !== 'kb_article' && b.type !== 'ticket_card');
  const answered = ctx.nextUserText !== null;
  const failed = trace?.failed;

  const renderCard = (b: UiBlock, i: number) => {
    switch (b.type) {
      case 'ticket_list': {
        const chosen = ctx.nextUserText ? (b.tickets.find((t) => ctx.nextUserText!.startsWith(t.id))?.id ?? null) : null;
        return (
          <TicketListBlock
            key={i}
            tickets={b.tickets}
            selectedId={chosen}
            disabled={answered || ctx.busy || !b.selectable}
            onSelect={(t) => ctx.onSend(`${t.id} · ${t.title}`)}
          />
        );
      }
      case 'ticket_card':
        return <TicketCard key={b.ticket.id} ticket={b.ticket} />;
      case 'draft':
        return (
          <DraftCard
            key={`${b.draft.id}:${b.draft.status}`}
            draft={b.draft}
            isLatestPending={ctx.latestPendingDraftId === b.draft.id}
            onMessages={ctx.onMessages}
          />
        );
      case 'handoff':
        return <HandoffCard key={i} queue={b.queue} eta={b.eta} summary={b.summary} />;
      default:
        return null;
    }
  };

  return (
    <div className="animate-fade-up">
      <AgentHeader steps={steps} expanded={open} onToggle={() => setOpen((v) => !v)} canExpand={!!trace && !streaming} />
      {open && trace && <DecisionPanel trace={trace} className="mb-3" />}
      {streaming && decision && !open && <p className="mb-1.5 text-[12px] text-faint">Entendi: {decision.understood}</p>}

      {before.length > 0 && <div className="mb-2.5 space-y-2.5">{before.map(renderCard)}</div>}

      {(text || streaming) && (
        <div
          className={cn(
            'max-w-[520px] rounded-xl border bg-white px-4 py-3 shadow-[0_1px_2px_rgb(16_24_40/0.04)]',
            failed ? 'border-red/30' : 'border-line',
          )}
        >
          {text ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-ink">{text}</p>
          ) : (
            <span className="inline-flex gap-1 py-1.5" aria-label="Nexo Assist está pensando">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-blink rounded-full bg-muted" style={{ animationDelay: `${i * 160}ms` }} />
              ))}
            </span>
          )}
          {quick && !streaming && (
            <QuickReplies
              question={quick.question}
              options={quick.options}
              chosen={pickChosen(quick.options, ctx.nextUserText)}
              disabled={answered || ctx.busy}
              onPick={ctx.onSend}
            />
          )}
          {failed && !answered && ctx.lastUserText && (
            <button
              type="button"
              onClick={() => ctx.onSend(ctx.lastUserText!)}
              disabled={ctx.busy}
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Tentar de novo
            </button>
          )}
        </div>
      )}

      {after.length > 0 && <div className="mt-2.5 space-y-2.5">{after.map(renderCard)}</div>}
    </div>
  );
}
