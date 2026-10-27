'use client';

import { Check, ChevronDown, Info, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface LiveStep {
  id: string;
  label: string;
  status: 'running' | 'ok' | 'erro';
}

/**
 * Linha acima de cada resposta: "Nexo Assist ✓ consultou seus chamados ✓ calculou o prazo".
 * O botão "Por quê?" abre o detalhe da decisão.
 */
export function AgentHeader({
  steps,
  name = 'Nexo Assist',
  expanded,
  onToggle,
  canExpand,
  tag,
}: {
  steps: LiveStep[];
  name?: string;
  expanded?: boolean;
  onToggle?: () => void;
  canExpand?: boolean;
  tag?: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="font-semibold text-ink">{name}</span>
      {tag}
      {steps.map((s) => (
        <span
          key={s.id}
          className={cn('inline-flex items-center gap-1', s.status === 'erro' ? 'text-red' : s.status === 'running' ? 'text-faint' : 'text-muted')}
        >
          {s.status === 'running' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : s.status === 'erro' ? (
            <X className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {s.label}
        </span>
      ))}
      {canExpand && onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-brand hover:bg-brand-soft"
        >
          <Info className="h-3.5 w-3.5" />
          {expanded ? 'Ocultar detalhes' : 'Por quê?'}
          <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}
