import Database from 'better-sqlite3';
import type { Db } from './db-types';

export type { Db };

/**
 * Banco do app (conversas, mensagens, rascunhos e sessões). Separado do banco do
 * serviço de chamados: cada serviço é dono dos seus dados.
 * SQLite em modo WAL — sobrevive a reinícios e aguenta leituras concorrentes.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    department TEXT NOT NULL,
    team TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    employee_department TEXT NOT NULL,
    status TEXT NOT NULL,
    assigned_analyst_id TEXT,
    assigned_analyst_name TEXT,
    ticket_id TEXT,
    handoff_json TEXT,
    last_confidence REAL,
    unread_for_analyst INTEGER NOT NULL DEFAULT 0,
    last_message_preview TEXT,
    last_message_role TEXT,
    last_message_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_conv_employee ON conversations(employee_id, created_at DESC);
  CREATE INDEX idx_conv_status ON conversations(status, last_message_at DESC);

  CREATE TABLE messages (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL,
    author_id TEXT,
    author_name TEXT,
    text TEXT NOT NULL,
    blocks_json TEXT NOT NULL DEFAULT '[]',
    trace_json TEXT,
    session_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_messages_conv ON messages(conversation_id, seq);
  CREATE INDEX idx_messages_session ON messages(session_id, role);
  CREATE INDEX idx_messages_author ON messages(author_id, created_at);

  CREATE TABLE drafts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    employee_id TEXT NOT NULL,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    result_ticket_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_drafts_conv ON drafts(conversation_id, status);

  CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
  INSERT INTO counters (name, value) VALUES ('draft', 380);
  `,
];

function migrate(db: Db) {
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

export function openAppDatabase(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 3000');
  migrate(db);
  return db;
}
