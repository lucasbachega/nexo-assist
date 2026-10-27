import { NextResponse } from 'next/server';
import { requireSession, services } from '@/server/context';
import { handle } from '@/server/http';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const session = await requireSession('analista');
  const { id } = await params;
  return NextResponse.json(await services().console.employeeTickets(session, id));
});
