'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/ui/Logo';

const DEMO = [
  { email: 'ana.souza@nexo.com.br', label: 'Ana Souza', hint: 'Funcionária · Windows 11' },
  { email: 'carla.mendes@nexo.com.br', label: 'Carla Mendes', hint: 'Funcionária · Windows 10' },
  { email: 'rafael.lima@nexo.com.br', label: 'Rafael Lima', hint: 'Analista · Suporte N2' },
];

const field =
  'flex h-12 items-center gap-2.5 rounded-xl border bg-white px-3.5 transition-shadow focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgb(10_102_201/0.12)]';

export function LoginScreen({ expired }: { expired: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(expired ? 'Sua sessão expirou. Entre de novo.' : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ redirect: string }>('/api/auth/login', { method: 'POST', json: { email, password, remember } });
      router.replace(r.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.12fr_1fr]">
      {/* Apresentação */}
      <section className="relative hidden flex-col bg-navy px-16 pt-10 pb-10 text-white lg:flex">
        <Logo tone="light" />
        <div className="mt-[14vh] max-w-[620px]">
          <p className="text-[14px] text-white/55">Service desk de TI da Nexo</p>
          <h1 className="mt-3 font-serif text-[52px] leading-[1.08] tracking-[-0.01em]">Seu problema de TI, resolvido em uma conversa.</h1>
          <p className="mt-5 max-w-[500px] text-[16px] leading-relaxed text-white/60">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.
          </p>
        </div>

        <div className="mt-10 max-w-[480px] rounded-2xl border border-white/10 bg-navy-2 p-4" aria-hidden>
          <p className="ml-auto w-fit rounded-xl bg-white px-3.5 py-2 text-[14px] text-ink">Meu notebook não conecta na VPN. Erro 809.</p>
          <p className="mt-3 text-[12.5px] text-white/50">
            <span className="font-semibold text-white/85">Nexo Assist</span> consultou seus chamados · criou um chamado
          </p>
          <p className="mt-1.5 max-w-[360px] rounded-xl bg-white/10 px-3.5 py-2 text-[14px] leading-relaxed text-white/90">
            Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
          </p>
          <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-[12.5px] text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" /> <span className="font-semibold">INC-20517</span>
            <span className="text-muted">Rede e VPN · Alta · em até 4 h</span>
          </p>
        </div>

        <dl className="mt-auto grid grid-cols-3 border-t border-white/10 pt-6">
          {[
            ['8 s', 'primeira resposta, em média'],
            ['72%', 'resolvidos sem fila'],
            ['6', 'analistas online agora'],
          ].map(([v, l], i) => (
            <div key={l} className={cn('px-6 first:pl-0', i > 0 && 'border-l border-white/10')}>
              <dt className="font-serif text-[30px]">
                {v}
                {i === 2 && <span className="ml-2 inline-block h-2 w-2 -translate-y-1 rounded-full bg-green" />}
              </dt>
              <dd className="mt-1 text-[13px] text-white/50">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Formulário */}
      <section className="flex flex-col px-6 py-8 sm:px-14">
        <div className="flex items-center justify-between text-[13.5px] lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <span className="text-muted">
            Problema para entrar? <a href="tel:4000" className="font-medium text-brand hover:underline">Ligue no ramal 4000</a>
          </span>
        </div>

        <div className="mx-auto my-auto w-full max-w-[368px] py-10">
          <h2 className="font-serif text-[38px] leading-tight text-ink">Entrar</h2>
          <p className="mt-1 text-[15px] text-muted">Use seu e-mail corporativo e a senha da rede Nexo.</p>

          <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[14px] font-medium text-ink">
                E-mail corporativo
              </label>
              <div className={cn(field, 'border-line')}>
                <Mail className="h-4 w-4 text-muted" />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome.sobrenome@nexo.com.br"
                  className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
                />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-[14px] font-medium text-ink">
                  Senha
                </label>
                <a href="tel:4000" className="text-[13.5px] font-medium text-brand hover:underline" title="Ligue no ramal 4000">
                  Esqueci minha senha
                </a>
              </div>
              <div className={cn(field, 'border-line')}>
                <Lock className="h-4 w-4 text-muted" />
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 bg-transparent text-[15px] tracking-wide text-ink outline-none"
                />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} className="text-muted hover:text-ink">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-ink-soft select-none">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="peer sr-only" />
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border border-line bg-white peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40">
                {remember && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </span>
              Manter conectado neste computador
            </label>

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-soft px-3 py-2 text-[13.5px] text-red">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15.5px] font-semibold text-white shadow-[0_6px_16px_rgb(10_102_201/0.25)] transition-colors hover:bg-brand-strong disabled:opacity-60"
            >
              {loading ? 'Entrando…' : 'Entrar'} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-8 border-t border-line pt-5">
            <p className="text-[12.5px] font-medium tracking-wide text-muted uppercase">Contas de demonstração · qualquer senha</p>
            <div className="mt-2.5 space-y-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword('demo');
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-line-soft px-3 py-2 text-left text-[13.5px] hover:border-line hover:bg-subtle"
                >
                  <span className="font-medium text-ink">{d.label}</span>
                  <span className="text-muted">{d.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between text-[12.5px] text-muted">
          <span>© {new Date().getFullYear()} Nexo · Service desk de TI</span>
          <a href="#privacidade" className="hover:text-ink" title="Conversas são vistas só por você e pela equipe de TI.">
            Privacidade e uso de dados
          </a>
        </footer>
      </section>
    </div>
  );
}
