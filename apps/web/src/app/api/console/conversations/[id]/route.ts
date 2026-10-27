import { NextResponse } from 'next/server';
import { requireSession, services } from '@/server/context';
import { handle } from '@/server/http';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const session = await requireSession('analista');
  const { id } = await params;
  const after = Number(new URL(req.url).searchParams.get('after') ?? 0) || 0;
  return NextResponse.json(services().console.detail(session, id, after));
});
