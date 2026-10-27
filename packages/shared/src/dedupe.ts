import { isOpenStatus, type Category, type Ticket } from './domain';
import { coverage, jaccard, tokenize } from './text';

/**
 * Regra "sem duplicidade" do Anexo A: se já existe chamado aberto sobre o mesmo
 * problema, ele é atualizado, não duplicado. Chamados resolvidos há até 7 dias
 * podem ser reabertos.
 */
export const REOPEN_WINDOW_DAYS = 7;
/** A partir daqui consideramos o mesmo problema e bloqueamos o rascunho de chamado novo. */
export const DUPLICATE_STRONG = 0.5;
/** Entre este valor e o forte, o agent pergunta ao funcionário antes de decidir. */
export const DUPLICATE_POSSIBLE = 0.28;

export interface DuplicateCandidate {
  ticket: Ticket;
  score: number;
  strength: 'forte' | 'possivel';
  /** 'atualizar' (aberto) ou 'reabrir' (resolvido há até 7 dias). */
  action: 'atualizar' | 'reabrir';
  reason: string;
}

export function canReopen(ticket: Ticket, now: Date = new Date()): boolean {
  if (ticket.status !== 'resolvido' || !ticket.resolvedAt) return false;
  const ageMs = now.getTime() - new Date(ticket.resolvedAt).getTime();
  return ageMs <= REOPEN_WINDOW_DAYS * 86_400_000;
}

export function similarityScore(
  draft: { title: string; description: string; category: Category },
  ticket: Pick<Ticket, 'title' | 'description' | 'category'>,
): number {
  const draftTokens = tokenize(`${draft.title} ${draft.description}`);
  const ticketTitle = tokenize(ticket.title);
  const ticketAll = tokenize(`${ticket.title} ${ticket.description}`);
  const base = Math.max(jaccard(draftTokens, ticketAll), coverage(ticketTitle, draftTokens) * 0.8);
  const categoryBonus = draft.category === ticket.category ? 0.15 : -0.1;
  return Math.max(0, Math.min(1, base + categoryBonus));
}

export function findDuplicateCandidates(
  draft: { title: string; description: string; category: Category },
  ownTickets: Ticket[],
  now: Date = new Date(),
): DuplicateCandidate[] {
  const out: DuplicateCandidate[] = [];
  for (const ticket of ownTickets) {
    const open = isOpenStatus(ticket.status);
    const reopenable = canReopen(ticket, now);
    if (!open && !reopenable) continue;
    const score = similarityScore(draft, ticket);
    if (score < DUPLICATE_POSSIBLE) continue;
    const strength = score >= DUPLICATE_STRONG ? 'forte' : 'possivel';
    out.push({
      ticket,
      score: Math.round(score * 100) / 100,
      strength,
      action: open ? 'atualizar' : 'reabrir',
      reason: open
        ? `${ticket.id} está aberto e é parecido (similaridade ${Math.round(score * 100)}%)`
        : `${ticket.id} foi resolvido há menos de ${REOPEN_WINDOW_DAYS} dias e é parecido (similaridade ${Math.round(score * 100)}%)`,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
