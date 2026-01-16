import { db } from './connection.js';

export function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_completed
    ON tasks(completed)
  `);

  // eslint-disable-next-line no-console
  console.log('Database tables created');
}

export function dropTables(): void {
  db.exec('DROP TABLE IF EXISTS tasks');
  // eslint-disable-next-line no-console
  console.log('Database tables dropped');
}
