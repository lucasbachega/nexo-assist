import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Fonte usada da central de ajuda (com aviso quando não se aplica ao equipamento). */
export function KbSource({ id, title, applicable, note }: { id: string; title: string; applicable: boolean; note: string | null }) {
  return (
    <div className={cn('inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]', applicable ? 'border-line bg-white text-ink-soft' : 'border-amber/30 bg-amber-soft/60 text-amber-ink')}>
      <BookOpen className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        Central de ajuda · <span className="font-medium">{title}</span> <span className="text-faint">({id})</span>
        {!applicable && note && <> — {note}</>}
      </span>
    </div>
  );
}
