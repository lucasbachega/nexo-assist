import { Headset } from 'lucide-react';
import { formatTime } from '@nexo/shared';

/** Confirmação da transferência, com o resumo que o analista recebeu. */
export function HandoffCard({ queue, eta, summary }: { queue: string; eta: string | null; summary: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Headset className="h-4 w-4" />
        </span>
        Transferida para {queue}
        {eta && <span className="font-normal text-muted">· um analista assume até {formatTime(eta)}</span>}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        <span className="text-muted">Resumo enviado ao analista: </span>
        {summary}
      </p>
    </div>
  );
}
