import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentSession } from '@/server/context';
import { ProfileView } from '@/components/shell/ProfileView';

export const metadata: Metadata = { title: 'Meu perfil' };

export default async function PerfilPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  return <ProfileView name={session.name} email={session.email} />;
}
