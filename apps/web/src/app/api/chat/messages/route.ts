import { NextResponse } from 'next/server';
import { requireSession, services } from '@/server/context';
import { handle } from '@/server/http';
import { ServiceError } from '@/server/services';

export const dynamic = 'force-dynamic';

/** Polling de novas mensagens (respostas do analista, eventos de transferência). */
export const GET = handle(async (req: Request) => {
  const session = await requireSession('funcionario');
  const url = new URL(req.url);
  const conversationId = url.searchParams.get('conversationId');
  if (!conversationId) throw new ServiceError(400, 'conversationId obrigatório');
  const after = Number(url.searchParams.get('after') ?? 0) || 0;
  return NextResponse.json({ ...services().chat.poll(session, conversationId, after), usage: services().chat.usage(session) });
});
