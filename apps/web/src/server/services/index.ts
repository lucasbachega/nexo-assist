import { AuthService } from './auth';
import { ChatService } from './chat';
import { ConsoleService } from './console';
import type { ServiceDeps } from './deps';
import { DraftService } from './drafts';
import { HandoffService } from './handoff';

export function createServices(deps: ServiceDeps, opts: { sessionTtlHours: number }) {
  const handoff = new HandoffService(deps);
  const drafts = new DraftService(deps, handoff);
  return {
    deps,
    handoff,
    drafts,
    chat: new ChatService(deps, drafts, handoff),
    console: new ConsoleService(deps),
    auth: new AuthService(deps, opts.sessionTtlHours),
  };
}

export type Services = ReturnType<typeof createServices>;
export { ServiceError } from './errors';
