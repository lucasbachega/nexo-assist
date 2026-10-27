import { NextResponse } from 'next/server';
import { config } from '@/server/config';
import { SESSION_COOKIE, services } from '@/server/context';
import { handle, readJson } from '@/server/http';
import { allow, clientIp } from '@/server/rate-limit';
import { ServiceError } from '@/server/services';
import { LoginSchema } from '@/server/services/auth';

export const POST = handle(async (req: Request) => {
  if (!allow(`login:${clientIp(req)}`, 20, 10 * 60_000)) {
    throw new ServiceError(429, 'Muitas tentativas. Aguarde alguns minutos ou ligue no ramal 4000.');
  }
  const input = LoginSchema.parse(await readJson(req));
  const session = await services().auth.login(input);
  const res = NextResponse.json({ role: session.role, redirect: session.role === 'analista' ? '/console' : '/atendimento' });
  res.cookies.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    // "Manter conectado": cookie persistente; senão, expira ao fechar o navegador.
    ...(input.remember ? { expires: new Date(session.expiresAt) } : {}),
  });
  return res;
});
