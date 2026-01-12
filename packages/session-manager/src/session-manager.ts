import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { setTimeout, clearTimeout, setInterval, clearInterval } from 'node:timers';

import type {
  Session,
  SessionStatus,
  SessionStartedEvent,
  SessionOutputEvent,
  SessionCompletedEvent,
  SessionFailedEvent,
} from '@gsd/core';
import { MAX_SESSIONS, SESSION_SLOTS, DEFAULT_OUTPUT_BUFFER_SIZE } from '@gsd/core';
import * as pty from 'node-pty';

type SlotNumber = (typeof SESSION_SLOTS)[number];

interface ManagedSession {
  session: Session;
  process: pty.IPty;
  outputBuffer: string[];
  lastPolledAt: Date;
}

interface SessionManagerEvents {
  'session:started': [event: SessionStartedEvent];
  'session:output': [event: SessionOutputEvent];
  'session:completed': [event: SessionCompletedEvent];
  'session:failed': [event: SessionFailedEvent];
}

/**
 * Determines the Claude CLI executable based on environment.
 * - CLAUDE_EXECUTABLE env var takes priority
 * - Falls back to 'claude' (default)
 *
 * For different accounts:
 * - sandoakholdings@gmail.com → claude
 * - chrisb@macconstruction.com → claude-overflow
 */
function getDefaultExecutable(): string {
  return process.env.CLAUDE_EXECUTABLE ?? 'claude';
}

export interface SessionManagerOptions {
  outputBufferSize?: number;
  /**
   * Executable to spawn. Defaults to CLAUDE_EXECUTABLE env var or 'claude'.
   * Can be overridden for testing with simple shell commands.
   */
  executable?: string;
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
  private executable: string;
  private spawnLock: boolean = false;

  constructor(options?: SessionManagerOptions) {
    super();
    this.outputBufferSize = options?.outputBufferSize ?? DEFAULT_OUTPUT_BUFFER_SIZE;
    this.executable = options?.executable ?? getDefaultExecutable();
  }

  /**
   * Spawns a new Claude CLI session.
   * @param workingDir - Working directory for the Claude process
   * @param command - Optional command to pass to Claude
   * @returns The created session
   * @throws Error if all slots are occupied or spawn is in progress
   */
  async spawn(workingDir: string, command?: string): Promise<Session> {
    // Prevent concurrent spawn operations to avoid race conditions
    if (this.spawnLock) {
      throw new Error('Spawn operation already in progress. Please wait and retry.');
    }
    this.spawnLock = true;

    try {
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
      // Include --dangerously-skip-permissions for Claude CLI autonomous operation
      const args: string[] = [];
      const isClaudeCli = this.executable === 'claude' || this.executable === 'claude-overflow';
      if (isClaudeCli) {
        args.push('--dangerously-skip-permissions');
      }
      if (commandToRun) {
        // Parse command arguments - handle shell-style -c commands and quoted args
        const parsedArgs = this.parseCommandArgs(commandToRun);
        args.push(...parsedArgs);
      }

      // Spawn the process using PTY for proper terminal emulation
      // This is required for Claude CLI which needs a terminal
      const ptyProcess = pty.spawn(this.executable, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: workingDir,
        env: process.env as Record<string, string>,
      });

      // Create session object
      const session: Session = {
        id: sessionId,
        slot,
        status: 'running' as SessionStatus,
        workingDir,
        currentCommand: commandToRun || undefined,
        startedAt: new Date(),
        pid: ptyProcess.pid,
      };

      // Create managed session
      const managedSession: ManagedSession = {
        session,
        process: ptyProcess,
        outputBuffer: [],
        lastPolledAt: new Date(),
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

      // Attach PTY data handler (combines stdout and stderr in PTY)
      ptyProcess.onData((data: string) => {
        this.handleOutput(sessionId, 'stdout', data);
      });

      // Attach PTY exit handler
      ptyProcess.onExit(({ exitCode, signal }) => {
        const managed = this.sessions.get(sessionId);
        if (!managed) return;

        managed.session.status = exitCode === 0 ? 'completed' : 'failed';
        managed.session.endedAt = new Date();

        // Free the slot
        this.availableSlots.add(slot);

        if (exitCode === 0) {
          const completedEvent: SessionCompletedEvent = {
            type: 'session:completed',
            timestamp: new Date(),
            sessionId,
            exitCode,
          };
          this.emit('session:completed', completedEvent);
        } else {
          const failedEvent: SessionFailedEvent = {
            type: 'session:failed',
            timestamp: new Date(),
            sessionId,
            error: signal
              ? `Process killed with signal ${signal}`
              : `Process exited with code ${exitCode}`,
          };
          this.emit('session:failed', failedEvent);
        }

        // Remove from active sessions after emitting events
        this.sessions.delete(sessionId);
      });

      return session;
    } finally {
      this.spawnLock = false;
    }
  }

