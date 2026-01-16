import { randomUUID } from 'node:crypto';

import type {
  OrchestratorMessage,
  OrchestratorMessageType,
  WorkerMessage,
  WorkerMessageStatus,
  WorkerMessageType,
} from '@gsd/core';
import type Database from 'better-sqlite3';

/**
 * Flexible input type for creating worker messages via MCP.
 * Accepts any JSON-serializable payload.
 */
export interface WorkerMessageCreateInput {
  sessionId: string;
  type: WorkerMessageType;
  payload: unknown;
}

/**
 * Flexible input type for creating orchestrator messages via MCP.
 * Accepts any JSON-serializable payload.
 */
export interface OrchestratorMessageCreateInput {
  sessionId: string;
  type: OrchestratorMessageType;
  payload: unknown;
  inResponseTo?: string;
}

/**
 * Row structure from worker_messages table.
 */
interface WorkerMessageRow {
  id: string;
  session_id: string;
  message_type: string;
  payload: string;
  status: string;
  created_at: string;
  responded_at: string | null;
  response: string | null;
}

/**
 * Row structure from orchestrator_messages table.
 */
interface OrchestratorMessageRow {
  id: string;
  session_id: string;
  message_type: string;
  payload: string;
  in_response_to: string | null;
  created_at: string;
}

/**
 * Converts a database row to a WorkerMessage object.
 */
function rowToWorkerMessage(row: WorkerMessageRow): WorkerMessage {
  const base = {
    id: row.id,
    sessionId: row.session_id,
    type: row.message_type as WorkerMessageType,
    timestamp: row.created_at,
    status: row.status as WorkerMessageStatus,
  };

  const payload = JSON.parse(row.payload);

  // Return with properly typed payload based on message type
  return {
    ...base,
    payload,
  } as WorkerMessage;
}

/**
 * Converts a database row to an OrchestratorMessage object.
 */
function rowToOrchestratorMessage(row: OrchestratorMessageRow): OrchestratorMessage {
  const base = {
    id: row.id,
    sessionId: row.session_id,
    type: row.message_type as OrchestratorMessageType,
    timestamp: row.created_at,
    inResponseTo: row.in_response_to ?? undefined,
  };

  const payload = JSON.parse(row.payload);

  return {
    ...base,
    payload,
  } as OrchestratorMessage;
}

/**
 * MessageStore handles CRUD operations for worker and orchestrator messages.
 * This is the core of the structured communication protocol.
 */
export class MessageStore {
  private db: Database.Database;

  // Worker message statements
  private insertWorkerMsgStmt: Database.Statement;
  private selectWorkerMsgByIdStmt: Database.Statement;
  private selectWorkerMsgsBySessionStmt: Database.Statement;
  private selectPendingWorkerMsgsStmt: Database.Statement;
  private selectPendingBySessionStmt: Database.Statement;
  private updateWorkerMsgStatusStmt: Database.Statement;
  private respondToWorkerMsgStmt: Database.Statement;

  // Orchestrator message statements
  private insertOrchestratorMsgStmt: Database.Statement;
  private selectOrchestratorMsgByIdStmt: Database.Statement;
  private selectOrchestratorMsgsBySessionStmt: Database.Statement;
  private selectLatestOrchestratorMsgStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    // Worker message prepared statements
    this.insertWorkerMsgStmt = this.db.prepare(`
      INSERT INTO worker_messages (id, session_id, message_type, payload, status)
      VALUES (@id, @sessionId, @messageType, @payload, 'pending')
    `);

    this.selectWorkerMsgByIdStmt = this.db.prepare(`
      SELECT id, session_id, message_type, payload, status, created_at, responded_at, response
      FROM worker_messages WHERE id = ?
    `);

    this.selectWorkerMsgsBySessionStmt = this.db.prepare(`
      SELECT id, session_id, message_type, payload, status, created_at, responded_at, response
      FROM worker_messages WHERE session_id = ? ORDER BY created_at DESC
    `);

