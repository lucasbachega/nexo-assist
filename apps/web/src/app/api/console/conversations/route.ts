import { NextResponse } from 'next/server';
import { requireSession, services } from '@/server/context';
import { handle } from '@/server/http';
import { CONSOLE_FILTERS, type ConsoleFilter } from '@/server/services/console';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  const session = await requireSession('analista');
  const url = new URL(req.url);
  const f = url.searchParams.get('filter') as ConsoleFilter | null;
  const filter: ConsoleFilter = f && CONSOLE_FILTERS.includes(f) ? f : 'todas';
  return NextResponse.json(services().console.list(session, filter, url.searchParams.get('q') ?? ''));
});
