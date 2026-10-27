import type { TicketStatus } from '@nexo/shared';

export type Tone = 'amber' | 'blue' | 'green' | 'gray' | 'violet' | 'red';

export const STATUS_TONE: Record<TicketStatus, Tone> = {
  aberto: 'blue',
  em_andamento: 'blue',
  aguardando_analista: 'amber',
  aguardando_usuario: 'violet',
  aprovado: 'green',
  resolvido: 'gray',
  fechado: 'gray',
};

export const DOT_CLASS: Record<Tone, string> = {
  amber: 'bg-amber',
  blue: 'bg-blue',
  green: 'bg-green',
  gray: 'bg-faint',
  violet: 'bg-violet',
  red: 'bg-red',
};

export const TEXT_TONE: Record<Tone, string> = {
  amber: 'text-amber-ink',
  blue: 'text-brand',
  green: 'text-green-ink',
  gray: 'text-muted',
  violet: 'text-violet',
  red: 'text-red',
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}
