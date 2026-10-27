import { NextResponse } from 'next/server';
import { requireSession, services } from '@/server/context';
import { handle } from '@/server/http';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const session = await requireSession('analista');
  const { id } = await params;
  const message = await services().console.returnToAgent(session, id);
  return NextResponse.json({ message });
});
