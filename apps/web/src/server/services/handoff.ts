import { addBusinessMinutes, type HandoffInfo } from '@nexo/shared';
import { TicketsUnavailableError, type TicketsClient } from '@nexo/tickets/client';
import type { HandoffRequest } from '@nexo/agent';
import type { ServiceDeps } from './deps';

/** Tempo para um analista assumir, por fila (crítico tem plantão 24h). */
function handoffDueAt(req: Pick<HandoffRequest, 'trigger' | 'queue'>, now: Date): Date {
  if (req.trigger === 'critico') return new Date(now.getTime() + 15 * 60_000);
  return addBusinessMinutes(now, req.queue === 'Suporte N2' ? 120 : 30);
}

/**
 * Transferência para analista (Anexo A): marca a conversa como aguardando
 * atendente — o agent para de responder — e leva o resumo do caso.
 */
export class HandoffService {
  constructor(private readonly deps: ServiceDeps) {}

  async transfer(conversationId: string, req: HandoffRequest, tickets: TicketsClient): Promise<HandoffInfo> {
    const now = this.deps.clock();
    const conv = this.deps.store.getConversation(conversationId);
    if (!conv) throw new Error('Conversa não encontrada');
    const ticketId = req.ticketId ?? conv.ticketId;
    let reason = req.reason;
    if (ticketId) {
      try {
        await tickets.transfer(ticketId, req.queue, req.summary);
      } catch (err) {
        // A conversa é transferida mesmo assim; o analista atualiza o chamado.
        if (err instanceof TicketsUnavailableError) reason = `${reason} (sistema de chamados indisponível — atualizar o ${ticketId})`;
        else throw err;
      }
    }
    const handoff: HandoffInfo = {
      reason,
      trigger: req.trigger,
      queue: req.queue,
      summary: req.summary,
      ticketId,
      confidence: req.confidence,
      at: now.toISOString(),
      dueAt: handoffDueAt(req, now).toISOString(),
    };
    this.deps.store.updateConversation(conversationId, {
      status: 'aguardando_atendente',
      handoff,
      ticketId,
      lastConfidence: req.confidence,
      unreadForAnalyst: Math.max(conv.unreadForAnalyst, 1),
    });
    return handoff;
  }
}
