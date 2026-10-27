import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentSession } from '@/server/context';
import { ConsoleApp } from '@/components/console/ConsoleApp';

export const metadata: Metadata = { title: 'Console do analista' };
export const dynamic = 'force-dynamic';

export default async function ConsolePage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  if (session.role !== 'analista') redirect('/atendimento');
  return <ConsoleApp analyst={{ id: session.userId, name: session.name, team: session.team }} />;
}
