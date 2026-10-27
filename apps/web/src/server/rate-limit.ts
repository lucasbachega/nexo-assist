/** Limitador em memória (janela deslizante) — suficiente para um processo; em várias instâncias, usar Redis. */
const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, hits] of buckets) if (hits.every((t) => now - t >= windowMs)) buckets.delete(key);
}

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now, windowMs);
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  const allowed = hits.length < limit;
  if (allowed) hits.push(now);
  buckets.set(key, hits);
  return allowed;
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}
