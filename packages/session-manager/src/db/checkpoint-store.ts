import { randomUUID } from 'node:crypto';

import type { CheckpointType } from '@gsd/core';
import type Database from 'better-sqlite3';

/**
 * Checkpoint status in the database.
 */
export type CheckpointStatus = 'pending' | 'acknowledged' | 'resolved';

/**
 * Checkpoint record structure.
 */
export interface CheckpointRecord {
  id: string;
  sessionId: string;
  type: CheckpointType | 'error';
  workflow?: string;
  phase?: number;
  status: CheckpointStatus;
  summary: string;
  nextCommand?: string;
  data?: Record<string, unknown>;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

/**
 * Row structure from checkpoints table.
 */
interface CheckpointRow {
  id: string;
  session_id: string;
  type: string;
  workflow: string | null;
  phase: number | null;
  status: string;
  summary: string;
  next_command: string | null;
  data: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

/**
 * Input for creating a checkpoint.
 */
export interface CreateCheckpointInput {
  sessionId: string;
  type: CheckpointType | 'error';
  workflow?: string;
  phase?: number;
  summary: string;
  nextCommand?: string;
  data?: Record<string, unknown>;
}

/**
 * Converts a database row to a CheckpointRecord.
 */
function rowToCheckpoint(row: CheckpointRow): CheckpointRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type as CheckpointType | 'error',
    workflow: row.workflow ?? undefined,
    phase: row.phase ?? undefined,
    status: row.status as CheckpointStatus,
    summary: row.summary,
    nextCommand: row.next_command ?? undefined,
    data: row.data ? JSON.parse(row.data) : undefined,
    createdAt: new Date(row.created_at),
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
  };
}

/**
 * CheckpointStore handles CRUD operations for checkpoint records.
 * Checkpoints are explicit signals from sessions to the orchestrator.
 */
export class CheckpointStore {
  private db: Database.Database;

  // Prepared statements
  private insertStmt: Database.Statement;
  private selectByIdStmt: Database.Statement;
  private selectBySessionStmt: Database.Statement;
  private selectPendingBySessionStmt: Database.Statement;
  private selectAllPendingStmt: Database.Statement;
  private updateStatusStmt: Database.Statement;
  private deleteBySessionStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    // Prepare all statements
    this.insertStmt = this.db.prepare(`
      INSERT INTO checkpoints (id, session_id, type, workflow, phase, status, summary, next_command, data)
      VALUES (@id, @sessionId, @type, @workflow, @phase, @status, @summary, @nextCommand, @data)
    `);

    this.selectByIdStmt = this.db.prepare(`
      SELECT id, session_id, type, workflow, phase, status, summary, next_command, data, created_at, acknowledged_at, resolved_at
      FROM checkpoints WHERE id = ?
    `);

    this.selectBySessionStmt = this.db.prepare(`
      SELECT id, session_id, type, workflow, phase, status, summary, next_command, data, created_at, acknowledged_at, resolved_at
      FROM checkpoints WHERE session_id = ? ORDER BY created_at DESC
    `);

    this.selectPendingBySessionStmt = this.db.prepare(`
      SELECT id, session_id, type, workflow, phase, status, summary, next_command, data, created_at, acknowledged_at, resolved_at
      FROM checkpoints WHERE session_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1
    `);

    this.selectAllPendingStmt = this.db.prepare(`
      SELECT id, session_id, type, workflow, phase, status, summary, next_command, data, created_at, acknowledged_at, resolved_at
      FROM checkpoints WHERE status = 'pending' ORDER BY created_at ASC
    `);

    this.updateStatusStmt = this.db.prepare(`
      UPDATE checkpoints
      SET status = @status,
          acknowledged_at = CASE WHEN @status = 'acknowledged' THEN datetime('now') ELSE acknowledged_at END,
          resolved_at = CASE WHEN @status = 'resolved' THEN datetime('now') ELSE resolved_at END
      WHERE id = @id
    `);

    this.deleteBySessionStmt = this.db.prepare(`
      DELETE FROM checkpoints WHERE session_id = ?
    `);
  }

  /**
   * Creates a new checkpoint record.
   * @returns The created checkpoint ID.
   */
  create(input: CreateCheckpointInput): string {
    const id = randomUUID();
    this.insertStmt.run({
      id,
      sessionId: input.sessionId,
      type: input.type,
      workflow: input.workflow ?? null,
      phase: input.phase ?? null,
      status: 'pending',
      summary: input.summary,
      nextCommand: input.nextCommand ?? null,
      data: input.data ? JSON.stringify(input.data) : null,
    });
    return id;
  }

  /**
   * Gets a checkpoint by ID.
   */
  get(id: string): CheckpointRecord | undefined {
    const row = this.selectByIdStmt.get(id) as CheckpointRow | undefined;
    return row ? rowToCheckpoint(row) : undefined;
  }

  /**
   * Gets all checkpoints for a session.
   */
  getBySession(sessionId: string): CheckpointRecord[] {
    const rows = this.selectBySessionStmt.all(sessionId) as CheckpointRow[];
    return rows.map(rowToCheckpoint);
  }

  /**
   * Gets the latest pending checkpoint for a session.
   */
  getPendingBySession(sessionId: string): CheckpointRecord | undefined {
    const row = this.selectPendingBySessionStmt.get(sessionId) as CheckpointRow | undefined;
    return row ? rowToCheckpoint(row) : undefined;
  }

  /**
   * Gets all pending checkpoints across all sessions.
   */
  getAllPending(): CheckpointRecord[] {
    const rows = this.selectAllPendingStmt.all() as CheckpointRow[];
    return rows.map(rowToCheckpoint);
  }

  /**
   * Updates a checkpoint status.
   */
  updateStatus(id: string, status: CheckpointStatus): void {
    this.updateStatusStmt.run({ id, status });
  }

  /**
   * Acknowledges a checkpoint (marks it as seen by orchestrator).
   */
  acknowledge(id: string): void {
    this.updateStatus(id, 'acknowledged');
  }

  /**
   * Resolves a checkpoint (marks it as handled).
   */
  resolve(id: string): void {
    this.updateStatus(id, 'resolved');
  }

  /**
   * Deletes all checkpoints for a session.
   */
  deleteBySession(sessionId: string): void {
    this.deleteBySessionStmt.run(sessionId);
  }
}
