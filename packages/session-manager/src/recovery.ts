import type { SessionStore } from './db/session-store.js';

/**
 * Result of recovery operation.
 */
export interface RecoveryResult {
  /**
   * Number of orphaned sessions found.
   */
  orphanedCount: number;

  /**
   * Session IDs that were marked as failed.
   */
  markedFailed: string[];

  /**
   * PIDs that were killed.
   */
  killedPids: number[];
}

/**
 * Checks if a process with the given PID is still running.
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts to kill a process by PID.
 * Returns true if killed or already dead, false if kill failed.
 */
function killProcess(pid: number): boolean {
  try {
    // First try SIGTERM for graceful shutdown
    process.kill(pid, 'SIGTERM');

    // Give it a moment to terminate
    // Note: This is synchronous but quick
    const startTime = Date.now();
    while (Date.now() - startTime < 1000) {
      if (!isProcessRunning(pid)) {
        return true;
      }
    }

    // Force kill if still running
    if (isProcessRunning(pid)) {
      process.kill(pid, 'SIGKILL');
    }

    return true;
  } catch {
    // Process may already be dead or we don't have permission
    return !isProcessRunning(pid);
  }
}

/**
 * Recovers orphaned sessions that were "running" when the harness crashed.
 *
 * On startup, we query for sessions with status 'running' or 'waiting_checkpoint'.
 * For each:
 * - If the process exists, kill it (we can't reconnect to running Claude CLI)
 * - Mark the session as failed
 *
 * This prevents orphaned Claude CLI processes from consuming resources.
 *
 * @param sessionStore - The SessionStore instance to use
 * @returns Recovery result with counts and affected session IDs
 */
export function recoverOrphanedSessions(sessionStore: SessionStore): RecoveryResult {
  const runningSessions = sessionStore.findRunning();
  const markedFailed: string[] = [];
  const killedPids: number[] = [];

  for (const session of runningSessions) {
    // Try to kill the orphaned process if PID is known
    if (session.pid) {
      if (isProcessRunning(session.pid)) {
        if (killProcess(session.pid)) {
          killedPids.push(session.pid);
        }
      }
    }

    // Mark session as failed - we can't reconnect even if process is running
    sessionStore.update(session.id, {
      status: 'failed',
      endedAt: new Date(),
    });

    markedFailed.push(session.id);
  }

  return {
    orphanedCount: markedFailed.length,
    markedFailed,
    killedPids,
  };
}
