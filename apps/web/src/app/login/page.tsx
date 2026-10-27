import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentSession } from '@/server/context';
import { LoginScreen } from '@/components/shell/LoginScreen';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expirada?: string }> }) {
  const session = await currentSession();
  if (session) redirect(session.role === 'analista' ? '/console' : '/atendimento');
  const { expirada } = await searchParams;
  return <LoginScreen expired={expirada === '1'} />;
}
