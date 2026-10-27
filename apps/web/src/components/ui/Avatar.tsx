import { cn } from '@/lib/cn';
import { initials } from '@/lib/labels';

const PALETTE = [
  'bg-[#e3edfb] text-[#1d5fb8]',
  'bg-[#fbe9dc] text-[#a24e14]',
  'bg-[#ebe7fb] text-[#5a47b8]',
  'bg-[#e0f3e8] text-[#1f7a46]',
  'bg-[#fbe3ea] text-[#a32b51]',
  'bg-[#eceef1] text-[#4a5361]',
  'bg-[#fbf1d9] text-[#8a6100]',
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function Avatar({ name, size = 40, online, className }: { name: string; size?: number; online?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <span
        className={cn('flex h-full w-full items-center justify-center rounded-full font-semibold', PALETTE[hash(name) % PALETTE.length])}
        style={{ fontSize: Math.round(size * 0.36) }}
      >
        {initials(name)}
      </span>
      {online !== undefined && (
        <span
          className={cn('absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-white', online ? 'bg-green' : 'bg-faint')}
          style={{ width: Math.max(10, size * 0.3), height: Math.max(10, size * 0.3) }}
        />
      )}
    </span>
  );
}
