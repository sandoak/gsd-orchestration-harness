import fs from 'fs';
import path from 'path';

import Database, { type Database as DatabaseType } from 'better-sqlite3';

// Database path from environment variable or default
const DB_PATH = process.env.TASKFLOW_DB_PATH || './data/taskflow.db';

// Ensure data directory exists (skip for in-memory database)
if (DB_PATH !== ':memory:') {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

// Create database connection
export const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrent access (skip for in-memory database)
if (DB_PATH !== ':memory:') {
  db.pragma('journal_mode = WAL');
}

export function initializeDatabase(): void {
  // eslint-disable-next-line no-console
  console.log(`Database initialized at: ${DB_PATH}`);
}

export function closeDatabase(): void {
  db.close();
}