    this.selectPendingWorkerMsgsStmt = this.db.prepare(`
      SELECT id, session_id, message_type, payload, status, created_at, responded_at, response
      FROM worker_messages WHERE status = 'pending' ORDER BY created_at ASC
    `);

    this.selectPendingBySessionStmt = this.db.prepare(`
      SELECT id, session_id, message_type, payload, status, created_at, responded_at, response
      FROM worker_messages WHERE session_id = ? AND status = 'pending' ORDER BY created_at ASC
    `);

    this.updateWorkerMsgStatusStmt = this.db.prepare(`
      UPDATE worker_messages SET status = @status WHERE id = @id
    `);

    this.respondToWorkerMsgStmt = this.db.prepare(`
      UPDATE worker_messages
      SET status = 'responded', responded_at = datetime('now'), response = @response
      WHERE id = @id
    `);

    // Orchestrator message prepared statements
    this.insertOrchestratorMsgStmt = this.db.prepare(`
      INSERT INTO orchestrator_messages (id, session_id, message_type, payload, in_response_to)
      VALUES (@id, @sessionId, @messageType, @payload, @inResponseTo)
    `);

    this.selectOrchestratorMsgByIdStmt = this.db.prepare(`
      SELECT id, session_id, message_type, payload, in_response_to, created_at
      FROM orchestrator_messages WHERE id = ?
    `);

    this.selectOrchestratorMsgsBySessionStmt = this.db.prepare(`
      SELECT id, session_id, message_type, payload, in_response_to, created_at
      FROM orchestrator_messages WHERE session_id = ? ORDER BY created_at DESC
    `);

