import Database from 'better-sqlite3';

export type Db = Database.Database;

/**
 * Esquema do serviço de chamados. Migrações versionadas por `user_version`:
 * cada entrada roda uma vez, em ordem, dentro de transação.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('funcionario', 'analista')),
    department TEXT NOT NULL,
    device TEXT,
    os TEXT,
    team TEXT
  );

  CREATE TABLE tickets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('INC', 'REQ')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    affected TEXT NOT NULL,
    requester_id TEXT NOT NULL REFERENCES employees(id),
    assigned_queue TEXT,
    assigned_to TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_support_update_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX idx_tickets_requester ON tickets(requester_id, status);

  CREATE TABLE ticket_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL REFERENCES tickets(id),
    at TEXT NOT NULL,
    author TEXT NOT NULL,
    author_name TEXT,
    kind TEXT NOT NULL,
    text TEXT NOT NULL
  );
  CREATE INDEX idx_events_ticket ON ticket_events(ticket_id, id);

  CREATE TABLE sequences (
    type TEXT PRIMARY KEY,
    next_value INTEGER NOT NULL
  );

  -- Idempotência: um retry de POST após timeout não cria chamado duplicado.
  CREATE TABLE idempotency_keys (
    key TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE kb_articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL,
    tags TEXT NOT NULL,
    applies_to_os TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
];

export function openDatabase(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 3000');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v += 1) {
    const sql = MIGRATIONS[v];
    if (!sql) continue;
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
