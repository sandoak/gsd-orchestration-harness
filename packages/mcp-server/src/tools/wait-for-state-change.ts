import type { SessionCompletedEvent, SessionFailedEvent, SessionWaitingEvent } from '@gsd/core';
import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for gsd_wait_for_state_change tool parameters.
 */
const waitForStateChangeSchema = {
  timeout: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .default(30000)
    .describe('Maximum time to wait in milliseconds (1-300 seconds, default 30s)'),
  sessionIds: z
    .array(z.string().uuid())
    .optional()
    .describe('Optional list of session IDs to watch. If empty, watches all running sessions.'),
};

/**
 * State change event types
 */
type StateChangeEvent =
  | { type: 'completed'; sessionId: string; event: SessionCompletedEvent }
  | { type: 'failed'; sessionId: string; event: SessionFailedEvent }
  | { type: 'waiting'; sessionId: string; event: SessionWaitingEvent }
  | { type: 'timeout'; watchedSessions: string[] };

/**
 * Registers the gsd_wait_for_state_change tool with the MCP server.
 *
 * This tool blocks until a session state changes (completed/failed/waiting) or timeout.
 * Much more efficient than polling - orchestrator calls once and waits.
 * Detects wait states via PTY output parsing: menus, prompts, permission requests.
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerWaitForStateChangeTool(
  server: McpServer,
  manager: PersistentSessionManager
): void {
  server.tool(
    'gsd_wait_for_state_change',
    waitForStateChangeSchema,
    async ({ timeout, sessionIds }) => {
      console.log(
        `[mcp] gsd_wait_for_state_change called - timeout: ${timeout}, sessionIds: ${sessionIds?.join(',') || 'all'}`
      );
      try {
        // Determine which sessions to watch
        let watchedSessionIds: string[];

        if (sessionIds && sessionIds.length > 0) {
          // Watch specific sessions
          watchedSessionIds = sessionIds;
        } else {
          // Watch all currently running sessions
          const runningSessions = manager.listSessions().filter((s) => s.status === 'running');
          watchedSessionIds = runningSessions.map((s) => s.id);
        }

        // If no sessions to watch, return immediately
        if (watchedSessionIds.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  change: null,
                  message: 'No running sessions to watch',
                  runningSessions: [],
                }),
              },
            ],
          };
        }

        // Wait for state change or timeout
        const result = await waitForChange(manager, watchedSessionIds, timeout);

        console.log(
          `[mcp] gsd_wait_for_state_change resolved - type: ${result.type}, sessionId: ${result.type !== 'timeout' ? result.sessionId : 'N/A'}`
        );

        if (result.type === 'timeout') {
          // Get current status of watched sessions
          const currentStatus = watchedSessionIds.map((id) => {
            const session = manager.getSession(id);
            return session
              ? { id, status: session.status, slot: session.slot }
              : { id, status: 'not_found' as const };
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  change: null,
                  message: `No state changes within ${timeout}ms`,
                  watchedSessions: currentStatus,
                }),
              },
            ],
          };
        }

        // A session changed state
        const changedSession = manager.getSession(result.sessionId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                change: {
                  type: result.type,
                  sessionId: result.sessionId,
                  slot: changedSession?.slot,
                  timestamp: result.event.timestamp,
                  ...(result.type === 'completed' && {
                    exitCode: result.event.exitCode,
                  }),
                  ...(result.type === 'failed' && {
                    error: result.event.error,
                  }),
                  ...(result.type === 'waiting' && {
                    waitType: result.event.waitType,
                    menuOptions: result.event.menuOptions,
                    trigger: result.event.trigger,
                  }),
                },
                session: changedSession
                  ? {
                      id: changedSession.id,
                      slot: changedSession.slot,
                      status: changedSession.status,
                      workingDir: changedSession.workingDir,
                      currentCommand: changedSession.currentCommand,
                      startedAt: changedSession.startedAt,
                      endedAt: changedSession.endedAt,
                    }
                  : null,
              }),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error waiting for state change';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Failed to wait for state change: ${errorMessage}`,
              }),
            },
          ],
        };
      }
    }
  );
}

/**
 * Waits for a state change event on any of the watched sessions.
 * Returns when a session completes/fails/enters wait state or when timeout is reached.
 *
 * IMPORTANT: Checks for already-waiting sessions FIRST to avoid missing events
 * that fired while handling previous responses.
 */
function waitForChange(
  manager: PersistentSessionManager,
  sessionIds: string[],
  timeoutMs: number
): Promise<StateChangeEvent> {
  return new Promise((resolve) => {
    const sessionIdSet = new Set(sessionIds);
    let resolved = false;

    // CRITICAL: Check for already-waiting sessions BEFORE setting up listeners
    // This catches sessions that entered wait state while we were handling other responses
    for (const sessionId of sessionIds) {
      const waitState = manager.getSessionWaitState(sessionId);
      if (waitState) {
        console.log(
          `[wait-for-state-change] Session ${sessionId} already in wait state: ${waitState.waitType}`
        );
        resolve({
          type: 'waiting',
          sessionId,
          event: {
            type: 'session:waiting',
            timestamp: new Date(),
            sessionId,
            waitType: waitState.waitType,
            trigger: waitState.trigger,
          },
        });
        return;
      }
    }

    // Check if any watched sessions have already completed/failed
    for (const sessionId of sessionIds) {
      const session = manager.getSession(sessionId);
      if (session && (session.status === 'completed' || session.status === 'failed')) {
        // Simulate the event for already-completed sessions
        if (session.status === 'completed') {
          resolve({
            type: 'completed',
            sessionId,
            event: {
              type: 'session:completed',
              timestamp: session.endedAt || new Date(),
              sessionId,
              exitCode: 0,
            },
          });
        } else {
          resolve({
            type: 'failed',
            sessionId,
            event: {
              type: 'session:failed',
              timestamp: session.endedAt || new Date(),
              sessionId,
              error: 'Session failed',
            },
          });
        }
        return;
      }
    }

    // Set up event listeners for NEW state changes
    const onCompleted = (event: SessionCompletedEvent): void => {
      if (resolved) return;
      if (sessionIdSet.has(event.sessionId)) {
        resolved = true;
        cleanup();
        resolve({ type: 'completed', sessionId: event.sessionId, event });
      }
    };

    const onFailed = (event: SessionFailedEvent): void => {
      if (resolved) return;
      if (sessionIdSet.has(event.sessionId)) {
        resolved = true;
        cleanup();
        resolve({ type: 'failed', sessionId: event.sessionId, event });
      }
    };

    const onWaiting = (event: SessionWaitingEvent): void => {
      if (resolved) return;
      if (sessionIdSet.has(event.sessionId)) {
        resolved = true;
        cleanup();
        resolve({ type: 'waiting', sessionId: event.sessionId, event });
      }
    };

    // Set up timeout
    const timeoutHandle = globalThis.setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({ type: 'timeout', watchedSessions: sessionIds });
    }, timeoutMs);

    // Cleanup function to remove listeners
    const cleanup = (): void => {
      globalThis.clearTimeout(timeoutHandle);
      manager.removeListener('session:completed', onCompleted);
      manager.removeListener('session:failed', onFailed);
      manager.removeListener('session:waiting', onWaiting);
    };

    // Attach listeners
    manager.on('session:completed', onCompleted);
    manager.on('session:failed', onFailed);
    manager.on('session:waiting', onWaiting);
  });
}