  /**
   * Parses a command string into an array of arguments.
   * Handles quoted strings and shell-style -c commands.
   */
  private parseCommandArgs(command: string): string[] {
    // Handle bash-style -c "command" by splitting -c and the rest
    const bashMatch = command.match(/^(-c)\s+["']?(.+?)["']?$/);
    if (bashMatch && bashMatch[1] && bashMatch[2]) {
      return [bashMatch[1], bashMatch[2]];
    }

    // For other commands, split on whitespace but preserve quoted strings
    const args: string[] = [];
    let current = '';
    let inQuote: string | null = null;

    for (const char of command) {
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = char;
      } else if (char === inQuote) {
        inQuote = null;
      } else if (char === ' ' && !inQuote) {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    if (current) {
      args.push(current);
    }

    return args;
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

    // Kill the PTY process - this sends SIGHUP to the process group
    managed.process.kill();

    // Wait for the exit event or timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 5000);

      // The onExit handler was already registered in spawn()
      // Just wait for the timeout or for the session to be removed
      const checkRemoved = setInterval(() => {
        if (!this.sessions.has(sessionId)) {
          clearInterval(checkRemoved);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
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
   * Also updates lastPolledAt timestamp for timeout tracking.
   * @param sessionId - ID of the session
   * @returns Array of output chunks or empty array if session not found
   */
  getOutput(sessionId: string): string[] {
    const managed = this.sessions.get(sessionId);
    if (managed) {
      managed.lastPolledAt = new Date();
    }
    return managed?.outputBuffer ?? [];
  }

  /**
   * Gets the last polled timestamp for a session.
   * @param sessionId - ID of the session
   * @returns Last polled date or undefined if session not found
   */
  getLastPolledAt(sessionId: string): Date | undefined {
    return this.sessions.get(sessionId)?.lastPolledAt;
  }

  /**
   * Finds sessions that haven't been polled within the timeout period.
   * @param timeoutMs - Timeout in milliseconds (default: 10 minutes)
   * @returns Array of session IDs that are stale
   */
  findStaleSessions(timeoutMs: number = 10 * 60 * 1000): string[] {
    const now = Date.now();
    const stale: string[] = [];

    for (const [sessionId, managed] of this.sessions) {
      const elapsed = now - managed.lastPolledAt.getTime();
      if (elapsed > timeoutMs) {
        stale.push(sessionId);
      }
    }

    return stale;
  }

  /**
   * Gets the number of available slots.
   */
  get availableSlotsCount(): number {
    return this.availableSlots.size;
  }

  /**
   * Sends input to a session's stdin.
   * Used to relay checkpoint responses from orchestrator to CLI.
   * @param sessionId - ID of the session
   * @param input - Text to write to stdin (will append newline)
   * @returns true if sent, false if session not found
   */
  sendInput(sessionId: string, input: string): boolean {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      return false;
    }
    managed.process.write(input + '\n');
    return true;
  }
}
