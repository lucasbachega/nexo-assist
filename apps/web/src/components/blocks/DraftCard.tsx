'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  AFFECTED,
  AFFECTED_LABEL,
  CATEGORIES,
  PRIORITY_LABEL,
  TICKET_TYPE_LABEL,
  formatDateTime,
  formatTime,
  type ChatMessage,
  type DraftView,
} from '@nexo/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { StatusDot, StatusLabel } from '@/components/ui/StatusDot';

function deadlineText(iso: string | null) {
  if (!iso) return null;
  const sameDay = formatDateTime(iso).slice(0, 6) === formatDateTime(new Date()).slice(0, 6);
  return `resposta até ${sameDay ? formatTime(iso) : formatDateTime(iso)}`;
}

const inputCls =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15';

/**
 * Rascunho para confirmação (Tela 2). O chamado só é criado/atualizado no Confirmar.
 * ⌘↵ / Ctrl+↵ confirma o rascunho pendente mais recente.
 */
export function DraftCard({
  draft: initial,
  isLatestPending,
  onMessages,
}: {
  draft: DraftView;
  isLatestPending: boolean;
  onMessages: (messages: ChatMessage[]) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState<null | 'confirm' | 'cancel' | 'save'>(null);
  const [error, setError] = useState<string | null>(initial.error && initial.status === 'falhou' ? initial.error : null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial.payload);

  const p = draft.payload;
  const actionable = draft.status === 'pendente' || draft.status === 'falhou';

  async function run(kind: 'confirm' | 'cancel') {
    setBusy(kind);
    setError(null);
    try {
      const r = await api<{ draft: DraftView; messages: ChatMessage[] }>(`/api/drafts/${draft.id}/${kind}`, { method: 'POST' });
      setDraft(r.draft);
      onMessages(r.messages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível concluir. Tente de novo.');
      if (e instanceof ApiError && e.status >= 500) setDraft((d) => ({ ...d, status: 'falhou' }));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setError(null);
    try {
      const body =
        p.kind === 'criar'
          ? { title: form.title, description: form.description, category: form.category, type: form.type, affected: form.affected }
          : { comment: form.comment ?? '' };
      const r = await api<{ draft: DraftView }>(`/api/drafts/${draft.id}`, { method: 'PATCH', json: body });
      setDraft(r.draft);
      setForm(r.draft.payload);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(null);
    }
  }

  const confirmRef = useRef(() => run('confirm'));
  useEffect(() => {
    confirmRef.current = () => run('confirm');
  });

  useEffect(() => {
    if (!isLatestPending || !actionable || editing || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const active = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
        if (active && 'value' in active && active.value.trim()) return; // está escrevendo uma mensagem
        e.preventDefault();
        void confirmRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLatestPending, actionable, editing, busy]);

  const header = p.kind === 'criar' ? 'Novo chamado' : p.kind === 'reabrir' ? `Reabrir ${p.ticketId}` : `Complementar ${p.ticketId}`;

  const statusBadge =
    draft.status === 'confirmado' ? (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-green-ink">
        <CheckCircle2 className="h-4 w-4" />{' '}
        {p.kind === 'criar' ? `Criado · ${draft.resultTicketId}` : `Aplicado · ${draft.resultTicketId}`}
      </span>
    ) : draft.status === 'cancelado' ? (
      <StatusLabel tone="gray">{draft.error ?? 'Cancelado'}</StatusLabel>
    ) : draft.status === 'falhou' ? (
      <StatusLabel tone="red" strong>
        Não enviado
      </StatusLabel>
    ) : (
      <StatusLabel tone="amber" strong>
        {draft.status === 'processando' ? 'Enviando…' : 'Aguardando confirmação'}
      </StatusLabel>
    );

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border bg-white shadow-card',
        draft.status === 'cancelado' ? 'border-line opacity-70' : 'border-line',
      )}
    >
      <div className="p-4">
        <header className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-muted">
            {header} <span className="px-1 text-faint">·</span> Rascunho {draft.id}
          </span>
          {statusBadge}
        </header>

        {editing ? (
          <div className="mt-3 space-y-3">
            {p.kind === 'criar' ? (
              <>
                <label className="block text-[13px] text-muted">
                  Título
                  <input
                    className={cn(inputCls, 'mt-1')}
                    value={form.title}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </label>
                <label className="block text-[13px] text-muted">
                  Descrição
                  <textarea
                    className={cn(inputCls, 'mt-1 min-h-[84px] resize-y')}
                    value={form.description}
                    maxLength={2000}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-[13px] text-muted">
                    Tipo
                    <select
                      className={cn(inputCls, 'mt-1')}
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
                    >
                      <option value="INC">{TICKET_TYPE_LABEL.INC}</option>
                      <option value="REQ">{TICKET_TYPE_LABEL.REQ}</option>
                    </select>
                  </label>
                  <label className="block text-[13px] text-muted">
                    Categoria
                    <select
                      className={cn(inputCls, 'mt-1')}
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as typeof form.category })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[13px] text-muted">
                    Afetados
                    <select
                      className={cn(inputCls, 'mt-1')}
                      value={form.affected}
                      onChange={(e) => setForm({ ...form, affected: e.target.value as typeof form.affected })}
                    >
                      {AFFECTED.map((a) => (
                        <option key={a} value={a}>
                          {AFFECTED_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-[12.5px] text-muted">
                  A prioridade é recalculada pelas regras do service desk quando você muda o tipo ou quem é afetado.
                </p>
              </>
            ) : (
              <label className="block text-[13px] text-muted">
                Informação a acrescentar
                <textarea
                  className={cn(inputCls, 'mt-1 min-h-[84px]')}
                  value={form.comment ?? ''}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                />
              </label>
            )}
          </div>
        ) : (
          <>
            <h3 className="mt-2 text-[18px] leading-snug font-semibold text-ink">{p.title}</h3>
            {p.kind === 'criar' ? (
              <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{p.description}</p>
            ) : (
              <p className="mt-2 rounded-lg bg-subtle px-3 py-2 text-[14px] leading-relaxed text-ink">
                <span className="text-muted">{p.kind === 'reabrir' ? 'Motivo da reabertura: ' : 'Nova informação: '}</span>
                {p.comment}
              </p>
            )}
            {p.kind === 'criar' && (
              <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line-soft pt-3 sm:grid-cols-3">
                <div>
                  <div className="text-[13px] text-muted">Categoria</div>
                  <div className="mt-0.5 text-[14.5px] text-ink">
                    {p.category} <span className="text-[12.5px] text-muted">· {TICKET_TYPE_LABEL[p.type]}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[13px] text-muted">Prioridade</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[14.5px] text-ink" title={p.priorityRule}>
                    <StatusDot tone={p.priority === 'critica' ? 'red' : p.priority === 'alta' ? 'amber' : 'gray'} />
                    {PRIORITY_LABEL[p.priority]}
                    {deadlineText(p.slaDeadline) && <span className="text-[13px] text-muted">· {deadlineText(p.slaDeadline)}</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[13px] text-muted">Afetados</div>
                  <div className="mt-0.5 text-[14.5px] text-ink">{AFFECTED_LABEL[p.affected]}</div>
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-soft px-3 py-2 text-[13px] text-red">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
      </div>

      {actionable && (
        <footer className="flex items-center gap-2 border-t border-line-soft bg-subtle px-2 py-2">
          {editing ? (
            <>
              <Button variant="primary" onClick={save} loading={busy === 'save'}>
                Salvar alterações
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setForm(draft.payload);
                }}
                disabled={!!busy}
              >
                Descartar
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" onClick={() => run('confirm')} loading={busy === 'confirm'} disabled={!!busy && busy !== 'confirm'}>
                {draft.status === 'falhou' ? 'Tentar de novo' : 'Confirmar'}
                {isLatestPending && <kbd className="rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-normal">⌘↵</kbd>}
              </Button>
              <Button onClick={() => setEditing(true)} disabled={!!busy}>
                Editar
              </Button>
              <Button variant="ghost" onClick={() => run('cancel')} loading={busy === 'cancel'} disabled={!!busy && busy !== 'cancel'}>
                Cancelar
              </Button>
            </>
          )}
        </footer>
      )}
    </article>
  );
}
