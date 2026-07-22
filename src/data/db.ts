import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const DDL = `
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_versions (
  question_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  domain TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  stem TEXT NOT NULL,
  choices_json TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  knowledge_drop TEXT,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  correct_as_of TEXT NOT NULL,
  jurisdiction TEXT,
  sensitivity_tier INTEGER NOT NULL,
  expires_at TEXT,
  read_time_sec INTEGER NOT NULL,
  fact_key TEXT NOT NULL,
  demo_flag TEXT,
  PRIMARY KEY (question_id, version)
);

CREATE TABLE IF NOT EXISTS packs (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  seed TEXT NOT NULL,
  lanes_json TEXT NOT NULL,
  report_json TEXT NOT NULL,
  approved_by TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  contestants_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor TEXT NOT NULL,
  prev_state TEXT NOT NULL,
  next_state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS score_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lifeline_uses (
  game_id TEXT NOT NULL,
  contestant_id TEXT NOT NULL,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE (game_id, contestant_id, type)
);

CREATE TABLE IF NOT EXISTS audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  at TEXT NOT NULL
);
`;

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(dbPath: string): Db {
  const sqlite = new Database(dbPath);
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}
