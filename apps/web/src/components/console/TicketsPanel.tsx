'use client';

import { useState } from 'react';
import { ArrowRightLeft, ArrowUpRight, ChevronRight, Headset, WifiOff, X } from 'lucide-react';
import { PRIORITY_LABEL, STATUS_LABEL, formatDayMonth, formatTime, type HandoffInfo, type TicketView } from '@nexo/shared';
import { cn } from '@/lib/cn';
import { STATUS_TONE } from '@/lib/labels';
import { StatusDot, StatusLabel } from '@/components/ui/StatusDot';
import type { ConversationItem, TicketsResponse } from './types';

function TicketRow({ t }: { t: TicketView }) {
  const [open, setOpen] = useState(false);
  const closed = t.status === 'resolvido' || t.status === 'fechado';
  return (
    <li className="border-b border-line-soft last:border-0">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 py-3 text-left" aria-expanded={open}>
        <StatusDot tone={t.sla.overdue ? 'red' : STATUS_TONE[t.status]} className="mt-0.5 self-start" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink">{t.title}</span>
          <span className="block text-[12.5px] text-muted">
            {t.id} · {closed ? `${STATUS_LABEL[t.status]} em ${formatDayMonth(t.lastSupportUpdateAt)}` : STATUS_LABEL[t.status]}
            {t.sla.overdue && <span className="text-red"> · vencido</span>}
          </span>
        </span>
        <ChevronRight className={cn('h-4 w-4 text-faint transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mb-3 ml-4 rounded-lg bg-subtle p-3 text-[12.5px] leading-relaxed text-ink-soft">
          <p>{t.description}</p>
          <p className="mt-1.5 text-muted">
            {t.category} · prioridade {PRIORITY_LABEL[t.priority]} · prazo {t.sla.rule} · {t.sla.summary}
          </p>
        </div>
      )}
    </li>
  );
}

export function TicketsPanel({
  conversation,
  handoff,
  data,
  onClose,
}: {
  conversation: ConversationItem;
  handoff: HandoffInfo | null;
  data: TicketsResponse | null;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const first = conversation.employeeName.split(' ')[0];
  const all = data ? [...data.open, ...data.closed] : [];
  const current = conversation.ticketId ? all.find((t) => t.id === conversation.ticketId) : undefined;
  const others = all.filter((t) => t.id !== current?.id);
  const visible = showAll ? others : others.slice(0, 4);

  return (
    <aside className="flex h-full w-full flex-col border-l border-line bg-white" aria-label={`Chamados de ${first}`}>
      <header className="flex items-start justify-between px-5 pt-4 pb-3">
        <div>
          <h2 className="text-[16px] font-semibold text-ink">Chamados da {first}</h2>
          <p className="text-[12.5px] text-muted">{data ? `${data.open.length} abertos · ${data.closed.length} encerrados` : 'carregando…'}</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-ink-soft hover:bg-subtle" aria-label="Fechar painel">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {data && !data.available && (
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-amber-soft px-3 py-2 text-[12.5px] text-amber-ink">
            <WifiOff className="h-4 w-4" /> Sistema de chamados indisponível. Tentando de novo…
          </p>
        )}

        {current && (
          <>
            <h3 className="mt-2 mb-2 text-[13px] font-medium text-ink-soft">Desta conversa</h3>
            <div className="rounded-xl bg-subtle p-4">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-muted">{current.id}</span>
                <StatusLabel tone={conversation.status === 'com_analista' ? 'blue' : STATUS_TONE[current.status]} strong>
                  {conversation.status === 'com_analista' ? 'Em atendimento' : STATUS_LABEL[current.status]}
                </StatusLabel>
              </div>
              <div className="mt-1.5 text-[15.5px] leading-snug font-semibold text-ink">{current.title}</div>
              <div className="mt-0.5 text-[13px] text-muted">
                {current.category} · prioridade {PRIORITY_LABEL[current.priority].toLowerCase()}
                {current.sla.overdue && <span className="text-red"> · prazo vencido</span>}
              </div>
              {(handoff || conversation.status === 'com_analista') && (
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[13px] text-ink-soft">
                  {conversation.status === 'com_analista' ? <Headset className="h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
                  <span className="flex-1">
                    {conversation.status === 'com_analista' ? `Assumido por ${conversation.assignedAnalystName}` : 'Transferido para um analista'}
                  </span>
                  {handoff && <span className="text-muted">{formatTime(handoff.at)}</span>}
                </div>
              )}
            </div>
          </>
        )}

        <h3 className="mt-5 mb-1 text-[13px] font-medium text-ink-soft">{current ? 'Outros chamados' : 'Chamados'}</h3>
        {!data && [0, 1, 2].map((i) => <div key={i} className="my-2 h-12 animate-pulse rounded-lg bg-line-soft" />)}
        {data && others.length === 0 && <p className="py-3 text-[13px] text-muted">Nenhum outro chamado.</p>}
        <ul>
          {visible.map((t) => (
            <TicketRow key={t.id} t={t} />
          ))}
        </ul>
      </div>

      {others.length > 4 && (
        <div className="border-t border-line p-4">
          <button onClick={() => setShowAll((v) => !v)} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-[14px] text-ink hover:bg-subtle">
            {showAll ? 'Mostrar menos' : `Ver todos os chamados da ${first}`} <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
}
