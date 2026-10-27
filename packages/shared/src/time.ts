/**
 * Utilitários de data no fuso da Nexo (America/Sao_Paulo).
 *
 * O Brasil não tem horário de verão desde 2019, então usamos um deslocamento fixo
 * de UTC−03:00. Isso deixa as contas de horário útil determinísticas, sem depender
 * do fuso do servidor ou do navegador (servidor e cliente formatam igual).
 */
export const NEXO_UTC_OFFSET_MIN = -180;

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;

/** Representa o "relógio de parede" local como um Date cujos campos UTC são os locais. */
export function toLocalWall(date: Date): Date {
  return new Date(date.getTime() + NEXO_UTC_OFFSET_MIN * 60_000);
}

export function fromLocalWall(wall: Date): Date {
  return new Date(wall.getTime() - NEXO_UTC_OFFSET_MIN * 60_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "13:43" */
export function formatTime(iso: string | Date): string {
  const w = toLocalWall(new Date(iso));
  return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}

/** "16 out" */
export function formatDayMonth(iso: string | Date): string {
  const w = toLocalWall(new Date(iso));
  return `${pad(w.getUTCDate())} ${MONTHS[w.getUTCMonth()]}`;
}

/** "16 out, 14:20" */
export function formatDateTime(iso: string | Date): string {
  return `${formatDayMonth(iso)}, ${formatTime(iso)}`;
}

/** "terça, 27 out, 10:35" — usado no contexto do agent. */
export function formatFullLocal(iso: string | Date): string {
  const w = toLocalWall(new Date(iso));
  return `${WEEKDAYS[w.getUTCDay()]}, ${formatDateTime(iso)}`;
}

/** "Hoje", "Ontem" ou "16 out" — separadores de data no chat. */
export function formatDayLabel(iso: string | Date, now: Date = new Date()): string {
  const d = toLocalWall(new Date(iso));
  const n = toLocalWall(now);
  const dayKey = (x: Date) => `${x.getUTCFullYear()}-${x.getUTCMonth()}-${x.getUTCDate()}`;
  if (dayKey(d) === dayKey(n)) return 'Hoje';
  const y = new Date(n.getTime() - 86_400_000);
  if (dayKey(d) === dayKey(y)) return 'Ontem';
  return formatDayMonth(iso);
}

/** "agora", "há 12 min", "há 3 h", "há 5 dias" */
export function formatSince(iso: string | Date, now: Date = new Date()): string {
  const diffMin = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

/** Hora para a lista de conversas: "10:05", "ontem" ou "16 out". */
export function formatListTime(iso: string | Date, now: Date = new Date()): string {
  const label = formatDayLabel(iso, now);
  if (label === 'Hoje') return formatTime(iso);
  if (label === 'Ontem') return 'ontem';
  return label;
}
