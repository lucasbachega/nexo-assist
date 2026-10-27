import { PRIORITY_LABEL, STATUS_LABEL, formatDateTime, type TicketView } from '@nexo/shared';
import { cn } from '@/lib/cn';
import { STATUS_TONE } from '@/lib/labels';
import { StatusDot, StatusLabel } from '@/components/ui/StatusDot';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-0.5 text-[14.5px] text-ink">{children}</div>
    </div>
  );
}

/** Cartão de chamado com status e situação do prazo. */
export function TicketCard({ ticket }: { ticket: TicketView }) {
  const overdue = ticket.sla.overdue;
  return (
    <article className="rounded-xl border border-line bg-white p-4 shadow-card">
      <header className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-muted">
          Chamado <span className="px-1 text-faint">·</span> {ticket.id}
        </span>
        <StatusLabel tone={STATUS_TONE[ticket.status]} strong>
          {STATUS_LABEL[ticket.status]}
        </StatusLabel>
      </header>
      <h3 className="mt-2 text-[18px] leading-snug font-semibold text-ink">{ticket.title}</h3>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{ticket.description}</p>
      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line-soft pt-3 sm:grid-cols-4">
        <Field label="Categoria">{ticket.category}</Field>
        <Field label="Prioridade">
          <span className="inline-flex items-center gap-1.5">
            <StatusDot tone={ticket.priority === 'critica' ? 'red' : ticket.priority === 'alta' ? 'amber' : 'gray'} />
            {PRIORITY_LABEL[ticket.priority]}
          </span>
        </Field>
        <Field label="Aberto em">{formatDateTime(ticket.createdAt)}</Field>
        <Field label="Última atualização">
          <span className={cn(overdue && 'font-medium text-amber-ink')}>{ticket.sla.sinceLastUpdate}</span>
          {ticket.sla.state === 'running' && (
            <span className={cn('text-[13px]', overdue ? 'text-ink-soft' : 'text-muted')}> · {overdue ? 'prazo vencido' : ticket.sla.summary}</span>
          )}
        </Field>
      </div>
    </article>
  );
}
