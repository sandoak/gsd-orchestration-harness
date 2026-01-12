import type { SessionOutput } from '@gsd/core';
import type Database from 'better-sqlite3';

/**
 * Row structure from session_outputs table.
 */
interface OutputRow {
  id: number;
  session_id: string;
  timestamp: string;
  type: string;
  data: string;
}

/**
 * Converts a database row to a SessionOutput object.
 */
function rowToOutput(row: OutputRow): SessionOutput {
  return {
    sessionId: row.session_id,
    timestamp: new Date(row.timestamp),
    type: row.type as 'stdout' | 'stderr',
    data: row.data,
  };
}

/**
 * OutputStore handles CRUD operations for session output records.
 */
export class OutputStore {
  private db: Database.Database;

  // Prepared statements
  private insertStmt: Database.Statement;
  private selectBySessionStmt: Database.Statement;
  private selectBySessionLimitedStmt: Database.Statement;
  private selectBySessionSinceStmt: Database.Statement;
  private selectFullOutputStmt: Database.Statement;
  private deleteBySessionStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    // Prepare all statements
    this.insertStmt = this.db.prepare(`
      INSERT INTO session_outputs (session_id, timestamp, type, data)
      VALUES (@sessionId, @timestamp, @type, @data)
    `);

    this.selectBySessionStmt = this.db.prepare(`
      SELECT id, session_id, timestamp, type, data
      FROM session_outputs
      WHERE session_id = ?
      ORDER BY timestamp DESC
    `);

    this.selectBySessionLimitedStmt = this.db.prepare(`
      SELECT id, session_id, timestamp, type, data
      FROM session_outputs
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    this.selectBySessionSinceStmt = this.db.prepare(`
      SELECT id, session_id, timestamp, type, data
      FROM session_outputs
      WHERE session_id = ? AND timestamp > ?
      ORDER BY timestamp ASC
    `);

    this.selectFullOutputStmt = this.db.prepare(`
      SELECT id, session_id, timestamp, type, data
      FROM session_outputs
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    this.deleteBySessionStmt = this.db.prepare(`
      DELETE FROM session_outputs WHERE session_id = ?
    `);
  }

  /**
   * Appends a new output record.
   */
  append(output: SessionOutput): void {
    this.insertStmt.run({
      sessionId: output.sessionId,
      timestamp: output.timestamp.toISOString(),
      type: output.type,
      data: output.data,
    });
  }

  /**
   * Gets outputs for a session, newest first.
   * @param sessionId - The session ID
   * @param limit - Optional limit on number of records to return
   */
  getBySession(sessionId: string, limit?: number): SessionOutput[] {
    const rows =
      limit !== undefined
        ? (this.selectBySessionLimitedStmt.all(sessionId, limit) as OutputRow[])
        : (this.selectBySessionStmt.all(sessionId) as OutputRow[]);
    return rows.map(rowToOutput);
  }

  /**
   * Gets outputs for a session since a given timestamp.
   * Results are in chronological order (oldest first).
   * @param sessionId - The session ID
   * @param since - Only return outputs after this timestamp
   */
  getBySessionSince(sessionId: string, since: Date): SessionOutput[] {
    const rows = this.selectBySessionSinceStmt.all(sessionId, since.toISOString()) as OutputRow[];
    return rows.map(rowToOutput);
  }

  /**
   * Deletes all outputs for a session.
   */
  deleteBySession(sessionId: string): void {
    this.deleteBySessionStmt.run(sessionId);
  }

  /**
   * Gets the full output for a session as a single concatenated string.
   * Outputs are joined with newlines in chronological order.
   */
  getFullOutput(sessionId: string): string {
    const rows = this.selectFullOutputStmt.all(sessionId) as OutputRow[];
    return rows.map((row) => row.data).join('\n');
  }
}
