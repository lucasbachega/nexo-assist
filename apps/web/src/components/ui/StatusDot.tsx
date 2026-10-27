import { cn } from '@/lib/cn';
import { DOT_CLASS, TEXT_TONE, type Tone } from '@/lib/labels';

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', DOT_CLASS[tone], className)} />;
}

export function StatusLabel({ tone, children, strong }: { tone: Tone; children: React.ReactNode; strong?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px]', strong ? cn('font-medium', TEXT_TONE[tone]) : 'text-ink-soft')}>
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}
