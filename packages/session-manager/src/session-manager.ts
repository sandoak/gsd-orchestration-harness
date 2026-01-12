import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { setTimeout, clearTimeout } from 'node:timers';

import type {
  Session,
  SessionStatus,
  SessionStartedEvent,
  SessionOutputEvent,
  SessionCompletedEvent,
  SessionFailedEvent,
} from '@gsd/core';
import { MAX_SESSIONS, SESSION_SLOTS, DEFAULT_OUTPUT_BUFFER_SIZE } from '@gsd/core';

type SlotNumber = (typeof SESSION_SLOTS)[number];

interface ManagedSession {
  session: Session;
  process: ChildProcess;
  outputBuffer: string[];
}

interface SessionManagerEvents {
  'session:started': [event: SessionStartedEvent];
  'session:output': [event: SessionOutputEvent];
  'session:completed': [event: SessionCompletedEvent];
  'session:failed': [event: SessionFailedEvent];
}

/**
 * SessionManager handles Claude CLI process lifecycle.
 * Manages spawning, monitoring, and terminating Claude sessions
 * with a maximum of 3 concurrent sessions (slots 1-3).
 */
export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private sessions: Map<string, ManagedSession> = new Map();
  private availableSlots: Set<SlotNumber> = new Set(SESSION_SLOTS);
  private outputBufferSize: number;

  constructor(options?: { outputBufferSize?: number }) {
    super();
    this.outputBufferSize = options?.outputBufferSize ?? DEFAULT_OUTPUT_BUFFER_SIZE;
  }

  /**
   * Spawns a new Claude CLI session.
   * @param workingDir - Working directory for the Claude process
   * @param command - Optional command to pass to Claude
   * @returns The created session
   * @throws Error if all slots are occupied
   */
  async spawn(workingDir: string, command?: string): Promise<Session> {
    // Check for available slot
    if (this.availableSlots.size === 0) {
      throw new Error(`All ${MAX_SESSIONS} session slots are occupied`);
    }

    // Assign slot (pick first available)
    const slot = [...this.availableSlots][0] as SlotNumber;
    this.availableSlots.delete(slot);

    // Generate session ID
    const sessionId = randomUUID();
    const commandToRun = command ?? '';

    // Build spawn arguments
    const args = commandToRun ? [commandToRun] : [];

    // Spawn the Claude CLI process
    const childProcess = spawn('claude', args, {
      cwd: workingDir,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create session object
    const session: Session = {
      id: sessionId,
      slot,
      status: 'running' as SessionStatus,
      workingDir,
      currentCommand: commandToRun || undefined,
      startedAt: new Date(),
      pid: childProcess.pid,
    };

    // Create managed session
    const managedSession: ManagedSession = {
      session,
      process: childProcess,
      outputBuffer: [],
    };

    this.sessions.set(sessionId, managedSession);

    // Emit session started event
    const startedEvent: SessionStartedEvent = {
      type: 'session:started',
      timestamp: new Date(),
      sessionId,
      slot,
      workingDir,
      command: commandToRun,
    };
    this.emit('session:started', startedEvent);

    // Attach stdout handler
    childProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.handleOutput(sessionId, 'stdout', text);
    });

    // Attach stderr handler
    childProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.handleOutput(sessionId, 'stderr', text);
    });

    // Attach exit handler
    childProcess.on('exit', (code, signal) => {
      const managed = this.sessions.get(sessionId);
      if (!managed) return;

      managed.session.status = code === 0 ? 'completed' : 'failed';
      managed.session.endedAt = new Date();

      // Free the slot
      this.availableSlots.add(slot);

      if (code === 0 || code === null) {
        const completedEvent: SessionCompletedEvent = {
          type: 'session:completed',
          timestamp: new Date(),
          sessionId,
          exitCode: code ?? 0,
        };
        this.emit('session:completed', completedEvent);
      } else {
        const failedEvent: SessionFailedEvent = {
          type: 'session:failed',
          timestamp: new Date(),
          sessionId,
          error: signal
            ? `Process killed with signal ${signal}`
            : `Process exited with code ${code}`,
        };
        this.emit('session:failed', failedEvent);
      }

      // Remove from active sessions after emitting events
      this.sessions.delete(sessionId);
    });

    // Attach error handler for spawn failures
    childProcess.on('error', (err) => {
      const managed = this.sessions.get(sessionId);
      if (!managed) return;

      managed.session.status = 'failed';
      managed.session.endedAt = new Date();

      // Free the slot
      this.availableSlots.add(slot);

      const failedEvent: SessionFailedEvent = {
        type: 'session:failed',
        timestamp: new Date(),
        sessionId,
        error: err.message,
      };
      this.emit('session:failed', failedEvent);

      // Remove from active sessions
      this.sessions.delete(sessionId);
    });

    return session;
  }

  /**
   * Handles output from a session's process.
   */
  private handleOutput(sessionId: string, stream: 'stdout' | 'stderr', data: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) return;

    // Buffer output (ring buffer behavior)
    managed.outputBuffer.push(data);

    // Calculate total buffer size
    let totalSize = managed.outputBuffer.reduce((acc, chunk) => acc + chunk.length, 0);

    // Trim from the beginning if exceeds buffer size
    while (totalSize > this.outputBufferSize && managed.outputBuffer.length > 1) {
      const removed = managed.outputBuffer.shift();
      if (removed) {
        totalSize -= removed.length;
      }
    }

    // Emit output event
    const outputEvent: SessionOutputEvent = {
      type: 'session:output',
      timestamp: new Date(),
      sessionId,
      stream,
      data,
    };
    this.emit('session:output', outputEvent);
  }

  /**
   * Terminates a session by killing its process.
   * @param sessionId - ID of the session to terminate
   */
  async terminate(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      return; // Session already gone or never existed
    }

    // Kill the process
    managed.process.kill('SIGTERM');

    // Wait a bit for graceful shutdown, then force kill if needed
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (managed.process.killed === false) {
          managed.process.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      managed.process.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /**
   * Gets a session by ID.
   * @param sessionId - ID of the session to retrieve
   * @returns The session or undefined if not found
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)?.session;
  }

  /**
   * Lists all active sessions.
   * @returns Array of all active sessions
   */
  listSessions(): Session[] {
    return [...this.sessions.values()].map((m) => m.session);
  }

  /**
   * Gets the buffered output for a session.
   * @param sessionId - ID of the session
   * @returns Array of output chunks or empty array if session not found
   */
  getOutput(sessionId: string): string[] {
    return this.sessions.get(sessionId)?.outputBuffer ?? [];
  }

  /**
   * Gets the number of available slots.
   */
  get availableSlotsCount(): number {
    return this.availableSlots.size;
  }
}
