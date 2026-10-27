import { existsSync, rmSync } from 'node:fs';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { seed } from './seed';

/** Recria o banco do serviço de chamados com os dados de exemplo. */
const config = loadConfig();
for (const suffix of ['', '-wal', '-shm']) {
  const f = `${config.dbFile}${suffix}`;
  if (existsSync(f)) rmSync(f);
}
const db = openDatabase(config.dbFile);
seed(db);
db.close();
console.log(`[tickets] dados de exemplo recriados em ${config.dbFile}`);
