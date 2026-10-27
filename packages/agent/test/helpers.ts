import { MastraLanguageModelV2Mock, simulateReadableStream } from '@mastra/core/test-utils/llm-mock';
import type { DraftPayload, DraftView, HandoffInfo, Ticket, TurnEvent } from '@nexo/shared';
import { createApp } from '../../../services/tickets/src/app';
import { openDatabase } from '../../../services/tickets/src/db';
import { TicketRepository } from '../../../services/tickets/src/repository';
import { EMPLOYEES, seed } from '../../../services/tickets/src/seed';
import { TicketsClient } from '@nexo/tickets/client';
import type { AgentPorts, HandoffRequest } from '../src';

export const NOW = new Date('2026-10-27T13:35:00Z'); // terça, 10:35 em Brasília

type Call = { tool: string; args: Record<string, unknown> };
type ScriptStep = { calls?: Call[]; text?: string };

/**
 * Modelo roteirizado: cada passo do loop do agent devolve as chamadas de
 * ferramenta (ou o texto) definidas no roteiro. Permite testar o agent de ponta
 * a ponta (Mastra + ferramentas + serviço de chamados) sem chamar um LLM.
 */
export function scriptedModel(script: ScriptStep[], onCall?: () => void) {
  let n = 0;
  const usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120 };
  return new MastraLanguageModelV2Mock({
    modelId: 'roteiro-de-teste',
    doStream: async () => {
      onCall?.();
      const step = script[n] ?? { text: 'ok' };
      n += 1;
      const parts: unknown[] = [{ type: 'stream-start', warnings: [] }];
      for (const [i, c] of (step.calls ?? []).entries()) {
        parts.push({ type: 'tool-call', toolCallId: `call-${n}-${i}`, toolName: c.tool, input: JSON.stringify(c.args) });
      }
      if (step.text) {
        parts.push(
          { type: 'text-start', id: `t${n}` },
          { type: 'text-delta', id: `t${n}`, delta: step.text },
          { type: 'text-end', id: `t${n}` },
        );
      }
      parts.push({ type: 'finish', finishReason: step.calls?.length ? 'tool-calls' : 'stop', usage });
      return { stream: simulateReadableStream({ chunks: parts as never[] }) };
    },
  });
}

export function createWorld(employeeId = 'emp-ana', lastUserMessage = '') {
  const db = openDatabase(':memory:');
  seed(db, NOW);
  const repo = new TicketRepository(db, () => NOW);
  const app = createApp({ repo, serviceToken: 't' });
  const fetchImpl = ((i: RequestInfo | URL, init?: RequestInit) => app.fetch(new Request(i, init))) as typeof fetch;
  const employee = EMPLOYEES.find((e) => e.id === employeeId)!;
  const tickets = new TicketsClient({
    baseUrl: 'http://t',
    token: 't',
    actor: { id: employee.id, role: 'funcionario', name: employee.name },
    fetchImpl,
    baseDelayMs: 1,
  });

  const drafts: DraftView[] = [];
  const handoffs: HandoffRequest[] = [];
  const events: TurnEvent[] = [];
  let seq = 380;
  const ports: AgentPorts = {
    employee,
    tickets,
    now: () => NOW,
    conversation: { id: 'c1', ticketId: null, pendingDrafts: drafts, lastUserMessage },
    drafts: {
      create: async (payload: DraftPayload) => {
        const d: DraftView = { id: `D-${(seq += 1)}`, status: 'pendente', payload, resultTicketId: null, error: null };
        drafts.push(d);
        return d;
      },
      confirm: async (id: string) => {
        const d = drafts.find((x) => x.id === id)!;
        const t: Ticket = await tickets.createTicket(
          {
            type: d.payload.type,
            title: d.payload.title,
            description: d.payload.description,
            category: d.payload.category,
            priority: d.payload.priority,
            affected: d.payload.affected,
          },
          id,
        );
        d.status = 'confirmado';
        d.resultTicketId = t.id;
        return { draft: d, ticket: t, handoff: null };
      },
    },
    handoff: {
      transfer: async (req: HandoffRequest): Promise<HandoffInfo> => {
        handoffs.push(req);
        return { ...req, at: NOW.toISOString(), dueAt: new Date(NOW.getTime() + 2 * 3600_000).toISOString() };
      },
    },
  };
  return { ports, repo, drafts, handoffs, events, emit: (e: TurnEvent) => events.push(e) };
}
