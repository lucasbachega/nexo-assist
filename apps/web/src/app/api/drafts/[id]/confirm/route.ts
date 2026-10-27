import { NextResponse } from 'next/server';
import { requireSession, services } from '@/server/context';
import { handle } from '@/server/http';

type Ctx = { params: Promise<{ id: string }> };

/** Confirmar o rascunho: só aqui (ou por texto validado) um chamado é criado/atualizado. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const session = await requireSession('funcionario');
  const { id } = await params;
  const employee = await services().chat.loadEmployee(session);
  const result = await services().drafts.confirm(employee, id, { announce: true });
  return NextResponse.json({ draft: result.draft, messages: result.messages });
});
