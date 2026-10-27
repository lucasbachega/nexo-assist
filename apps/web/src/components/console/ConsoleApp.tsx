'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, MessageSquare, MessagesSquare } from 'lucide-react';
import type { ChatMessage } from '@nexo/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/Avatar';
import { LogoMark } from '@/components/ui/Logo';
import { logout } from '@/components/shell/EmployeeShell';
import { ConversationList } from './ConversationList';
import { ConversationPane } from './ConversationPane';
import { TicketsPanel } from './TicketsPanel';
import type { ConsoleFilter, DetailResponse, ListResponse, TicketsResponse } from './types';

const merge = (a: ChatMessage[], b: ChatMessage[]) => {
  const m = new Map(a.map((x) => [x.seq, x]));
  for (const x of b) m.set(x.seq, x);
  return [...m.values()].sort((x, y) => x.seq - y.seq);
};

/** Console do analista (Telas 4 e 5). Atualiza por polling curto. */
export function ConsoleApp({ analyst }: { analyst: { id: string; name: string; team: string | null } }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ConsoleFilter>('para_voce');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<ListResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [tickets, setTickets] = useState<TicketsResponse | null>(null);
  const [showTickets, setShowTickets] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const detailRef = useRef(detail);
  detailRef.current = detail;

  const loadList = useCallback(async () => {
    try {
      setList(await api<ListResponse>(`/api/console/conversations?filter=${filter}&q=${encodeURIComponent(query)}`));
    } catch {
      /* mantém a última lista */
    }
  }, [filter, query]);

  useEffect(() => {
    void loadList();
    const id = window.setInterval(() => void loadList(), 4000);
    return () => window.clearInterval(id);
  }, [loadList]);

  // Seleciona a primeira conversa que precisa de atenção.
  useEffect(() => {
    if (!selected && list?.items[0] && window.innerWidth >= 1024) setSelected(list.items[0].id);
  }, [list, selected]);

  const loadDetail = useCallback(async (id: string, incremental: boolean) => {
    const after = incremental && detailRef.current?.conversation.id === id ? (detailRef.current.messages.at(-1)?.seq ?? 0) : 0;
    try {
      const r = await api<DetailResponse>(`/api/console/conversations/${id}?after=${after}`);
      setDetail((prev) => (prev && prev.conversation.id === id && after > 0 ? { ...r, messages: merge(prev.messages, r.messages) } : r));
    } catch (e) {
      if (!incremental) setError(e instanceof ApiError ? e.message : 'Não foi possível abrir a conversa.');
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    setError(null);
    setDetail(null);
    void loadDetail(selected, false);
    const id = window.setInterval(() => void loadDetail(selected, true), 2500);
    return () => window.clearInterval(id);
  }, [selected, loadDetail]);

  const employeeId = detail?.conversation.employeeId;
  useEffect(() => {
    if (!employeeId) return;
    setTickets(null);
    const load = () => api<TicketsResponse>(`/api/console/employees/${employeeId}/tickets`).then(setTickets).catch(() => undefined);
    void load();
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, [employeeId, detail?.conversation.status]);

  async function action(a: 'assume' | 'return' | 'close') {
    if (!selected) return;
    setBusy(a);
    setError(null);
    try {
      await api(`/api/console/conversations/${selected}/${a}`, { method: 'POST' });
      await Promise.all([loadDetail(selected, true), loadList()]);
      if (a === 'assume') setFilter('minhas');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(null);
    }
  }

  async function send(text: string) {
    if (!selected) return;
    setBusy('send');
    setError(null);
    try {
      const r = await api<{ message: ChatMessage }>(`/api/console/conversations/${selected}/messages`, { method: 'POST', json: { text } });
      setDetail((prev) => (prev ? { ...prev, messages: merge(prev.messages, [r.message]) } : prev));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar.');
    } finally {
      setBusy(null);
    }
  }

  const waiting = list?.counts.para_voce ?? 0;

  return (
    <div className="flex h-dvh overflow-hidden bg-white">
      {/* Trilho */}
      <nav className="flex w-[60px] shrink-0 flex-col items-center border-r border-line bg-subtle py-4" aria-label="Console">
        <LogoMark className="h-7 w-7" />
        <button className="relative mt-6 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand shadow-card" aria-label={`Conversas, ${waiting} aguardando`}>
          <MessageSquare className="h-5 w-5" />
          {waiting > 0 && <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold text-white">{waiting}</span>}
        </button>
        <div className="relative mt-auto">
          <button onClick={() => setMenu((v) => !v)} aria-label="Conta" title={`${analyst.name} · ${analyst.team ?? 'Suporte'}`}>
            <Avatar name={analyst.name} size={34} online />
          </button>
          {menu && (
            <div className="absolute bottom-0 left-12 z-20 w-56 rounded-xl border border-line bg-white p-2 shadow-card">
              <div className="px-2 py-1.5">
                <div className="text-[14px] font-semibold text-ink">{analyst.name}</div>
                <div className="text-[12.5px] text-muted">{analyst.team ?? 'Suporte'}</div>
              </div>
              <button onClick={() => void logout(router)} className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[14px] text-ink-soft hover:bg-subtle">
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className={cn('w-full shrink-0 lg:block lg:w-[360px]', selected ? 'hidden' : 'block')}>
        <ConversationList data={list} filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} selectedId={selected} onSelect={setSelected} loading={!list} />
      </div>

      <div className={cn('min-w-0 flex-1', selected ? 'flex' : 'hidden lg:flex')}>
        {detail ? (
          <ConversationPane
            conversation={detail.conversation}
            handoff={detail.handoff}
            messages={detail.messages}
            analystId={analyst.id}
            onAction={(a) => void action(a)}
            onSend={(t) => void send(t)}
            onBack={() => setSelected(null)}
            onToggleTickets={() => setShowTickets((v) => !v)}
            busy={busy}
            error={error}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-console text-center text-muted">
            {selected ? (
              error ? <p className="text-red">{error}</p> : <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            ) : (
              <>
                <MessagesSquare className="h-9 w-9 text-faint" />
                <p className="mt-3 text-[14.5px]">Selecione uma conversa para ver o histórico.</p>
              </>
            )}
          </div>
        )}
      </div>

      {detail && showTickets && (
        <div className="hidden w-[340px] shrink-0 xl:block">
          <TicketsPanel conversation={detail.conversation} handoff={detail.handoff} data={tickets} onClose={() => setShowTickets(false)} />
        </div>
      )}
    </div>
  );
}
