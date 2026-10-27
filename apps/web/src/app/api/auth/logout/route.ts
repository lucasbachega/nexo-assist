import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, services } from '@/server/context';
import { handle } from '@/server/http';

export const POST = handle(async () => {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) services().auth.logout(id);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
