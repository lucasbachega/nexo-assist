'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, CheckCheck, CircleCheck, Hand, Headset, Info, ListChecks, MoreVertical, Search, Sparkles } from 'lucide-react';
import { PRIORITY_LABEL, formatDayLabel, formatTime, type ChatMessage, type HandoffInfo, type UiBlock } from '@nexo/shared';
import { startsNewDay } from '@/lib/messages';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfidencePill, DecisionPanel } from '@/components/decision/DecisionPanel';
import { SystemDivider } from '@/components/chat/MessageItem';
import { Composer } from '@/components/chat/Composer';
import type { ConversationItem } from './types';

const TRIGGER_LABEL: Record<HandoffInfo['trigger'], string> = {
  pedido: 'Pedido do funcionário',
  critico: 'Caso crítico',
  vencido: 'Chamado vencido',
  baixa_confianca: 'Agent sem segurança',
  outro: 'Encaminhado pelo agent',
};

function blockChip(b: UiBlock): string | null {
  switch (b.type) {
    case 'ticket_list':
      return `Mostrou ${b.tickets.length} chamado(s) para escolha`;
    case 'ticket_card':
      return `Cartão ${b.ticket.id} · ${b.ticket.sla.summary}`;
    case 'draft':
      return `Rascunho ${b.draft.id} · ${b.draft.payload.kind === 'criar' ? `${b.draft.payload.title} · ${PRIORITY_LABEL[b.draft.payload.priority]}` : b.draft.payload.ticketId} · ${b.draft.status}${b.draft.resultTicketId ? ` → ${b.draft.resultTicketId}` : ''}`;
    case 'quick_replies':
      return `Opções: ${b.options.join(' / ')}`;
    case 'kb_article':
      return `Artigo ${b.id}${b.applicable ? '' : ' (não se aplica)'}`;
    case 'handoff':
      return `Transferiu para ${b.queue}`;
  }
}

