import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentSession } from '@/server/context';
import { ChatApp } from '@/components/chat/ChatApp';

export const metadata: Metadata = { title: 'Atendimento' };

export default async function AtendimentoPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  return <ChatApp firstName={session.name.split(' ')[0] ?? session.name} />;
}
