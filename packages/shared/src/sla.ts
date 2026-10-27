import { SLA_RUNNING_STATUSES, type Priority, type Ticket } from './domain';
import { formatDateTime, formatSince, formatTime, fromLocalWall, toLocalWall } from './time';

/**
 * Prazos do Anexo A. O prazo vale para a primeira resposta e para cada atualização
 * da TI; passado o prazo, o chamado está vencido.
 *
 * Horário útil: segunda a sexta, 8h às 18h (artigo "Horário do service desk").
 * Crítica conta em horas corridas (plantão 24h).
 * Feriados não são considerados (simplificação documentada no README).
 */
export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 18;

export type SlaRule =
  | { kind: 'wall_minutes'; minutes: number; label: string }
  | { kind: 'business_minutes'; minutes: number; label: string }
  | { kind: 'business_days'; days: number; label: string };

export const SLA_RULES: Record<Priority, SlaRule> = {
  critica: { kind: 'wall_minutes', minutes: 60, label: '1 hora' },
  alta: { kind: 'business_minutes', minutes: 4 * 60, label: '4 horas úteis' },
  media: { kind: 'business_days', days: 3, label: '3 dias úteis' },
  baixa: { kind: 'business_days', days: 5, label: '5 dias úteis' },
};

const isWeekend = (wall: Date) => wall.getUTCDay() === 0 || wall.getUTCDay() === 6;

function atHour(wall: Date, hour: number): Date {
  const d = new Date(wall);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function nextBusinessOpening(wall: Date): Date {
  let d = atHour(new Date(wall.getTime() + 86_400_000), BUSINESS_START_HOUR);
  while (isWeekend(d)) d = new Date(d.getTime() + 86_400_000);
  return d;
}

/** Leva um instante (relógio local) para o próximo momento dentro do horário útil. */
export function normalizeToBusinessTime(wall: Date): Date {
  if (isWeekend(wall)) return nextBusinessOpening(atHour(wall, 0));
  const minutes = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  if (minutes < BUSINESS_START_HOUR * 60) return atHour(wall, BUSINESS_START_HOUR);
  if (minutes >= BUSINESS_END_HOUR * 60) return nextBusinessOpening(wall);
  return wall;
}

export function addBusinessMinutes(start: Date, minutes: number): Date {
  let cur = normalizeToBusinessTime(toLocalWall(start));
  let remaining = minutes;
  while (remaining > 0) {
    const endOfDay = atHour(cur, BUSINESS_END_HOUR);
    const available = Math.floor((endOfDay.getTime() - cur.getTime()) / 60_000);
    if (remaining <= available) {
      cur = new Date(cur.getTime() + remaining * 60_000);
      remaining = 0;
    } else {
      remaining -= available;
      cur = nextBusinessOpening(cur);
    }
  }
  return fromLocalWall(cur);
}

export function addBusinessDays(start: Date, days: number): Date {
  let cur = normalizeToBusinessTime(toLocalWall(start));
  let left = days;
  while (left > 0) {
    cur = new Date(cur.getTime() + 86_400_000);
    if (!isWeekend(cur)) left -= 1;
  }
  return fromLocalWall(cur);
}

export function computeDeadline(anchor: Date, priority: Priority): Date {
  const rule = SLA_RULES[priority];
  switch (rule.kind) {
    case 'wall_minutes':
      return new Date(anchor.getTime() + rule.minutes * 60_000);
    case 'business_minutes':
      return addBusinessMinutes(anchor, rule.minutes);
    case 'business_days':
      return addBusinessDays(anchor, rule.days);
  }
}

export interface SlaStatus {
  /** 'running' = prazo correndo; 'paused' = aguardando o funcionário; 'none' = encerrado. */
  state: 'running' | 'paused' | 'none';
  rule: string;
  deadline: string | null;
  overdue: boolean;
  /** Ex.: "há 5 dias" desde a última atualização da TI. */
  sinceLastUpdate: string;
  /** Frase pronta, ex.: "prazo vencido" / "responde até 13:43" / "responde até 21 out, 14:20". */
  summary: string;
}

export function computeSlaStatus(
  ticket: Pick<Ticket, 'priority' | 'status' | 'lastSupportUpdateAt'>,
  now: Date = new Date(),
): SlaStatus {
  const rule = SLA_RULES[ticket.priority].label;
  const sinceLastUpdate = formatSince(ticket.lastSupportUpdateAt, now);
  if (!SLA_RUNNING_STATUSES.includes(ticket.status)) {
    const state = ticket.status === 'aguardando_usuario' ? 'paused' : 'none';
    return {
      state,
      rule,
      deadline: null,
      overdue: false,
      sinceLastUpdate,
      summary: state === 'paused' ? 'aguardando sua resposta' : 'encerrado',
    };
  }
  const deadline = computeDeadline(new Date(ticket.lastSupportUpdateAt), ticket.priority);
  const overdue = now.getTime() > deadline.getTime();
  const sameDay = formatDateTime(deadline).slice(0, 6) === formatDateTime(now).slice(0, 6);
  return {
    state: 'running',
    rule,
    deadline: deadline.toISOString(),
    overdue,
    sinceLastUpdate,
    summary: overdue
      ? 'prazo vencido'
      : `resposta até ${sameDay ? formatTime(deadline) : formatDateTime(deadline)}`,
  };
}
