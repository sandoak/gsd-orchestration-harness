import { EventEmitter } from 'node:events';
import { setInterval, clearInterval } from 'node:timers';

import type {
  Session,
  SessionOutput,
  SessionStartedEvent,
  SessionOutputEvent,
  SessionCompletedEvent,
  SessionFailedEvent,
  SessionWaitingEvent,
  WaitStateType,
  PromptIntent,
} from '@gsd/core';

import { CheckpointStore } from './db/checkpoint-store.js';
import { DatabaseConnection } from './db/database.js';
import { MessageStore } from './db/message-store.js';
import { OrchestrationStore } from './db/orchestration-store.js';
import { OutputStore } from './db/output-store.js';
import { SessionStore } from './db/session-store.js';
import { ProtocolDirectory } from './protocol-directory.js';
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
  'session:waiting': [event: SessionWaitingEvent];
  'recovery:complete': [result: RecoveryResult];
}

/**
 * Default session timeout in milliseconds (10 minutes).
 */
const DEFAULT_SESSION_TIMEOUT = 10 * 60 * 1000;

/**
 * How often to check for stale sessions (1 minute).
 */
const TIMEOUT_CHECK_INTERVAL = 60 * 1000;

/**
 * Options for PersistentSessionManager.
 */
export interface PersistentSessionManagerOptions extends SessionManagerOptions {
  /**
   * Path to the SQLite database file.
   * Defaults to ~/.harness/sessions.db
   */
  dbPath?: string;

  /**
   * Whether to automatically recover orphaned sessions on startup.
   * Defaults to true.
   */
  autoRecover?: boolean;

  /**
   * Session timeout in milliseconds. Sessions not polled within this time
   * will be automatically terminated. Set to 0 to disable.
   * Defaults to 10 minutes.
   */
  sessionTimeout?: number;
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
  private _orchestrationStore: OrchestrationStore;
  private _messageStore: MessageStore;
  private _checkpointStore: CheckpointStore;
  private sessionManager: SessionManager;
  private timeoutChecker: ReturnType<typeof setInterval> | null = null;
  private sessionTimeout: number;

  // Protocol directories per working directory (for crash recovery)
  private protocolDirs: Map<string, ProtocolDirectory> = new Map();

  constructor(options?: PersistentSessionManagerOptions) {
    super();

    // Initialize database
    this.dbConnection = new DatabaseConnection(options?.dbPath);
    this.sessionStore = new SessionStore(this.dbConnection.db);
    this.outputStore = new OutputStore(this.dbConnection.db);
    this._orchestrationStore = new OrchestrationStore(this.dbConnection.db);
    this._messageStore = new MessageStore(this.dbConnection.db);
    this._checkpointStore = new CheckpointStore(this.dbConnection.db);

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

    // Set up session timeout checker
    this.sessionTimeout = options?.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT;
    if (this.sessionTimeout > 0) {
      this.startTimeoutChecker();
    }
  }

  /**
   * Starts the periodic timeout checker.
   */
  private startTimeoutChecker(): void {
    this.timeoutChecker = setInterval(() => {
      this.terminateStaleSessions();
    }, TIMEOUT_CHECK_INTERVAL);

    // Don't prevent process from exiting
    this.timeoutChecker.unref();
  }

