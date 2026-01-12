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
}

/**
 * Recovers orphaned sessions that were "running" when the harness crashed.
 *
 * On startup, we query for sessions with status 'running' or 'waiting_checkpoint'.
 * For each:
 * - If the process doesn't exist anymore, mark as failed
 * - If the process exists, we still mark as failed because we can't reconnect
 *   to a running Claude CLI process (we've lost the stdin handle)
 *
 * This is the MVP approach. True reconnection to running Claude CLI processes
 * is not feasible as they run in interactive mode.
 *
 * @param sessionStore - The SessionStore instance to use
 * @returns Recovery result with counts and affected session IDs
 */
export function recoverOrphanedSessions(sessionStore: SessionStore): RecoveryResult {
  const runningSessions = sessionStore.findRunning();
  const markedFailed: string[] = [];

  for (const session of runningSessions) {
    // We mark as failed regardless of process state:
    // - If process exists: we can't reconnect (lost stdin handle)
    // - If process doesn't exist: it exited without our knowledge
    // MVP approach: mark failed, let user restart if needed

    sessionStore.update(session.id, {
      status: 'failed',
      endedAt: new Date(),
    });

    markedFailed.push(session.id);
  }

  return {
    orphanedCount: markedFailed.length,
    markedFailed,
  };
}
