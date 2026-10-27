'use client';

import { AlertTriangle, Check, CircleSlash, Cpu, RotateCw, ShieldCheck, X } from 'lucide-react';
import { INTENT_LABEL, type TraceStep, type TurnTrace } from '@nexo/shared';
import { cn } from '@/lib/cn';

function confidenceTone(c: number) {
  if (c >= 0.75) return { bar: 'bg-green', text: 'text-green-ink', bg: 'bg-green-soft', label: 'alta' };
  if (c >= 0.5) return { bar: 'bg-amber', text: 'text-amber-ink', bg: 'bg-amber-soft', label: 'média' };
  return { bar: 'bg-red', text: 'text-red', bg: 'bg-red-soft', label: 'baixa' };
}

export function ConfidencePill({ value }: { value: number }) {
  const t = confidenceTone(value);
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[12px] font-medium', t.bg, t.text)}>
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-white/70">
        <span className={cn('absolute inset-y-0 left-0 rounded-full', t.bar)} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      Confiança {Math.round(value * 100)}% · {t.label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 py-1.5 text-[13px] leading-relaxed">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function StepItem({ step }: { step: TraceStep }) {
  return (
    <li className="relative pl-6">
      <span
        className={cn(
          'absolute top-0.5 left-0 flex h-4 w-4 items-center justify-center rounded-full',
          step.status === 'ok' ? 'bg-green-soft text-green-ink' : 'bg-red-soft text-red',
        )}
      >
        {step.status === 'ok' ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <X className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
        <span className={cn('font-medium', step.silent ? 'text-ink-soft' : 'text-ink')}>{step.label}</span>
        <code className="text-[11px] text-faint">{step.tool}</code>
        {step.durationMs > 0 && <span className="text-[11px] text-faint">{step.durationMs} ms</span>}
        {step.attempts > 1 && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-soft px-1.5 text-[11px] text-amber-ink">
            <RotateCw className="h-3 w-3" /> {step.attempts} tentativas
          </span>
        )}
      </div>
      {step.details.length > 0 && (
        <ul className="mt-0.5 space-y-0.5">
          {step.details.map((d, i) => (
            <li key={i} className="text-[12.5px] leading-snug text-muted">
              {d}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * "Como o Nexo decidiu": o que o agent entendeu, a ação, a confiança, o porquê,
 * cada passo (com tentativas no legado) e as regras aplicadas pelo sistema.
 */
export function DecisionPanel({ trace, className }: { trace: TurnTrace; className?: string }) {
  const d = trace.decision;
  return (
    <section
      aria-label="Detalhes da decisão do agent"
      className={cn('animate-fade-up rounded-xl border border-line bg-subtle/70 p-4', className)}
    >
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="text-[13px] font-semibold text-ink">Como o Nexo decidiu</h4>
        {d && (
          <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[12px] text-ink-soft">{INTENT_LABEL[d.intent]}</span>
        )}
        {d && <ConfidencePill value={d.confidence} />}
      </header>

      {trace.failed && (
        <p className="mb-2 flex items-center gap-2 text-[13px] text-red">
          <CircleSlash className="h-4 w-4" /> Este turno falhou antes de concluir.
        </p>
      )}

      {d && (
        <dl className="divide-y divide-line-soft">
          <Row label="Entendi">{d.understood}</Row>
          <Row label="Ação">{d.action}</Row>
          <Row label="Por quê">{d.rationale}</Row>
          {d.missingInfo.length > 0 && <Row label="Falta saber">{d.missingInfo.join(' · ')}</Row>}
        </dl>
      )}
      {trace.decisionInferred && (
        <p className="mt-1 text-[12px] text-amber-ink">
          O modelo não registrou a decisão; este resumo foi inferido pelo sistema a partir das ações.
        </p>
      )}

      {trace.steps.length > 0 && (
        <div className="mt-3">
          <h5 className="mb-2 text-[12px] font-medium tracking-wide text-muted uppercase">Passos</h5>
          <ol className="space-y-2.5">
            {trace.steps.map((s) => (
              <StepItem key={s.id} step={s} />
            ))}
          </ol>
        </div>
      )}

      {trace.guardrails.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber/30 bg-amber-soft/60 p-2.5">
          <h5 className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-amber-ink">
            <ShieldCheck className="h-3.5 w-3.5" /> Regras aplicadas pelo sistema
          </h5>
          <ul className="space-y-0.5">
            {trace.guardrails.map((g, i) => (
              <li key={i} className="flex gap-1.5 text-[12.5px] text-ink-soft">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber" /> {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft pt-2 text-[11.5px] text-faint">
        <span className="inline-flex items-center gap-1">
          <Cpu className="h-3 w-3" /> {trace.model ?? 'Ação do sistema (sem modelo)'}
        </span>
        {trace.usage && (
          <span>
            {trace.usage.inputTokens.toLocaleString('pt-BR')} tokens de entrada · {trace.usage.outputTokens.toLocaleString('pt-BR')} de
            saída
          </span>
        )}
        {trace.latencyMs > 0 && <span>{(trace.latencyMs / 1000).toFixed(1)} s</span>}
      </footer>
    </section>
  );
}
