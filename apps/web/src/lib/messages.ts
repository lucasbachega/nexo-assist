import type { ChatMessage } from '@nexo/shared';

/** Junta mensagens novas às existentes, sem duplicar, em ordem de chegada. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return current;
  const bySeq = new Map(current.map((m) => [m.seq, m]));
  for (const m of incoming) bySeq.set(m.seq, m);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/** Mostra o separador de data quando o dia muda em relação à mensagem anterior. */
export function startsNewDay(messages: ChatMessage[], idx: number, label: (iso: string) => string): boolean {
  const prev = messages[idx - 1];
  return !prev || label(prev.createdAt) !== label(messages[idx]!.createdAt);
}