  /**
   * Terminates sessions that haven't been polled within the timeout period.
   */
  private async terminateStaleSessions(): Promise<void> {
    const staleSessions = this.sessionManager.findStaleSessions(this.sessionTimeout);

    for (const sessionId of staleSessions) {
      const session = this.sessionManager.getSession(sessionId);
      if (session) {
        // eslint-disable-next-line no-console
        console.error(
          `[harness] Terminating stale session ${sessionId} (not polled for ${Math.round(this.sessionTimeout / 60000)} minutes)`
        );
        await this.terminate(sessionId);
      }
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

    // session:waiting → update status and re-emit
    // MCP tools check database status, so we must persist waiting_checkpoint
    this.sessionManager.on('session:waiting', (event) => {
      this.sessionStore.update(event.sessionId, {
        status: 'waiting_checkpoint',
      });
      this.emit('session:waiting', event);
    });
  }

  /**
   * Spawns a new Claude CLI session.
   * The session is automatically persisted to the database.
   * Also initializes the protocol directory for crash recovery.
   *
   * @param workingDir - Working directory for the Claude process
   * @param command - Optional command to pass to Claude
   * @returns The created session
   */
  async spawn(workingDir: string, command?: string): Promise<Session> {
    const session = await this.sessionManager.spawn(workingDir, command);

    // Initialize protocol directory for this working directory
    let protocolDir = this.protocolDirs.get(workingDir);
    if (!protocolDir) {
      protocolDir = new ProtocolDirectory(workingDir);
      protocolDir.initialize();
      this.protocolDirs.set(workingDir, protocolDir);
    }

    // Create session directory in protocol
    protocolDir.createSessionDir(session.id);

    // Write initial status
    protocolDir.writeStatus(session.id, {
      sessionId: session.id,
      timestamp: new Date().toISOString(),
      state: 'initializing',
      phase: 0,
      plan: 0,
      currentTask: 0,
      totalTasks: 0,
    });

    return session;
  }

  /**
   * Terminates a session by killing its process.
   * Cleans up active file registrations in the protocol directory.
   *
   * @param sessionId - ID of the session to terminate
   */
  async terminate(sessionId: string): Promise<void> {
    // Get session to find working dir
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      // Clean up active file registrations
      const protocolDir = this.protocolDirs.get(session.workingDir);
      if (protocolDir) {
        protocolDir.unregisterSessionFiles(sessionId);
      }
    }

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
   * Gets the current wait state for a session (if any).
   * Used by wait-for-state-change to check for already-waiting sessions.
   *
   * @param sessionId - ID of the session
   * @returns Current wait state info or null if session not found or not waiting
   */
  getSessionWaitState(sessionId: string): {
    waitType: WaitStateType;
    trigger?: string;
    promptIntent?: PromptIntent;
    promptContext?: string;
  } | null {
    return this.sessionManager.getSessionWaitState(sessionId);
  }

  /**
   * Updates the status of a session.
   * Used by MCP tools to mark sessions as waiting_checkpoint, etc.
   *
   * @param sessionId - ID of the session to update
   * @param status - New status to set
   */
  updateSessionStatus(sessionId: string, status: Session['status']): void {
    this.sessionStore.update(sessionId, { status });
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
   * Gets the orchestration store for tracking plans and execution state.
   */
  get orchestrationStore(): OrchestrationStore {
    return this._orchestrationStore;
  }

  /**
   * Gets the message store for worker-orchestrator communication.
   */
  get messageStore(): MessageStore {
    return this._messageStore;
  }

  /**
   * Gets the checkpoint store for explicit checkpoint signaling.
   */
  get checkpointStore(): CheckpointStore {
    return this._checkpointStore;
  }

  /**
   * Gets or creates a protocol directory for a working directory.
   * Used for crash recovery and state persistence.
   *
   * @param workingDir - The project working directory
   * @returns The ProtocolDirectory instance
   */
  getProtocolDirectory(workingDir: string): ProtocolDirectory {
    let protocolDir = this.protocolDirs.get(workingDir);
    if (!protocolDir) {
      protocolDir = new ProtocolDirectory(workingDir);
      protocolDir.initialize();
      this.protocolDirs.set(workingDir, protocolDir);
    }
    return protocolDir;
  }

  /**
   * Gets the last polled timestamp for a session.
   */
  getLastPolledAt(sessionId: string): Date | undefined {
    return this.sessionManager.getLastPolledAt(sessionId);
  }

  /**
   * Gets the session timeout setting in milliseconds.
   */
  getSessionTimeout(): number {
    return this.sessionTimeout;
  }

  /**
   * Checks if a session is stale (not polled within timeout period).
   */
  isSessionStale(sessionId: string): boolean {
    const lastPolled = this.sessionManager.getLastPolledAt(sessionId);
    if (!lastPolled) return false;
    return Date.now() - lastPolled.getTime() > this.sessionTimeout;
  }

  /**
   * Gets stale session IDs.
   */
  getStaleSessions(): string[] {
    return this.sessionManager.findStaleSessions(this.sessionTimeout);
  }

  /**
   * Sends input to a session's stdin.
   * Used to relay checkpoint responses from orchestrator to CLI.
   *
   * @param sessionId - ID of the session
   * @param input - Text to write to stdin (will append newline)
   * @returns true if sent, false if session not found or stdin not writable
   */
  sendInput(sessionId: string, input: string): boolean {
    return this.sessionManager.sendInput(sessionId, input);
  }

  /**
   * Sends raw input to a session's stdin without any special handling.
   * Unlike sendInput, this does NOT add newlines or handle special cases.
   * The input is written exactly as provided.
   *
   * @param sessionId - ID of the session
   * @param input - Raw text to write to stdin (no automatic newlines)
   * @returns true if sent, false if session not found
   */
  sendRawInput(sessionId: string, input: string): boolean {
    return this.sessionManager.sendRawInput(sessionId, input);
  }

  /**
   * Resizes a session's PTY to match the terminal viewport.
   *
   * @param sessionId - ID of the session
   * @param cols - Number of columns
   * @param rows - Number of rows
   * @returns true if resized, false if session not found
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    return this.sessionManager.resize(sessionId, cols, rows);
  }

  /**
   * Closes the database connection and terminates any running sessions.
   */
  async close(): Promise<void> {
    // Stop the timeout checker
    if (this.timeoutChecker) {
      clearInterval(this.timeoutChecker);
      this.timeoutChecker = null;
    }

    // Terminate all running sessions
    const liveSessions = this.sessionManager.listSessions();
    for (const session of liveSessions) {
      await this.sessionManager.terminate(session.id);
    }

    // Close database connection
    this.dbConnection.close();
  }
}
