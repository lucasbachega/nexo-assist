'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight, LogOut, Menu, MessageSquare, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/ui/Logo';
import { Avatar } from '@/components/ui/Avatar';

const NAV = [
  { href: '/atendimento', label: 'Atendimento', icon: MessageSquare },
  { href: '/perfil', label: 'Meu perfil', icon: UserRound },
];

export async function logout(router: ReturnType<typeof useRouter>) {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  router.replace('/login');
  router.refresh();
}

/** Estrutura das telas do funcionário: barra lateral + topo com trilha. */
export function EmployeeShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const current = NAV.find((n) => pathname.startsWith(n.href));

  const sidebar = (
    <aside className="flex h-full w-[224px] shrink-0 flex-col border-r border-line bg-white">
      <div className="flex h-[60px] items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 px-3 pt-1" aria-label="Principal">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMenu(false)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors',
                active ? 'bg-brand-soft font-medium text-brand' : 'text-ink-soft hover:bg-subtle',
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}
      </nav>
      <div className="mx-3 border-t border-line py-3">
        <div className="flex items-center gap-2.5 px-2">
          <Avatar name={user.name} size={34} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink">{user.name}</div>
            <div className="truncate text-[12px] text-muted">{user.email}</div>
          </div>
        </div>
        <button onClick={() => void logout(router)} className="mt-2 flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-ink-soft hover:bg-subtle">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-white">
      <div className="hidden md:flex">{sidebar}</div>
      {menu && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="h-full shadow-xl">{sidebar}</div>
          <button aria-label="Fechar menu" className="flex-1 bg-black/30" onClick={() => setMenu(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-line px-4 sm:px-8">
          <div className="flex items-center gap-2 text-[14px]">
            <button className="mr-1 rounded-md p-1 md:hidden" aria-label="Abrir menu" onClick={() => setMenu(true)}>
              {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <span className="text-muted">Service desk de TI</span>
            <ChevronRight className="h-3.5 w-3.5 text-faint" />
            <span className="font-medium text-ink">{current?.label}</span>
          </div>
          {pathname.startsWith('/atendimento') && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-3 py-1 text-[13px] font-medium text-green-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-green" /> Assistente online
            </span>
          )}
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