function AgentMessage({ m }: { m: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const chips = m.blocks.map(blockChip).filter(Boolean) as string[];
  return (
    <div className="ml-auto flex max-w-[80%] flex-col items-end">
      <div className="mb-1 flex items-center gap-1.5 text-[12.5px]">
        <span className="font-semibold text-ink">{m.authorName ?? 'Nexo Assist'}</span>
        <span className="rounded bg-brand-soft px-1.5 text-[11px] font-semibold text-brand">IA</span>
        {m.trace && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-1 inline-flex items-center gap-1 text-[12px] text-brand hover:underline"
            aria-expanded={open}
          >
            <Info className="h-3 w-3" /> {open ? 'ocultar decisão' : 'ver decisão'}
          </button>
        )}
      </div>
      <div className="rounded-2xl rounded-tr-md bg-agent-bubble px-4 py-2.5 text-[14.5px] leading-relaxed text-ink">
        <p className="whitespace-pre-wrap">{m.text}</p>
        {chips.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {chips.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                <ListChecks className="h-3 w-3 shrink-0 text-brand" /> {c}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-[11.5px] text-muted">
          {m.trace?.decision && <span className="mr-1">confiança {Math.round(m.trace.decision.confidence * 100)}% ·</span>}
          {formatTime(m.createdAt)} <CheckCheck className="h-3.5 w-3.5 text-brand" />
        </div>
      </div>
      {open && m.trace && <DecisionPanel trace={m.trace} className="mt-2 w-full max-w-[560px] bg-white" />}
    </div>
  );
}

function HandoffSummary({ handoff }: { handoff: HandoffInfo }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5 shadow-card">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Sparkles className="h-4 w-4 text-brand" />
        <span className="font-semibold text-ink">Resumo do Nexo Assist para você</span>
        <span className="rounded-full bg-subtle px-2 py-0.5 text-[12px] text-ink-soft">{TRIGGER_LABEL[handoff.trigger]}</span>
        {handoff.confidence !== null && <ConfidencePill value={handoff.confidence} />}
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-ink">{handoff.summary}</p>
      <p className="mt-1.5 text-[12.5px] text-muted">
        {handoff.reason}
        {handoff.ticketId && ` · chamado ${handoff.ticketId}`} · fila {handoff.queue}
        {handoff.dueAt && ` · assumir até ${formatTime(handoff.dueAt)}`}
      </p>
    </div>
  );
}

export function ConversationPane({
  conversation,
  handoff,
  messages,
  analystId,
  onAction,
  onSend,
  onBack,
  onToggleTickets,
  busy,
  error,
}: {
  conversation: ConversationItem;
  handoff: HandoffInfo | null;
  messages: ChatMessage[];
  analystId: string;
  onAction: (a: 'assume' | 'return' | 'close') => void;
  onSend: (text: string) => void;
  onBack: () => void;
  onToggleTickets: () => void;
  busy: string | null;
  error: string | null;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, conversation.id]);

  const mine = conversation.status === 'com_analista' && conversation.assignedAnalystId === analystId;
  const firstName = conversation.employeeName.split(' ')[0];

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-console" aria-label={`Conversa com ${conversation.employeeName}`}>
      <header className="flex h-[64px] shrink-0 items-center gap-2.5 border-b border-line bg-white px-4">
        <button className="rounded-md p-1 lg:hidden" onClick={onBack} aria-label="Voltar para a lista">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={conversation.employeeName} size={38} />
        <div className="min-w-[64px] flex-1">
          <div className="truncate text-[16px] font-semibold text-ink">{conversation.employeeName}</div>
          <div className="truncate text-[12.5px] text-muted">
            {conversation.status === 'encerrada' ? 'offline' : 'online'} · {conversation.employeeDepartment}
            {conversation.ticketId && ` · ${conversation.ticketId}`}
          </div>
        </div>
        {mine ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => onAction('return')} loading={busy === 'return'}>
              <Bot className="h-4 w-4" /> Devolver ao agent
            </Button>
            <Button size="sm" variant="danger" onClick={() => onAction('close')} loading={busy === 'close'}>
              <CircleCheck className="h-4 w-4" /> Encerrar atendimento
            </Button>
          </div>
        ) : conversation.status === 'aguardando_atendente' ? (
          <span className="hidden items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1 text-[13px] font-medium text-amber-ink sm:inline-flex">
            <Bot className="h-4 w-4" /> Aguardando atendente
          </span>
        ) : conversation.status === 'agent' ? (
          <span className="hidden items-center gap-1.5 rounded-full bg-green-soft px-3 py-1 text-[13px] font-medium text-green-ink sm:inline-flex">
            <Bot className="h-4 w-4" /> Com o agent
          </span>
        ) : null}
        {!mine && (
          <button
            className="rounded-md p-2 text-ink-soft hover:bg-subtle"
            aria-label="Pesquisar conversas"
            onClick={() => document.getElementById('console-search')?.focus()}
          >
            <Search className="h-4.5 w-4.5" />
          </button>
        )}
        <button
          className="rounded-md p-2 text-ink-soft hover:bg-subtle"
          aria-label="Mostrar ou ocultar os chamados do funcionário"
          title="Chamados do funcionário"
          onClick={onToggleTickets}
        >
          <MoreVertical className="h-4.5 w-4.5" />
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] space-y-3 px-5 py-6">
          {messages.map((m, idx) => {
            const day = formatDayLabel(m.createdAt);
            const showDay = startsNewDay(messages, idx, formatDayLabel);
            const isTransfer = m.role === 'system' && m.text.startsWith('Transferida');
            const isLastTransfer =
              isTransfer && !messages.slice(idx + 1).some((x) => x.role === 'system' && x.text.startsWith('Transferida'));
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-md bg-white px-2.5 py-0.5 text-[12px] text-muted shadow-sm">{day}</span>
                  </div>
                )}
                {m.role === 'user' && (
                  <div className="max-w-[78%]">
                    <p className="inline-block rounded-2xl rounded-tl-md bg-white px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-ink shadow-[0_1px_1px_rgb(16_24_40/0.05)]">
                      {m.text}
                      <span className="ml-2 align-bottom text-[11.5px] text-muted">{formatTime(m.createdAt)}</span>
                    </p>
                  </div>
                )}
                {m.role === 'assistant' && <AgentMessage m={m} />}
                {m.role === 'analyst' && (
                  <div className="ml-auto flex max-w-[80%] flex-col items-end">
                    <div className="mb-1 flex items-center gap-1.5 text-[12.5px]">
                      <span className="font-semibold text-ink">{m.authorName}</span>
                      <span className="rounded bg-green-soft px-1.5 text-[11px] font-semibold text-green-ink">Suporte</span>
                    </div>
                    <div className="rounded-2xl rounded-tr-md bg-analyst-bubble px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-ink">
                      {m.text}
                      <div className="mt-1 flex items-center justify-end gap-1 text-[11.5px] text-muted">
                        {formatTime(m.createdAt)} <CheckCheck className="h-3.5 w-3.5 text-brand" />
                      </div>
                    </div>
                  </div>
                )}
                {m.role === 'system' && <SystemDivider text={m.text} at={m.createdAt} />}
                {isLastTransfer && handoff && conversation.status !== 'agent' && (
                  <div className="mt-3">
                    <HandoffSummary handoff={handoff} />
                  </div>
                )}
              </div>
            );
          })}
          {handoff &&
            conversation.status === 'aguardando_atendente' &&
            !messages.some((m) => m.role === 'system' && m.text.startsWith('Transferida')) && <HandoffSummary handoff={handoff} />}
          <div ref={bottom} />
        </div>
      </div>

      <footer className="shrink-0 border-t border-line bg-white px-4 py-3">
        {error && (
          <p className="mb-2 rounded-lg bg-red-soft px-3 py-2 text-[13px] text-red" role="alert">
            {error}
          </p>
        )}
        {mine ? (
          <Composer
            variant="console"
            onSend={onSend}
            disabled={busy === 'send'}
            placeholder={`Responder para ${firstName}…`}
            buttonLabel="Enviar resposta"
            maxLength={4000}
          />
        ) : conversation.status === 'encerrada' ? (
          <p className="py-2 text-center text-[13.5px] text-muted">Atendimento encerrado.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-soft text-amber">
                {conversation.status === 'agent' ? <Bot className="h-4.5 w-4.5" /> : <Hand className="h-4.5 w-4.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold text-ink">
                  {conversation.status === 'aguardando_atendente'
                    ? `${firstName} espera um atendente`
                    : conversation.status === 'agent'
                      ? 'O Nexo Assist está atendendo'
                      : `${conversation.assignedAnalystName} está atendendo`}
                </div>
                <div className="truncate text-[12.5px] text-muted">
                  {conversation.status === 'aguardando_atendente'
                    ? `Agent pausado${conversation.handoffDueAt ? ` · até ${formatTime(conversation.handoffDueAt)}` : ''}`
                    : conversation.status === 'agent'
                      ? 'Você pode assumir se achar necessário'
                      : 'Agent pausado'}
                </div>
              </div>
              {conversation.status === 'aguardando_atendente' && (
                <Button size="sm" className="shrink-0" onClick={() => onAction('return')} loading={busy === 'return'}>
                  <Bot className="h-4 w-4" /> Devolver ao agent
                </Button>
              )}
              {conversation.status !== 'com_analista' && (
                <Button size="sm" className="shrink-0" variant="primary" onClick={() => onAction('assume')} loading={busy === 'assume'}>
                  <Headset className="h-4 w-4" /> Assumir atendimento
                </Button>
              )}
            </div>
            <div className="rounded-xl bg-subtle px-4 py-3 text-[14px] text-faint">Assuma o atendimento para responder</div>
          </>
        )}
      </footer>
    </section>
  );
}
