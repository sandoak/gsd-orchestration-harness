import type { WorkerMessageType } from '@gsd/core';
import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for harness_worker_report tool parameters.
 */
const workerReportSchema = {
  sessionId: z.string().describe('ID of the session reporting'),
  messageType: z
    .enum([
      'session_ready',
      'task_started',
      'progress_update',
      'verification_needed',
      'decision_needed',
      'action_needed',
      'task_completed',
      'task_failed',
    ])
    .describe('Type of message being reported'),
  payload: z.string().describe('JSON string containing message-specific payload'),
};

/**
 * Registers the harness_worker_report tool with the MCP server.
 *
 * This tool allows workers to report their status to the orchestrator.
 * It's part of the structured communication protocol that replaces output parsing.
 *
 * Message types:
 * - session_ready: Worker initialized and ready for task
 * - task_started: Worker began executing a task
 * - progress_update: Worker reporting progress
 * - verification_needed: Worker needs verification of completed work
 * - decision_needed: Worker needs a decision from orchestrator/user
 * - action_needed: Worker needs human action (rare)
 * - task_completed: Worker finished task successfully
 * - task_failed: Worker failed to complete task
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerWorkerReportTool(
  server: McpServer,
  manager: PersistentSessionManager
): void {
  server.tool(
    'harness_worker_report',
    workerReportSchema,
    async ({ sessionId, messageType, payload }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[mcp] harness_worker_report called - sessionId: ${sessionId}, type: ${messageType}`
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

      // Create the worker message
      try {
        const message = manager.messageStore.createWorkerMessage({
          sessionId,
          type: messageType as WorkerMessageType,
          payload: parsedPayload,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                messageId: message.id,
                messageType: message.type,
                timestamp: message.timestamp,
                requiresResponse: [
                  'verification_needed',
                  'decision_needed',
                  'action_needed',
                ].includes(messageType),
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
                error: error instanceof Error ? error.message : 'Unknown error creating message',
              }),
            },
          ],
        };
      }
    }
  );
}
