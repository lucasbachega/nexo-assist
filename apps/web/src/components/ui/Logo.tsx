import { cn } from '@/lib/cn';

/** Marca do Nexo Assist: um "N" geométrico. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('h-6 w-6', className)}>
      <path d="M3 21V4.2a1 1 0 0 1 1.7-.7L12 11V3h3v16.8a1 1 0 0 1-1.7.7L6 13v8H3Z" fill="#1677ff" />
      <path d="M17 3h4v18h-4z" fill="#0a66c9" />
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
