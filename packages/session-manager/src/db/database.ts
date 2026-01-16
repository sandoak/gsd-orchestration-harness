import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2, 3, 4)),
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

-- Worker messages for structured communication protocol
CREATE TABLE IF NOT EXISTS worker_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN (
    'session_ready', 'task_started', 'progress_update',
    'verification_needed', 'decision_needed', 'action_needed',
    'credentials_needed', 'task_completed', 'task_failed'
  )),
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'responded', 'expired')),
  created_at TEXT DEFAULT (datetime('now')),
  responded_at TEXT,
  response TEXT
);

CREATE INDEX IF NOT EXISTS idx_worker_messages_session_id ON worker_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_worker_messages_status ON worker_messages(status);
CREATE INDEX IF NOT EXISTS idx_worker_messages_pending ON worker_messages(session_id, status) WHERE status = 'pending';

-- Orchestrator messages for responses to workers
CREATE TABLE IF NOT EXISTS orchestrator_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN (
    'assign_task', 'verification_result', 'decision_made',
    'action_completed', 'credentials_provided', 'abort_task'
  )),
  payload TEXT NOT NULL,
  in_response_to TEXT REFERENCES worker_messages(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_messages_session_id ON orchestrator_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_orchestrator_messages_response_to ON orchestrator_messages(in_response_to);
`;

// Use data subdirectory to avoid conflict with harness installation at ~/.harness
const DEFAULT_DB_DIR = join(homedir(), '.harness', 'data');
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'sessions.db');

/**
 * Manages SQLite database connection and initialization.
 * Uses WAL mode for better concurrency.
 */
export class DatabaseConnection {
  readonly db: Database.Database;
  private readonly dbPath: string;

  /**
   * Creates a new database connection.
   * @param dbPath - Path to the database file. Defaults to ~/.harness/sessions.db
   */
  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? DEFAULT_DB_PATH;

    // Ensure directory exists
    const dir = join(this.dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open database
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Initialize schema
    this.db.exec(SCHEMA);
  }

  /**
   * Gets the path to the database file.
   */
  getPath(): string {
    return this.dbPath;
  }

  /**
   * Closes the database connection.
   */
  close(): void {
    this.db.close();
  }
}

// Default singleton instance (created lazily)
let defaultInstance: DatabaseConnection | null = null;

/**
 * Gets the default database connection instance.
 * Creates it if it doesn't exist.
 */
export function getDatabase(): DatabaseConnection {
  if (!defaultInstance) {
    defaultInstance = new DatabaseConnection();
  }
  return defaultInstance;
}

/**
 * Closes the default database connection.
 */
export function closeDatabase(): void {
  if (defaultInstance) {
    defaultInstance.close();
    defaultInstance = null;
  }
}

export default DatabaseConnection;
