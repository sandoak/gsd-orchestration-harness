import type { Session, SessionStatus } from '@gsd/core';
import type Database from 'better-sqlite3';

/**
 * Row structure from sessions table.
 */
interface SessionRow {
  id: string;
  slot: number;
  status: string;
  working_dir: string;
  current_command: string | null;
  started_at: string;
  ended_at: string | null;
  pid: number | null;
}

/**
 * Fields that can be updated on a session.
 */
export type SessionUpdateFields = Partial<
  Pick<Session, 'status' | 'currentCommand' | 'endedAt' | 'pid'>
>;

/**
 * Converts a database row to a Session object.
 */
function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    slot: row.slot as 1 | 2 | 3,
    status: row.status as SessionStatus,
    workingDir: row.working_dir,
    currentCommand: row.current_command ?? undefined,
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
    pid: row.pid ?? undefined,
  };
}

/**
 * SessionStore handles CRUD operations for session records.
 */
export class SessionStore {
  private db: Database.Database;

  // Prepared statements
  private insertStmt: Database.Statement;
  private selectByIdStmt: Database.Statement;
  private selectAllStmt: Database.Statement;
  private selectByStatusStmt: Database.Statement;
  private selectRunningStmt: Database.Statement;
  private deleteStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    // Prepare all statements
    this.insertStmt = this.db.prepare(`
      INSERT INTO sessions (id, slot, status, working_dir, current_command, started_at, ended_at, pid)
      VALUES (@id, @slot, @status, @workingDir, @currentCommand, @startedAt, @endedAt, @pid)
    `);

    this.selectByIdStmt = this.db.prepare(`
      SELECT id, slot, status, working_dir, current_command, started_at, ended_at, pid
      FROM sessions WHERE id = ?
    `);

    this.selectAllStmt = this.db.prepare(`
      SELECT id, slot, status, working_dir, current_command, started_at, ended_at, pid
      FROM sessions ORDER BY started_at DESC
    `);

    this.selectByStatusStmt = this.db.prepare(`
      SELECT id, slot, status, working_dir, current_command, started_at, ended_at, pid
      FROM sessions WHERE status = ? ORDER BY started_at DESC
    `);

    this.selectRunningStmt = this.db.prepare(`
      SELECT id, slot, status, working_dir, current_command, started_at, ended_at, pid
      FROM sessions WHERE status IN ('running', 'waiting_checkpoint') ORDER BY started_at DESC
    `);

    this.deleteStmt = this.db.prepare(`DELETE FROM sessions WHERE id = ?`);
  }

  /**
   * Creates a new session record.
   */
  create(session: Session): void {
    this.insertStmt.run({
      id: session.id,
      slot: session.slot,
      status: session.status,
      workingDir: session.workingDir,
      currentCommand: session.currentCommand ?? null,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      pid: session.pid ?? null,
    });
  }

  /**
   * Gets a session by ID.
   * @returns The session or undefined if not found.
   */
  get(id: string): Session | undefined {
    const row = this.selectByIdStmt.get(id) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  /**
   * Updates a session with the given fields.
   */
  update(id: string, updates: SessionUpdateFields): void {
    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id };

    if (updates.status !== undefined) {
      setClauses.push('status = @status');
      params.status = updates.status;
    }

    if (updates.currentCommand !== undefined) {
      setClauses.push('current_command = @currentCommand');
      params.currentCommand = updates.currentCommand;
    }

    if (updates.endedAt !== undefined) {
      setClauses.push('ended_at = @endedAt');
      params.endedAt = updates.endedAt.toISOString();
    }

    if (updates.pid !== undefined) {
      setClauses.push('pid = @pid');
      params.pid = updates.pid;
    }

    if (setClauses.length === 0) {
      return; // Nothing to update
    }

    setClauses.push("updated_at = datetime('now')");

    const sql = `UPDATE sessions SET ${setClauses.join(', ')} WHERE id = @id`;
    this.db.prepare(sql).run(params);
  }

  /**
   * Deletes a session by ID.
   */
  delete(id: string): void {
    this.deleteStmt.run(id);
  }

  /**
   * Lists all sessions.
   */
  list(): Session[] {
    const rows = this.selectAllStmt.all() as SessionRow[];
    return rows.map(rowToSession);
  }

  /**
   * Lists sessions with a specific status.
   */
  listByStatus(status: SessionStatus): Session[] {
    const rows = this.selectByStatusStmt.all(status) as SessionRow[];
    return rows.map(rowToSession);
  }

  /**
   * Finds all running sessions (status: running or waiting_checkpoint).
   */
  findRunning(): Session[] {
    const rows = this.selectRunningStmt.all() as SessionRow[];
    return rows.map(rowToSession);
  }
}
