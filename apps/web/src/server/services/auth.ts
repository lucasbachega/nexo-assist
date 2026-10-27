import { z } from 'zod';
import { TicketsApiError, TicketsUnavailableError } from '@nexo/tickets/client';
import type { SessionRecord } from '../store';
import type { ServiceDeps } from './deps';
import { ServiceError } from './errors';

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe a senha'),
  remember: z.boolean().optional().default(true),
});

/**
 * Login do protótipo: e-mail corporativo do diretório + qualquer senha (PRD).
 * Em produção, aqui entraria o SSO corporativo (OIDC/SAML).
 */
export class AuthService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly ttlHours: number,
  ) {}

  async login(input: Pick<z.infer<typeof LoginSchema>, 'email' | 'password'>): Promise<SessionRecord> {
    if (!input.email.endsWith('@nexo.com.br')) throw new ServiceError(401, 'Use seu e-mail corporativo @nexo.com.br');
    try {
      const directory = this.deps.tickets({ id: 'nexo-assist', role: 'sistema', name: null });
      const emp = await directory.findEmployeeByEmail(input.email);
      return this.deps.store.createSession(
        { userId: emp.id, role: emp.role, name: emp.name, email: emp.email, department: emp.department, team: emp.team },
        this.ttlHours,
      );
    } catch (err) {
      if (err instanceof TicketsApiError && err.status === 404) throw new ServiceError(401, 'E-mail não encontrado no diretório da Nexo');
      if (err instanceof TicketsUnavailableError)
        throw new ServiceError(503, 'Não conseguimos validar seu acesso agora. Tente de novo em instantes.');
      throw err;
    }
  }

  session(id: string | undefined): SessionRecord | null {
    return id ? this.deps.store.getSession(id) : null;
  }

  logout(id: string) {
    this.deps.store.deleteSession(id);
  }
}
