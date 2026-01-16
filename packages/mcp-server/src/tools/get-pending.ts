import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for harness_get_pending tool parameters.
 */
const getPendingSchema = {
  sessionId: z
    .string()
    .optional()
    .describe('Optional session ID to filter by. If not provided, returns all pending messages.'),
  messageTypes: z
    .array(
      z.enum([
        'session_ready',
        'task_started',
        'progress_update',
        'verification_needed',
        'decision_needed',
        'action_needed',
        'task_completed',
        'task_failed',
      ])
    )
    .optional()
    .describe('Optional filter by message types'),
};

/**
 * Registers the harness_get_pending tool with the MCP server.
 *
 * This tool allows the orchestrator to retrieve pending worker messages
 * that require a response (verification_needed, decision_needed, action_needed)
 * or simply to check worker status (progress_update, task_completed, etc.).
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerGetPendingTool(server: McpServer, manager: PersistentSessionManager): void {
  server.tool('harness_get_pending', getPendingSchema, async ({ sessionId, messageTypes }) => {
    // eslint-disable-next-line no-console
    console.log(
      `[mcp] harness_get_pending called - sessionId: ${sessionId ?? 'all'}, types: ${messageTypes?.join(', ') ?? 'all'}`
    );

    // Get pending messages
    let pendingMessages = sessionId
      ? manager.messageStore.listPendingBySession(sessionId)
      : manager.messageStore.listPendingWorkerMessages();

    // Filter by message types if specified
    if (messageTypes && messageTypes.length > 0) {
      pendingMessages = pendingMessages.filter((msg) => messageTypes.includes(msg.type));
    }

    // Identify which messages require responses
    const requiresResponse = ['verification_needed', 'decision_needed', 'action_needed'];

    // Format the response
    const messages = pendingMessages.map((msg) => ({
      id: msg.id,
      sessionId: msg.sessionId,
      type: msg.type,
      payload: msg.payload,
      timestamp: msg.timestamp,
      requiresResponse: requiresResponse.includes(msg.type),
    }));

    // Separate by urgency
    const checkpoints = messages.filter((m) => m.requiresResponse);
    const statusUpdates = messages.filter((m) => !m.requiresResponse);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            totalPending: messages.length,
            checkpointCount: checkpoints.length,
            statusUpdateCount: statusUpdates.length,
            checkpoints,
            statusUpdates,
          }),
        },
      ],
    };
  });
}
