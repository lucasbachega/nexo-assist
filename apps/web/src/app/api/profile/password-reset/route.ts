import { NextResponse } from 'next/server';
import { requireSession } from '@/server/context';
import { handle } from '@/server/http';
import { allow } from '@/server/rate-limit';
import { ServiceError } from '@/server/services';

/** Simulado: em produção, dispararia o fluxo do provedor de identidade. */
export const POST = handle(async () => {
  const session = await requireSession();
  if (!allow(`reset:${session.userId}`, 3, 60 * 60_000)) throw new ServiceError(429, 'Você já pediu alguns links. Confira seu e-mail.');
  return NextResponse.json({ ok: true, sentTo: session.email });
});
