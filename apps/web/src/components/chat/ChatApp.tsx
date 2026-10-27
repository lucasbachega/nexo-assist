'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Headset, Lock } from 'lucide-react';
import {
  formatDayLabel,
  formatTime,
  type ChatMessage,
  type ConversationView,
  type Decision,
  type SessionUsage,
  type TurnEvent,
  type UiBlock,
} from '@nexo/shared';
import { api, ApiError, streamChat } from '@/lib/api';
import type { LiveStep } from '@/components/decision/AgentHeader';
import { Composer } from './Composer';
import { AnalystBubble, AssistantTurn, SystemDivider, UserBubble, type InteractionContext } from './MessageItem';

interface ChatState {
  conversation: ConversationView | null;
  messages: ChatMessage[];
  usage: SessionUsage;
}

interface PendingTurn {
  userText: string;
  steps: LiveStep[];
  text: string;
  blocks: UiBlock[];
  decision: Decision | null;
}

const SUGGESTIONS = [
  'Qual o status do meu chamado?',
  'Meu notebook não conecta na VPN',
  'Como redefino a senha da rede?',
  'Preciso de um segundo monitor',
];

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const bySeq = new Map(current.map((m) => [m.seq, m]));
  for (const m of incoming) bySeq.set(m.seq, m);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export function ChatApp({ firstName }: { firstName: string }) {
  const [state, setState] = useState<ChatState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setState(await api<ChatState>('/api/chat'));
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Não foi possível carregar a conversa.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const poll = useCallback(async () => {
    const s = stateRef.current;
    if (!s?.conversation) return;
    const after = s.messages.at(-1)?.seq ?? 0;
    try {
      const r = await api<{ conversation: ConversationView; messages: ChatMessage[]; usage: SessionUsage }>(
        `/api/chat/messages?conversationId=${encodeURIComponent(s.conversation.id)}&after=${after}`,
      );
      setState((prev) => (prev ? { conversation: r.conversation, messages: mergeMessages(prev.messages, r.messages), usage: r.usage } : prev));
    } catch {
      /* polling silencioso: tenta de novo no próximo ciclo */
    }
  }, []);

  // Atualizações em tempo quase real: mais frequentes quando há analista envolvido.
  const status = state?.conversation?.status;
  useEffect(() => {
    if (!status || pending) return;
    const ms = status === 'agent' ? 15_000 : 3_000;
    const id = window.setInterval(() => void poll(), ms);
    return () => window.clearInterval(id);
  }, [status, pending, poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state?.messages.length, pending?.text, pending?.steps.length, pending?.blocks.length]);

  const busy = pending !== null;

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setSendError(null);
      setPending({ userText: text, steps: [], text: '', blocks: [], decision: null });
      let userEchoed = false;

      const onEvent = (e: TurnEvent) => {
        switch (e.type) {
          case 'user_message':
            userEchoed = true;
            setState((prev) =>
              prev
                ? { ...prev, conversation: prev.conversation?.id === e.message.conversationId ? prev.conversation : null, messages: mergeMessages(prev.conversation?.id === e.message.conversationId ? prev.messages : [], [e.message]) }
                : prev,
            );
            break;
          case 'step_start':
            setPending((p) => (p ? { ...p, steps: [...p.steps, { id: e.id, label: e.label, status: 'running' }] } : p));
            break;
          case 'step_end':
            if (e.step.silent) break;
            setPending((p) => (p ? { ...p, steps: p.steps.map((s) => (s.id === e.step.id ? { ...s, status: e.step.status } : s)) } : p));
            break;
          case 'text':
            setPending((p) => (p ? { ...p, text: p.text + e.delta } : p));
            break;
          case 'block':
            setPending((p) => (p ? { ...p, blocks: [...p.blocks.filter((b) => !(b.type === e.block.type && b.type !== 'draft' && b.type !== 'ticket_card')), e.block] } : p));
            break;
          case 'decision':
            setPending((p) => (p ? { ...p, decision: e.decision } : p));
            break;
          case 'done':
            setState((prev) => (prev ? { conversation: e.conversation, messages: mergeMessages(prev.messages, [e.message]), usage: e.usage } : prev));
            break;
          case 'queued':
            setState((prev) => (prev ? { ...prev, conversation: e.conversation, usage: e.usage } : prev));
            break;
          case 'error':
            setSendError(e.message);
            break;
        }
      };

      try {
        await streamChat(text, onEvent);
      } catch (e) {
        setSendError(e instanceof ApiError ? e.message : 'Não consegui enviar. Tente de novo.');
      } finally {
        setPending(null);
        if (userEchoed) await poll();
        else await load();
      }
    },
    [busy, poll, load],
  );

  const appendMessages = useCallback((msgs: ChatMessage[]) => {
    if (msgs.length) setState((prev) => (prev ? { ...prev, messages: mergeMessages(prev.messages, msgs) } : prev));
    void poll();
  }, [poll]);

  const messages = state?.messages ?? [];
  const latestPendingDraftId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const d = messages[i]?.blocks.find((b) => b.type === 'draft' && (b.draft.status === 'pendente' || b.draft.status === 'falhou'));
      if (d && d.type === 'draft') return d.draft.id;
    }
    return null;
  }, [messages]);
  const lastUserText = useMemo(() => [...messages].reverse().find((m) => m.role === 'user')?.text ?? null, [messages]);

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red" />
          <p className="mt-3 text-[15px] text-ink">{loadError}</p>
          <button className="mt-3 text-[14px] font-medium text-brand hover:underline" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const conversation = state?.conversation ?? null;
  const usage = state?.usage ?? { used: 0, limit: 30 };
  const limitReached = usage.used >= usage.limit;
  const empty = state !== null && messages.length === 0 && !pending;

  let lastDay = '';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[800px] space-y-5 px-4 pt-10 pb-6 sm:px-6" aria-live="polite">
          {state === null && <ChatSkeleton />}

          {empty && (
            <div className="pt-[8vh] text-center">
              <h1 className="font-serif text-[34px] leading-tight text-ink">Olá, {firstName}. Como posso ajudar?</h1>
              <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">
                Descreva o problema com suas palavras. Eu consulto seus chamados, busco na central de ajuda e chamo um analista quando precisar.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => void send(s)} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[14px] text-ink-soft hover:border-brand-line hover:bg-brand-soft/50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => {
            const day = formatDayLabel(m.createdAt);
            const showDay = day !== lastDay && idx > 0;
            lastDay = day;
            const next = messages.slice(idx + 1).find((x) => x.role === 'user');
            const ctx: InteractionContext = {
              nextUserText: next?.text ?? (pending && idx === messages.length - 1 ? pending.userText : null),
              latestPendingDraftId,
              lastUserText,
              busy,
              onSend: (t) => void send(t),
              onMessages: appendMessages,
            };
            return (
              <div key={m.id}>
                {showDay && <SystemDivider text={day} />}
                {m.role === 'user' && <UserBubble text={m.text} />}
                {m.role === 'assistant' && <AssistantTurn text={m.text} blocks={m.blocks} trace={m.trace} ctx={ctx} />}
                {m.role === 'analyst' && <AnalystBubble message={m} />}
                {m.role === 'system' && <SystemDivider text={m.text} at={m.createdAt} />}
              </div>
            );
          })}

          {pending && (
            <>
              {!messages.some((m) => m.role === 'user' && m.text === pending.userText && m.seq === messages.at(-1)?.seq) && <UserBubble text={pending.userText} />}
              {conversation?.status === 'agent' || !conversation ? (
                <AssistantTurn
                  text={pending.text}
                  blocks={pending.blocks}
                  trace={null}
                  liveSteps={pending.steps}
                  streaming
                  decision={pending.decision}
                  ctx={{ nextUserText: null, latestPendingDraftId: null, lastUserText: null, busy: true, onSend: () => undefined, onMessages: () => undefined }}
                />
              ) : null}
            </>
          )}

          {sendError && (
            <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-soft px-3 py-2 text-[13.5px] text-red">
              <AlertCircle className="h-4 w-4 shrink-0" /> {sendError}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[800px] px-4 pb-4 sm:px-6">
        <ConversationBanner conversation={conversation} />
        <Composer
          onSend={(t) => void send(t)}
          disabled={busy || state === null || limitReached}
          placeholder={limitReached ? 'Limite de mensagens desta sessão atingido' : 'Escreva para o Nexo…'}
        />
        <p className={limitReached ? 'mt-2 text-right text-[12.5px] text-red' : 'mt-2 text-right text-[12.5px] text-muted'}>
          {limitReached ? 'Você usou todas as mensagens desta sessão. Saia e entre de novo para continuar. ' : ''}
          {usage.used}/{usage.limit} mensagens nesta sessão
        </p>
      </div>
    </div>
  );
}

