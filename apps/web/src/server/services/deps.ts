import type { Employee } from '@nexo/shared';
import type { TicketsActor, TicketsClient } from '@nexo/tickets/client';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { AppStore } from '../store';

export interface ServiceDeps {
  store: AppStore;
  /** Cria um cliente do serviço de chamados agindo como o ator informado. */
  tickets: (actor: TicketsActor) => TicketsClient;
  clock: () => Date;
  /** Limites de uso: por sessão, por pessoa/hora e global/dia (teto de custo do deploy). */
  limits: { perSession: number; perHour: number; perDayGlobal?: number };
  model: { config: MastraModelConfig; label: string; missingKey: string | null };
}

export const employeeActor = (e: Pick<Employee, 'id' | 'name'>): TicketsActor => ({ id: e.id, role: 'funcionario', name: e.name });
export const analystActor = (a: { id: string; name: string }): TicketsActor => ({ id: a.id, role: 'analista', name: a.name });
