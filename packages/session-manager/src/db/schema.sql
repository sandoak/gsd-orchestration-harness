-- Schema for GSD Session Harness SQLite database
-- This file is for documentation - schema is embedded in database.ts

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2, 3)),
  status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'waiting_checkpoint', 'completed', 'failed')),
  working_dir TEXT NOT NULL,
  current_command TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  pid INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('stdout', 'stderr')),
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outputs_session_id ON session_outputs(session_id);
CREATE INDEX IF NOT EXISTS idx_outputs_timestamp ON session_outputs(session_id, timestamp);
