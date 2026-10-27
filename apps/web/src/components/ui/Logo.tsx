import { cn } from '@/lib/cn';

/** Marca do Nexo Assist: um "N" geométrico. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('h-6 w-6', className)}>
      <path d="M16.4 3H21v18h-4.6z" fill="#0a66c9" />
      <path d="M3 3h4.6L21 21h-4.6z" fill="#1677ff" />
      <path d="M3 3h4.6v18H3z" fill="#1677ff" />
    </svg>
  );
}

export function Logo({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', tone === 'light' ? 'text-white' : 'text-ink', className)}>
      <LogoMark />
      <span className="text-[17px]">Nexo Assist</span>
    </span>
  );
}
