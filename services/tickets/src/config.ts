import path from 'node:path';
import { resolveDataDir } from '@nexo/shared/node';

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
};

export function loadConfig() {
  const serviceToken = process.env.TICKETS_SERVICE_TOKEN;
  if (!serviceToken) {
    throw new Error('TICKETS_SERVICE_TOKEN não definido. Copie .env.example para .env.');
  }
  return {
    port: num(process.env.TICKETS_PORT, 4000),
    serviceToken,
    dbFile: path.join(resolveDataDir(), 'tickets.db'),
    flakyRate: num(process.env.TICKETS_FLAKY_RATE, 0.1),
    maxLatencyMs: num(process.env.TICKETS_MAX_LATENCY_MS, 250),
  };
}
