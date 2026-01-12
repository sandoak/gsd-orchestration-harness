import { EventEmitter } from 'node:events';

import type {
  Session,
  SessionOutput,
  SessionStartedEvent,
  SessionOutputEvent,
  SessionCompletedEvent,
  SessionFailedEvent,
} from '@gsd/core';

import { DatabaseConnection } from './db/database.js';
import { OutputStore } from './db/output-store.js';
import { SessionStore } from './db/session-store.js';
import { recoverOrphanedSessions, type RecoveryResult } from './recovery.js';
import { SessionManager, type SessionManagerOptions } from './session-manager.js';

/**
 * Events emitted by PersistentSessionManager.
 */
interface PersistentSessionManagerEvents {
  'session:started': [event: SessionStartedEvent];
  'session:output': [event: SessionOutputEvent];
  'session:completed': [event: SessionCompletedEvent];
  'session:failed': [event: SessionFailedEvent];
  'recovery:complete': [result: RecoveryResult];
}

/**
 * Options for PersistentSessionManager.
 */
export interface PersistentSessionManagerOptions extends SessionManagerOptions {
  /**
   * Path to the SQLite database file.
   * Defaults to ~/.gsd-harness/sessions.db
   */
  dbPath?: string;

  /**
   * Whether to automatically recover orphaned sessions on startup.
   * Defaults to true.
   */
  autoRecover?: boolean;
}

/**
 * PersistentSessionManager wraps SessionManager with automatic SQLite persistence.
 *
 * Events from the inner SessionManager are intercepted and persisted to the database,
 * then re-emitted. This provides:
 * - Automatic persistence of session lifecycle events
 * - Historical session data retrieval
 * - Startup recovery for orphaned sessions
 *
 * The inner SessionManager is the source of truth for live sessions.
 * The database is the source of truth for completed/historical sessions.
 */
export class PersistentSessionManager extends EventEmitter<PersistentSessionManagerEvents> {
  private dbConnection: DatabaseConnection;
  private sessionStore: SessionStore;
  private outputStore: OutputStore;
  private sessionManager: SessionManager;

  constructor(options?: PersistentSessionManagerOptions) {
    super();

    // Initialize database
    this.dbConnection = new DatabaseConnection(options?.dbPath);
    this.sessionStore = new SessionStore(this.dbConnection.db);
    this.outputStore = new OutputStore(this.dbConnection.db);

    // Initialize inner session manager
    this.sessionManager = new SessionManager({
      outputBufferSize: options?.outputBufferSize,
      executable: options?.executable,
    });

    // Wire event listeners to persist data
    this.wireEventListeners();

    // Perform recovery if enabled
    const autoRecover = options?.autoRecover ?? true;
    if (autoRecover) {
      const recoveryResult = recoverOrphanedSessions(this.sessionStore);
      // Emit recovery event - consumers can log or handle as needed
      this.emit('recovery:complete', recoveryResult);
    }
  }

  /**
   * Wires event listeners from inner SessionManager to persistence layer and re-emits.
   */
  private wireEventListeners(): void {
    // session:started → persist and re-emit
    this.sessionManager.on('session:started', (event) => {
      // Get the full session object to persist
      const session = this.sessionManager.getSession(event.sessionId);
      if (session) {
        this.sessionStore.create(session);
      }
      this.emit('session:started', event);
    });

    // session:output → persist and re-emit
    this.sessionManager.on('session:output', (event) => {
      const output: SessionOutput = {
        sessionId: event.sessionId,
        timestamp: event.timestamp,
        type: event.stream,
        data: event.data,
      };
      this.outputStore.append(output);
      this.emit('session:output', event);
    });

    // session:completed → update store and re-emit
    this.sessionManager.on('session:completed', (event) => {
      this.sessionStore.update(event.sessionId, {
        status: 'completed',
        endedAt: event.timestamp,
      });
      this.emit('session:completed', event);
    });

    // session:failed → update store and re-emit
    this.sessionManager.on('session:failed', (event) => {
      this.sessionStore.update(event.sessionId, {
        status: 'failed',
        endedAt: event.timestamp,
      });
      this.emit('session:failed', event);
    });
  }

  /**
   * Spawns a new Claude CLI session.
   * The session is automatically persisted to the database.
   *
   * @param workingDir - Working directory for the Claude process
   * @param command - Optional command to pass to Claude
   * @returns The created session
   */
  async spawn(workingDir: string, command?: string): Promise<Session> {
    return this.sessionManager.spawn(workingDir, command);
  }

  /**
   * Terminates a session by killing its process.
   *
   * @param sessionId - ID of the session to terminate
   */
  async terminate(sessionId: string): Promise<void> {
    await this.sessionManager.terminate(sessionId);
  }

  /**
   * Gets a session by ID.
   * Checks live sessions first, then falls back to database for completed sessions.
   *
   * @param sessionId - ID of the session to retrieve
   * @returns The session or undefined if not found
   */
  getSession(sessionId: string): Session | undefined {
    // Try live session first
    const liveSession = this.sessionManager.getSession(sessionId);
    if (liveSession) {
      return liveSession;
    }

    // Fall back to database for completed sessions
    return this.sessionStore.get(sessionId);
  }

  /**
   * Lists all sessions, merging live sessions with completed sessions from the database.
   * Live sessions are returned with their current state.
   *
   * @returns Array of all sessions (live + completed from database)
   */
  listSessions(): Session[] {
    const liveSessions = this.sessionManager.listSessions();
    const liveSessionIds = new Set(liveSessions.map((s) => s.id));

    // Get completed sessions from database that aren't currently live
    const storedSessions = this.sessionStore.list();
    const completedSessions = storedSessions.filter((s) => !liveSessionIds.has(s.id));

    // Merge: live sessions first, then completed
    return [...liveSessions, ...completedSessions];
  }

  /**
   * Gets the output for a session.
   * Checks live session buffer first, then falls back to database.
   *
   * @param sessionId - ID of the session
   * @returns Array of output chunks (live) or joined string (historical)
   */
  getOutput(sessionId: string): string[] {
    // Try live session buffer first
    const liveOutput = this.sessionManager.getOutput(sessionId);
    if (liveOutput.length > 0) {
      return liveOutput;
    }

    // Fall back to database
    const fullOutput = this.outputStore.getFullOutput(sessionId);
    return fullOutput ? [fullOutput] : [];
  }

  /**
   * Gets historical sessions from the database.
   *
   * @param limit - Optional limit on number of sessions to return
   * @returns Array of sessions from the database
   */
  getHistoricalSessions(limit?: number): Session[] {
    const sessions = this.sessionStore.list();
    return limit !== undefined ? sessions.slice(0, limit) : sessions;
  }

  /**
   * Gets the number of available session slots.
   */
  get availableSlotsCount(): number {
    return this.sessionManager.availableSlotsCount;
  }

  /**
   * Closes the database connection and terminates any running sessions.
   */
  async close(): Promise<void> {
    // Terminate all running sessions
    const liveSessions = this.sessionManager.listSessions();
    for (const session of liveSessions) {
      await this.sessionManager.terminate(session.id);
    }

    // Close database connection
    this.dbConnection.close();
  }
}
