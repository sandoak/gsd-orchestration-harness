import { setTimeout } from 'node:timers/promises';

import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for harness_worker_await tool parameters.
 */
const workerAwaitSchema = {
  sessionId: z.string().describe('ID of the session waiting for response'),
  messageId: z.string().describe('ID of the worker message to check for response'),
  timeoutMs: z
    .number()
    .optional()
    .describe('Optional timeout in milliseconds (default: 30000, max: 300000)'),
};

/**
 * Default timeout for waiting (30 seconds).
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maximum timeout allowed (5 minutes).
 */
const MAX_TIMEOUT_MS = 300000;

/**
 * Poll interval for checking responses.
 */
const POLL_INTERVAL_MS = 500;

/**
 * Registers the harness_worker_await tool with the MCP server.
 *
 * This tool allows workers to wait for a response from the orchestrator.
 * Workers should call this after reporting a checkpoint (verification_needed,
 * decision_needed, or action_needed) to block until the orchestrator responds.
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerWorkerAwaitTool(
  server: McpServer,
  manager: PersistentSessionManager
): void {
  server.tool(
    'harness_worker_await',
    workerAwaitSchema,
    async ({ sessionId, messageId, timeoutMs }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[mcp] harness_worker_await called - sessionId: ${sessionId}, messageId: ${messageId}`
      );

      // Verify session exists
      const session = manager.getSession(sessionId);
      if (!session) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Session not found: ${sessionId}`,
              }),
            },
          ],
        };
      }

      // Get the original message
      const workerMessage = manager.messageStore.getWorkerMessage(messageId);
      if (!workerMessage) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Message not found: ${messageId}`,
              }),
            },
          ],
        };
      }

      // Verify this message belongs to this session
      if (workerMessage.sessionId !== sessionId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Message ${messageId} does not belong to session ${sessionId}`,
              }),
            },
          ],
        };
      }

      // Calculate effective timeout
      const effectiveTimeout = Math.min(timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
      const startTime = Date.now();

      // Poll for response
      while (Date.now() - startTime < effectiveTimeout) {
        // Check if message has been responded to
        const currentMessage = manager.messageStore.getWorkerMessage(messageId);
        if (currentMessage && currentMessage.status === 'responded') {
          // Get the orchestrator response
          const orchestratorMessages =
            manager.messageStore.listOrchestratorMessagesBySession(sessionId);
          const response = orchestratorMessages.find((m) => m.inResponseTo === messageId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  responded: true,
                  response: response
                    ? {
                        id: response.id,
                        type: response.type,
                        payload: response.payload,
                        timestamp: response.timestamp,
                      }
                    : null,
                }),
              },
            ],
          };
        }

        // Check if message has expired
        if (currentMessage && currentMessage.status === 'expired') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'Message expired without response',
                  expired: true,
                }),
              },
            ],
          };
        }

        // Wait before polling again
        await setTimeout(POLL_INTERVAL_MS);
      }

      // Timeout reached
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Timeout waiting for response (${effectiveTimeout}ms)`,
              timedOut: true,
            }),
          },
        ],
      };
    }
  );
}
