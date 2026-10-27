import { NextResponse } from 'next/server';
import { requireSession, services } from '@/server/context';
import { handle, readJson } from '@/server/http';
import { DraftEditSchema } from '@/server/services/drafts';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const session = await requireSession('funcionario');
  const { id } = await params;
  const patch = DraftEditSchema.parse(await readJson(req));
  const employee = await services().chat.loadEmployee(session);
  return NextResponse.json({ draft: services().drafts.edit(employee, id, patch) });
});
