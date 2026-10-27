import { redirect } from 'next/navigation';
import { currentSession } from '@/server/context';
import { EmployeeShell } from '@/components/shell/EmployeeShell';

export const dynamic = 'force-dynamic';

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect('/login');
  if (session.role !== 'funcionario') redirect('/console');
  return <EmployeeShell user={{ name: session.name, email: session.email }}>{children}</EmployeeShell>;
}
