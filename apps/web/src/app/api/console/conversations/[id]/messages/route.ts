import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, services } from '@/server/context';
import { handle, readJson } from '@/server/http';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const session = await requireSession('analista');
  const { id } = await params;
  const { text } = z.object({ text: z.string() }).parse(await readJson(req));
  return NextResponse.json({ message: services().console.sendMessage(session, id, text) });
});
