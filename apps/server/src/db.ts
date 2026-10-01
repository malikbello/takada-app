// SQLite store (node:sqlite, no native addon). Events are append-only with a server
// sequence number for pull cursors; tokens are stored only as SHA-256 hashes.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  visit_id TEXT NOT NULL,
  facility TEXT NOT NULL,
  device_id TEXT NOT NULL,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_visit ON events(visit_id);
CREATE INDEX IF NOT EXISTS events_facility_seq ON events(facility, seq);
CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, facility TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  facility TEXT NOT NULL,
  worker TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  paired_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS pairing_codes (
  code_hash TEXT PRIMARY KEY,
  facility TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS audio (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  facility TEXT NOT NULL,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  facility TEXT NOT NULL,
  language TEXT NOT NULL,
  audio_ids TEXT NOT NULL,
  priority INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  not_before TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(status, priority DESC, created_at);
`;

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}
