import type { CheckpointType } from '@gsd/core';
import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for harness_signal_checkpoint tool parameters.
 */
const signalCheckpointSchema = {
  sessionId: z.string().describe('ID of the session signaling the checkpoint'),
  type: z
    .enum(['completion', 'human-verify', 'decision', 'human-action', 'error'])
    .describe('Type of checkpoint being signaled'),
  workflow: z
    .string()
    .optional()
    .describe('Name of the workflow that completed (e.g., "plan-phase", "execute-phase")'),
  phase: z.number().optional().describe('Phase number if applicable'),
  summary: z.string().describe('Human-readable summary of the checkpoint'),
  nextCommand: z
    .string()
    .optional()
    .describe('Suggested next command for the orchestrator (e.g., "/harness:execute-phase 1")'),
  data: z
    .string()
    .optional()
    .describe('Optional JSON string with additional checkpoint-specific data'),
};

/**
 * Registers the harness_signal_checkpoint tool with the MCP server.
 *
 * This tool allows sessions to explicitly signal checkpoints to the orchestrator.
 * Unlike pattern-based detection, this creates a direct communication channel
 * for workflow state transitions.
 *
 * Checkpoint types:
 * - completion: A workflow phase completed successfully
 * - human-verify: Need user verification of work done
 * - decision: Need orchestrator/user to make a choice
 * - human-action: Need human to perform an action
 * - error: An error occurred that needs attention
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerSignalCheckpointTool(
  server: McpServer,
  manager: PersistentSessionManager
): void {
  server.tool(
    'harness_signal_checkpoint',
    signalCheckpointSchema,
    async ({ sessionId, type, workflow, phase, summary, nextCommand, data }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[mcp] harness_signal_checkpoint called - sessionId: ${sessionId}, type: ${type}, workflow: ${workflow ?? 'none'}`
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

      // Parse optional data payload
      let parsedData: Record<string, unknown> | undefined;
      if (data) {
        try {
          parsedData = JSON.parse(data);
        } catch {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'Invalid JSON in data field',
                }),
              },
            ],
          };
        }
      }

      // Create the checkpoint in the database
      try {
        const checkpointId = manager.checkpointStore.create({
          sessionId,
          type: type as CheckpointType | 'error',
          workflow,
          phase,
          summary,
          nextCommand,
          data: parsedData,
        });

        // Update session status to waiting_checkpoint
        manager.updateSessionStatus(sessionId, 'waiting_checkpoint');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                checkpointId,
                type,
                workflow,
                phase,
                summary,
                nextCommand,
                message: 'Checkpoint signaled successfully. Orchestrator will be notified.',
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
                error: error instanceof Error ? error.message : 'Unknown error creating checkpoint',
              }),
            },
          ],
        };
      }
    }
  );
}
