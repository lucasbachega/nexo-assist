'use client';

import { CheckCheck, Search } from 'lucide-react';
import { formatListTime } from '@nexo/shared';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Avatar';
import type { ConsoleFilter, ConversationItem, ListResponse } from './types';

const FILTERS: Array<{ id: ConsoleFilter; label: string }> = [
  { id: 'todas', label: 'Todas' },
  { id: 'para_voce', label: 'Para você' },
  { id: 'com_agent', label: 'Com o agent' },
  { id: 'minhas', label: 'Minhas' },
];

const TONE: Record<ConversationItem['statusLine']['tone'], { dot: string; text: string }> = {
  danger: { dot: 'bg-red', text: 'text-red' },
  warning: { dot: 'bg-amber', text: 'text-amber-ink' },
  success: { dot: 'bg-green', text: 'text-ink-soft' },
  info: { dot: 'bg-brand', text: 'text-brand' },
  muted: { dot: 'bg-faint', text: 'text-muted' },
};

function dueText(iso: string | null) {
  if (!iso) return null;
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (min <= 0) return 'contato atrasado';
  return min < 60 ? `contato em ${min} min` : `contato em ${Math.floor(min / 60)} h ${min % 60} min`;
}

export function ConversationList({
  data,
  filter,
  onFilter,
  query,
  onQuery,
  selectedId,
  onSelect,
  loading,
}: {
  data: ListResponse | null;
  filter: ConsoleFilter;
  onFilter: (f: ConsoleFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <section className="flex h-full w-full flex-col border-r border-line bg-white" aria-label="Conversas">
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[20px] font-semibold text-ink">Conversas</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-2.5 py-1 text-[12.5px] font-medium text-green-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-green" /> Disponível
          </span>
        </div>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-subtle px-3 text-[14px]">
          <Search className="h-4 w-4 text-muted" />
          <span className="sr-only">Pesquisar</span>
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Pesquisar conversa ou chamado" className="flex-1 bg-transparent outline-none placeholder:text-muted" />
        </label>
        <div className="scroll-thin mt-3 flex gap-1 overflow-x-auto pb-3" role="tablist">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const count = data?.counts[f.id];
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => onFilter(f.id)}
                className={cn('rounded-lg px-2 py-1 text-[13px] whitespace-nowrap transition-colors', active ? 'bg-brand-soft font-medium text-brand' : 'bg-subtle text-ink-soft hover:bg-line-soft')}
              >
                {f.label}
                {f.id !== 'todas' && count !== undefined && <span className={cn('ml-1', active ? 'text-brand' : 'text-muted')}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading && !data && [0, 1, 2, 3].map((i) => <li key={i} className="mx-2 my-2 h-[72px] animate-pulse rounded-xl bg-line-soft" />)}
        {data && data.items.length === 0 && <li className="px-4 py-10 text-center text-[14px] text-muted">Nenhuma conversa aqui.</li>}
        {data?.items.map((c) => {
          const tone = TONE[c.statusLine.tone];
          const due = c.status === 'aguardando_atendente' && c.handoffDueAt && c.statusLine.tone === 'danger' && !c.ticketId ? dueText(c.handoffDueAt) : null;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                aria-current={selectedId === c.id}
                className={cn('flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors', selectedId === c.id ? 'bg-subtle' : 'hover:bg-subtle/60')}
              >
                <Avatar name={c.employeeName} size={44} online={c.status !== 'encerrada'} />
                <span className="min-w-0 flex-1 border-b border-line-soft pb-2">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-ink">{c.employeeName}</span>
                    <span className={cn('shrink-0 text-[12.5px]', c.unread > 0 ? 'font-semibold text-brand' : 'text-muted')}>{formatListTime(c.lastMessageAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 truncate text-[13.5px] text-ink-soft">
                      {c.preview.startsWith('Nexo:') && <CheckCheck className="h-3.5 w-3.5 shrink-0 text-brand" />}
                      <span className="truncate">{c.preview}</span>
                    </span>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11.5px] font-semibold text-white">{c.unread}</span>
                    )}
                  </span>
                  <span className={cn('mt-1 flex items-center gap-1.5 text-[12px]', tone.text)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                    {c.statusLine.text}
                    {due && ` · ${due}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
