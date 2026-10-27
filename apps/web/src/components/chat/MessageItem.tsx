'use client';

import { useState } from 'react';
import { ArrowRightLeft, RotateCcw } from 'lucide-react';
import { formatTime, type ChatMessage, type Decision, type TurnTrace, type UiBlock } from '@nexo/shared';
import { cn } from '@/lib/cn';
import { AgentHeader, type LiveStep } from '@/components/decision/AgentHeader';
import { DecisionPanel } from '@/components/decision/DecisionPanel';
import { DraftCard } from '@/components/blocks/DraftCard';
import { HandoffCard } from '@/components/blocks/HandoffCard';
import { KbSource } from '@/components/blocks/KbSource';
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

export function SystemDivider({ text, at }: { text: string; at?: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[12.5px] text-muted" role="status">
      <span className="h-px flex-1 bg-line" />
      <ArrowRightLeft className="h-3.5 w-3.5" />
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
      <p className="rounded-2xl border border-[#cfe9d8] bg-analyst-bubble px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-ink">{message.text}</p>
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
  const kb = blocks.filter((b): b is Extract<UiBlock, { type: 'kb_article' }> => b.type === 'kb_article');
  const cards = blocks.filter((b) => b.type !== 'quick_replies' && b.type !== 'kb_article');
  const answered = ctx.nextUserText !== null;
  const failed = trace?.failed;

  return (
    <div className="animate-fade-up">
      <AgentHeader steps={steps} expanded={open} onToggle={() => setOpen((v) => !v)} canExpand={!!trace && !streaming} />
      {open && trace && <DecisionPanel trace={trace} className="mb-3" />}
      {streaming && decision && !open && (
        <p className="mb-1.5 text-[12px] text-faint">Entendi: {decision.understood}</p>
      )}

      {(text || streaming) && (
        <div className={cn('max-w-[600px] rounded-xl border bg-white px-4 py-3 shadow-[0_1px_2px_rgb(16_24_40/0.04)]', failed ? 'border-red/30' : 'border-line')}>
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
            <QuickReplies question={quick.question} options={quick.options} chosen={pickChosen(quick.options, ctx.nextUserText)} disabled={answered || ctx.busy} onPick={ctx.onSend} />
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

      {kb.length > 0 && (
        <div className="mt-2 flex flex-col items-start gap-1.5">
          {kb.map((k) => (
            <KbSource key={k.id} id={k.id} title={k.title} applicable={k.applicable} note={k.note} />
          ))}
        </div>
      )}

      {cards.length > 0 && (
        <div className="mt-2.5 space-y-2.5">
          {cards.map((b, i) => {
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
                return <TicketCard key={i} ticket={b.ticket} />;
              case 'draft':
                return <DraftCard key={b.draft.id} draft={b.draft} isLatestPending={ctx.latestPendingDraftId === b.draft.id} onMessages={ctx.onMessages} />;
              case 'handoff':
                return <HandoffCard key={i} queue={b.queue} eta={b.eta} summary={b.summary} />;
              default:
                return null;
            }
          })}
        </div>
      )}
    </div>
  );
}