    this.selectLatestOrchestratorMsgStmt = this.db.prepare(`
      SELECT id, session_id, message_type, payload, in_response_to, created_at
      FROM orchestrator_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 1
    `);
  }

  // ==================== Worker Message Methods ====================

  /**
   * Creates a new worker message.
   * @returns The created message with ID and timestamp.
   */
  createWorkerMessage(input: WorkerMessageCreateInput): WorkerMessage {
    const id = randomUUID();
    const payload = JSON.stringify(input.payload);

    this.insertWorkerMsgStmt.run({
      id,
      sessionId: input.sessionId,
      messageType: input.type,
      payload,
    });

    // Fetch and return the created message
    const row = this.selectWorkerMsgByIdStmt.get(id) as WorkerMessageRow;
    return rowToWorkerMessage(row);
  }

  /**
   * Gets a worker message by ID.
   */
  getWorkerMessage(id: string): WorkerMessage | undefined {
    const row = this.selectWorkerMsgByIdStmt.get(id) as WorkerMessageRow | undefined;
    return row ? rowToWorkerMessage(row) : undefined;
  }

  /**
   * Lists all worker messages for a session.
   */
  listWorkerMessagesBySession(sessionId: string): WorkerMessage[] {
    const rows = this.selectWorkerMsgsBySessionStmt.all(sessionId) as WorkerMessageRow[];
    return rows.map(rowToWorkerMessage);
  }

  /**
   * Lists all pending worker messages (across all sessions).
   */
  listPendingWorkerMessages(): WorkerMessage[] {
    const rows = this.selectPendingWorkerMsgsStmt.all() as WorkerMessageRow[];
    return rows.map(rowToWorkerMessage);
  }

  /**
   * Lists pending worker messages for a specific session.
   */
  listPendingBySession(sessionId: string): WorkerMessage[] {
    const rows = this.selectPendingBySessionStmt.all(sessionId) as WorkerMessageRow[];
    return rows.map(rowToWorkerMessage);
  }

  /**
   * Updates the status of a worker message.
   */
  updateWorkerMessageStatus(id: string, status: WorkerMessageStatus): void {
    this.updateWorkerMsgStatusStmt.run({ id, status });
  }

  /**
   * Responds to a worker message (marks it as responded and stores the response).
   */
  respondToWorkerMessage(id: string, response: OrchestratorMessage): void {
    this.respondToWorkerMsgStmt.run({
      id,
      response: JSON.stringify(response),
    });
  }

  /**
   * Checks if a session has any pending messages that require a response.
   */
  hasPendingMessages(sessionId: string): boolean {
    const pending = this.listPendingBySession(sessionId);
    return pending.length > 0;
  }

  /**
   * Gets the latest pending message for a session that requires a response.
   * These are: verification_needed, decision_needed, action_needed
   */
  getLatestPendingCheckpoint(sessionId: string): WorkerMessage | undefined {
    const pending = this.listPendingBySession(sessionId);
    const checkpointTypes = ['verification_needed', 'decision_needed', 'action_needed'];
    return pending.find((msg) => checkpointTypes.includes(msg.type));
  }

  // ==================== Orchestrator Message Methods ====================

  /**
   * Creates a new orchestrator message.
   * @returns The created message with ID and timestamp.
   */
  createOrchestratorMessage(input: OrchestratorMessageCreateInput): OrchestratorMessage {
    const id = randomUUID();
    const payload = JSON.stringify(input.payload);

    this.insertOrchestratorMsgStmt.run({
      id,
      sessionId: input.sessionId,
      messageType: input.type,
      payload,
      inResponseTo: input.inResponseTo ?? null,
    });

    // Fetch and return the created message
    const row = this.selectOrchestratorMsgByIdStmt.get(id) as OrchestratorMessageRow;
    return rowToOrchestratorMessage(row);
  }

  /**
   * Gets an orchestrator message by ID.
   */
  getOrchestratorMessage(id: string): OrchestratorMessage | undefined {
    const row = this.selectOrchestratorMsgByIdStmt.get(id) as OrchestratorMessageRow | undefined;
    return row ? rowToOrchestratorMessage(row) : undefined;
  }

  /**
   * Lists all orchestrator messages for a session.
   */
  listOrchestratorMessagesBySession(sessionId: string): OrchestratorMessage[] {
    const rows = this.selectOrchestratorMsgsBySessionStmt.all(
      sessionId
    ) as OrchestratorMessageRow[];
    return rows.map(rowToOrchestratorMessage);
  }

  /**
   * Gets the latest orchestrator message for a session.
   * Useful for workers to check for new instructions.
   */
  getLatestOrchestratorMessage(sessionId: string): OrchestratorMessage | undefined {
    const row = this.selectLatestOrchestratorMsgStmt.get(sessionId) as
      | OrchestratorMessageRow
      | undefined;
    return row ? rowToOrchestratorMessage(row) : undefined;
  }

  /**
   * Creates an orchestrator response and marks the worker message as responded.
   * This is a convenience method for the common respond-to-checkpoint flow.
   */
  respondToCheckpoint(
    workerMessageId: string,
    responseInput: Omit<OrchestratorMessageCreateInput, 'inResponseTo'>
  ): OrchestratorMessage {
    // Create the response with the reference to the worker message
    const response = this.createOrchestratorMessage({
      ...responseInput,
      inResponseTo: workerMessageId,
    });

    // Mark the worker message as responded
    this.respondToWorkerMessage(workerMessageId, response);

    return response;
  }

  /**
   * Expires old pending messages (cleanup utility).
   * @param olderThanMinutes - Expire messages older than this many minutes.
   * @returns Number of messages expired.
   */
  expireOldMessages(olderThanMinutes: number = 60): number {
    const result = this.db
      .prepare(
        `
      UPDATE worker_messages
      SET status = 'expired'
      WHERE status = 'pending'
        AND created_at < datetime('now', '-' || ? || ' minutes')
    `
      )
      .run(olderThanMinutes);

    return result.changes;
  }
}
