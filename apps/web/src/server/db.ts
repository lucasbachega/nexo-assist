import 'server-only';
import path from 'node:path';
import { resolveDataDir } from '@nexo/shared/node';
import { openAppDatabase, type Db } from './db-schema';

export type { Db };

const globalForDb = globalThis as unknown as { __nexoAppDb?: Db };

/** Conexão única por processo (sobrevive ao hot reload em desenvolvimento). */
export function getDb(): Db {
  if (!globalForDb.__nexoAppDb) {
    globalForDb.__nexoAppDb = openAppDatabase(path.join(resolveDataDir(), 'app.db'));
  }
  return globalForDb.__nexoAppDb;
}
