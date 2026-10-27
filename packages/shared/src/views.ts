import type { Ticket } from './domain';
import type { TicketView } from './protocol';
import { computeSlaStatus } from './sla';

export function toTicketView(ticket: Ticket, now: Date = new Date()): TicketView {
  return {
    id: ticket.id,
    type: ticket.type,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    affected: ticket.affected,
    createdAt: ticket.createdAt,
    lastSupportUpdateAt: ticket.lastSupportUpdateAt,
    sla: computeSlaStatus(ticket, now),
  };
}
