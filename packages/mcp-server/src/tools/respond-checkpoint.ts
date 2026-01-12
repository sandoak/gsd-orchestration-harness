import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for gsd_respond_checkpoint tool parameters.
 */
const respondCheckpointSchema = {
  sessionId: z.string().describe('ID of the session to respond to'),
  response: z
    .string()
    .describe('Response text to send (e.g., "approved", "option-a", rejection details)'),
};

/**
 * Registers the gsd_respond_checkpoint tool with the MCP server.
 *
 * This tool sends a response to a checkpoint prompt in a GSD session.
 * The response is written to the CLI stdin. Use after detecting a checkpoint
 * with gsd_get_checkpoint.
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerRespondCheckpointTool(
  server: McpServer,
  manager: PersistentSessionManager
): void {
  server.tool(
    'gsd_respond_checkpoint',
    respondCheckpointSchema,
    async ({ sessionId, response }) => {
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

      // Check session is running
      if (session.status !== 'running' && session.status !== 'waiting_checkpoint') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Session ${sessionId} is not active (status: ${session.status})`,
              }),
            },
          ],
        };
      }

      // Send the response to stdin
      const sent = manager.sendInput(sessionId, response);

      if (!sent) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Failed to send response to session ${sessionId}. Session may not exist or stdin not writable.`,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sessionId,
              responseSent: response,
            }),
          },
        ],
      };
    }
  );
}
