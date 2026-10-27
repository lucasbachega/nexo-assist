'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, SendHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Caixa de mensagem: Enter envia, Shift+Enter quebra linha. */
export function Composer({
  onSend,
  disabled,
  placeholder = 'Escreva para o Nexo…',
  buttonLabel = 'Enviar',
  maxLength = 2000,
  variant = 'chat',
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  buttonLabel?: string;
  maxLength?: number;
  variant?: 'chat' | 'console';
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        'flex items-end gap-2 border bg-white p-1.5 pl-4 transition-shadow focus-within:border-brand-line focus-within:shadow-[0_0_0_3px_rgb(10_102_201/0.08)]',
        variant === 'chat' ? 'rounded-xl border-line shadow-card' : 'rounded-xl border-line',
        disabled && 'bg-subtle',
      )}
    >
      <label htmlFor="composer" className="sr-only">
        Mensagem
      </label>
      <textarea
        id="composer"
        ref={ref}
        rows={1}
        value={text}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
      />
      {variant === 'chat' ? (
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[14px] font-medium text-white shadow-sm transition-colors hover:bg-brand-strong disabled:opacity-50"
        >
          <ArrowUp className="h-4 w-4" /> {buttonLabel}
        </button>
      ) : (
        <button
          type="submit"
          aria-label={buttonLabel}
          disabled={disabled || !text.trim()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-sm hover:bg-brand-strong disabled:opacity-50"
        >
          <SendHorizontal className="h-4.5 w-4.5" />
        </button>
      )}
    </form>
  );
}
