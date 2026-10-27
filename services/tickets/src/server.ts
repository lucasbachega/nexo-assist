import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { TicketRepository } from './repository';
import { seed } from './seed';

const config = loadConfig();
const db = openDatabase(config.dbFile);
const repo = new TicketRepository(db);

if (repo.isEmpty()) {
  seed(db);
  console.log('[tickets] banco vazio — dados de exemplo criados');
}

const app = createApp({
  repo,
  serviceToken: config.serviceToken,
  flakyRate: config.flakyRate,
  maxLatencyMs: config.maxLatencyMs,
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `[tickets] serviço de chamados em http://localhost:${info.port} (instabilidade simulada: ${Math.round(config.flakyRate * 100)}%)`,
  );
});

const shutdown = () => {
  server.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
