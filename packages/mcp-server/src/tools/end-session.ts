import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for harness_end_session tool parameters.
 */
const endSessionSchema = {
  sessionId: z.string().describe('ID of the session to terminate'),
};

/**
 * Registers the harness_end_session tool with the MCP server.
 *
 * This tool terminates a running session by its ID.
 * Validates that the session exists and is in a running state.
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerEndSessionTool(server: McpServer, manager: PersistentSessionManager): void {
  server.tool('harness_end_session', endSessionSchema, async ({ sessionId }) => {
    try {
      // Get session to verify it exists
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

      // Check if session is already ended
      if (session.status === 'completed' || session.status === 'failed') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Session already ended with status: ${session.status}`,
                session: {
                  id: session.id,
                  status: session.status,
                  endedAt: session.endedAt,
                },
              }),
            },
          ],
        };
      }

      // Terminate the session
      await manager.terminate(sessionId);

      // Get updated session info
      const updatedSession = manager.getSession(sessionId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Session terminated successfully',
              session: {
                id: sessionId,
                status: updatedSession?.status ?? 'terminated',
                workingDir: session.workingDir,
                startedAt: session.startedAt,
                endedAt: updatedSession?.endedAt ?? new Date().toISOString(),
              },
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error terminating session';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to end session: ${errorMessage}`,
            }),
          },
        ],
      };
    }
  });
}
