'use client';

import { STATUS_LABEL, formatDayMonth, type TicketView } from '@nexo/shared';
import { cn } from '@/lib/cn';
import { STATUS_TONE } from '@/lib/labels';
import { StatusLabel } from '@/components/ui/StatusDot';

/** Seleção entre os chamados abertos (Tela 3). */
export function TicketListBlock({
  tickets,
  selectedId,
  disabled,
  onSelect,
}: {
  tickets: TicketView[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (t: TicketView) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Seus chamados abertos" className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
      {tickets.map((t, i) => {
        const selected = selectedId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onSelect(t)}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
              i > 0 && 'border-t border-line-soft',
              selected ? 'bg-subtle' : 'enabled:hover:bg-subtle/70',
              disabled && !selected && 'opacity-70',
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-brand bg-brand' : 'border-[#c4c9d1] bg-white',
              )}
            >
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span className="w-[86px] shrink-0 text-[13px] text-muted tabular-nums">{t.id}</span>
            <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{t.title}</span>
            <span className="hidden shrink-0 sm:inline">
              <StatusLabel tone={t.sla.overdue ? 'red' : STATUS_TONE[t.status]}>{t.sla.overdue ? `${STATUS_LABEL[t.status]} · vencido` : STATUS_LABEL[t.status]}</StatusLabel>
            </span>
            <span className="w-12 shrink-0 text-right text-[13px] text-muted">{formatDayMonth(t.createdAt)}</span>
          </button>
        );
      })}
    </div>
  );
}
