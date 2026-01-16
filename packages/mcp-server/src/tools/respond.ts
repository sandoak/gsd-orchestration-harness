import type { OrchestratorMessageType } from '@gsd/core';
import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for harness_respond tool parameters.
 */
const respondSchema = {
  sessionId: z.string().describe('ID of the session to respond to'),
  workerMessageId: z.string().describe('ID of the worker message being responded to'),
  responseType: z
    .enum(['verification_result', 'decision_made', 'action_completed', 'abort_task'])
    .describe('Type of response'),
  payload: z.string().describe('JSON string containing response-specific payload'),
};

/**
 * Registers the harness_respond tool with the MCP server.
 *
 * This tool allows the orchestrator to respond to worker messages.
 * It's used to provide verification results, decisions, or abort signals.
 *
 * Response types:
 * - verification_result: Result of verification request (verified: boolean)
 * - decision_made: Decision made by user/orchestrator (selectedOptionId)
 * - action_completed: Human action has been completed
 * - abort_task: Abort current task
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerRespondTool(server: McpServer, manager: PersistentSessionManager): void {
  server.tool(
    'harness_respond',
    respondSchema,
    async ({ sessionId, workerMessageId, responseType, payload }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[mcp] harness_respond called - sessionId: ${sessionId}, workerMessageId: ${workerMessageId}, type: ${responseType}`
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

      // Get the worker message
      const workerMessage = manager.messageStore.getWorkerMessage(workerMessageId);
      if (!workerMessage) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Worker message not found: ${workerMessageId}`,
              }),
            },
          ],
        };
      }

      // Verify message belongs to this session
      if (workerMessage.sessionId !== sessionId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Message ${workerMessageId} does not belong to session ${sessionId}`,
              }),
            },
          ],
        };
      }

      // Check if already responded
      if (workerMessage.status === 'responded') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Message ${workerMessageId} has already been responded to`,
              }),
            },
          ],
        };
      }

      // Parse the payload
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Invalid JSON in payload',
              }),
            },
          ],
        };
      }

      // Validate response type matches the worker message type
      const validResponses: Record<string, string[]> = {
        verification_needed: ['verification_result', 'abort_task'],
        decision_needed: ['decision_made', 'abort_task'],
        action_needed: ['action_completed', 'abort_task'],
      };

      const allowedResponses = validResponses[workerMessage.type];
      if (allowedResponses && !allowedResponses.includes(responseType)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Invalid response type '${responseType}' for message type '${workerMessage.type}'. Allowed: ${allowedResponses.join(', ')}`,
              }),
            },
          ],
        };
      }

      // Create the orchestrator response
      try {
        const response = manager.messageStore.respondToCheckpoint(workerMessageId, {
          sessionId,
          type: responseType as OrchestratorMessageType,
          payload: parsedPayload,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                responseId: response.id,
                responseType: response.type,
                timestamp: response.timestamp,
                workerMessageId,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error creating response',
              }),
            },
          ],
        };
      }
    }
  );
}
