import 'server-only';
import { cookies } from 'next/headers';
import { TicketsClient } from '@nexo/tickets/client';
import type { Role } from '@nexo/shared';
import { config, missingModelKey } from './config';
import { getDb } from './db';
import { createServices, ServiceError, type Services } from './services';
import { AppStore, type SessionRecord } from './store';
import { seedDemoConversations } from './demo-seed';

export const SESSION_COOKIE = 'nexo_session';

const globalForServices = globalThis as unknown as { __nexoServices?: Services };

/** Composição das dependências (uma vez por processo). */
export function services(): Services {
  if (!globalForServices.__nexoServices) {
    if (!config.ticketsToken) throw new Error('TICKETS_SERVICE_TOKEN não definido. Copie .env.example para .env.');
    const store = new AppStore(getDb());
    seedDemoConversations(store);
    globalForServices.__nexoServices = createServices(
      {
        store,
        tickets: (actor) => new TicketsClient({ baseUrl: config.ticketsUrl, token: config.ticketsToken, actor }),
        clock: () => new Date(),
        limits: {
          perSession: config.maxMessagesPerSession,
          perHour: config.maxMessagesPerHour,
          perDayGlobal: config.maxMessagesPerDayGlobal,
        },
        model: { config: config.model, label: config.model, missingKey: missingModelKey() },
      },
      { sessionTtlHours: config.sessionTtlHours },
    );
  }
  return globalForServices.__nexoServices;
}

export async function currentSession(): Promise<SessionRecord | null> {
  const jar = await cookies();
  return services().auth.session(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(role?: Role): Promise<SessionRecord> {
  const session = await currentSession();
  if (!session) throw new ServiceError(401, 'Sessão expirada. Entre de novo.');
  if (role && session.role !== role) throw new ServiceError(403, 'Acesso não permitido para este perfil');
  return session;
}