function ConversationBanner({ conversation }: { conversation: ConversationView | null }) {
  if (!conversation || conversation.status === 'agent') return null;
  const base = 'mb-2 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13.5px]';
  if (conversation.status === 'aguardando_atendente') {
    return (
      <div className={`${base} border-amber/30 bg-amber-soft/70 text-amber-ink`} role="status">
        <Headset className="h-4 w-4 shrink-0" />
        <span>
          Você está na fila do <strong className="font-medium">{conversation.handoff?.queue ?? 'suporte'}</strong>
          {conversation.handoff?.dueAt ? ` — um analista assume até ${formatTime(conversation.handoff.dueAt)}` : ''}. Pode continuar escrevendo: ele vai ler tudo.
        </span>
      </div>
    );
  }
  if (conversation.status === 'com_analista') {
    return (
      <div className={`${base} border-[#cfe9d8] bg-green-soft text-green-ink`} role="status">
        <Headset className="h-4 w-4 shrink-0" />
        <span>
          <strong className="font-medium">{conversation.assignedAnalystName}</strong> está te atendendo. O Nexo Assist fica em pausa enquanto isso.
        </span>
      </div>
    );
  }
  return (
    <div className={`${base} border-line bg-subtle text-muted`} role="status">
      <Lock className="h-4 w-4 shrink-0" />
      <span>Este atendimento foi encerrado. Envie uma mensagem para começar um novo.</span>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="ml-auto h-11 w-64 animate-pulse rounded-2xl bg-line-soft" />
      <div className="h-4 w-48 animate-pulse rounded bg-line-soft" />
      <div className="h-16 w-[480px] max-w-full animate-pulse rounded-xl bg-line-soft" />
    </div>
  );
}
