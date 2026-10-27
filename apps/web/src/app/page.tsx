import { redirect } from 'next/navigation';
import { currentSession } from '@/server/context';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await currentSession();
  if (!session) redirect('/login');
  redirect(session.role === 'analista' ? '/console' : '/atendimento');
}
