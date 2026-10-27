'use client';

import { cn } from '@/lib/cn';

/** Opções rápidas. Depois de respondidas, ficam desabilitadas com a escolha marcada. */
export function QuickReplies({
  question,
  options,
  chosen,
  disabled,
  onPick,
}: {
  question: string | null;
  options: string[];
  chosen: string | null;
  disabled: boolean;
  onPick: (option: string) => void;
}) {
  return (
    <div className="mt-3">
      {question && <p className="mb-2 text-[14.5px] font-semibold text-ink">{question}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => onPick(o)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-[14px] transition-colors',
              chosen === o ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-ink enabled:hover:border-brand-line enabled:hover:bg-brand-soft/40',
              disabled && chosen !== o && 'opacity-60',
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
