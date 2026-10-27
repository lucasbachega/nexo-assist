'use client';

import { useState } from 'react';
import { CheckCircle2, KeyRound, Lock, Mail, RotateCcw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

export function ProfileView({ name, email }: { name: string; email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function reset() {
    setState('sending');
    try {
      await api('/api/profile/password-reset', { method: 'POST' });
      setState('sent');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar agora.');
      setState('error');
    }
  }

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[580px] px-4 py-14">
        <h1 className="text-[24px] font-semibold text-ink">Meu perfil</h1>
        <p className="mt-1 text-[14.5px] text-muted">Seus dados de acesso ao service desk de TI.</p>

        <section className="mt-6 overflow-hidden rounded-xl border border-line bg-white shadow-card">
          <div className="grid grid-cols-[150px_1fr] items-center gap-4 px-6 py-4 text-[14.5px]">
            <span className="text-muted">Nome</span>
            <span className="text-ink">{name}</span>
          </div>
          <div className="grid grid-cols-[150px_1fr_auto] items-center gap-4 border-t border-line-soft px-6 py-4 text-[14.5px]">
            <span className="text-muted">E-mail corporativo</span>
            <span className="truncate text-ink">{email}</span>
            <span className="inline-flex items-center gap-1 text-[12.5px] text-muted">
              <Lock className="h-3.5 w-3.5" /> Gerenciado pela TI
            </span>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-line bg-white shadow-card">
          <div className="flex items-center gap-4 px-6 py-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-ink-soft">
              <KeyRound className="h-4.5 w-4.5" />
            </span>
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-ink">Senha</div>
              <div className="text-[13.5px] text-muted">Alterada há 42 dias</div>
            </div>
            <button
              onClick={() => void reset()}
              disabled={state === 'sending'}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3.5 text-[14px] text-ink hover:bg-subtle disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" /> {state === 'sending' ? 'Enviando…' : 'Redefinir senha'}
            </button>
          </div>
          <div className="flex items-center gap-2 border-t border-line-soft bg-subtle px-6 py-2.5 text-[13px] text-muted" role="status">
            {state === 'sent' ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green" /> Link de redefinição enviado para {email}. Ele vale por 30 minutos.
              </>
            ) : state === 'error' ? (
              <span className="text-red">{error}</span>
            ) : (
              <>
                <Mail className="h-4 w-4" /> Enviaremos um link de redefinição para {email}.
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
