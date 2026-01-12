import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for gsd_start_session tool parameters.
 */
const startSessionSchema = {
  workingDir: z.string().describe('Path to the project working directory'),
  command: z.string().optional().describe('Optional command to pass to Claude'),
};

/**
 * Registers the gsd_start_session tool with the MCP server.
 *
 * This tool starts a new Claude CLI session in the specified working directory.
 * It checks for available slots before spawning.
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerStartSessionTool(
  server: McpServer,
  manager: PersistentSessionManager
): void {
  server.tool('gsd_start_session', startSessionSchema, async ({ workingDir, command }) => {
    // Check for available slots
    if (manager.availableSlotsCount === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error:
                'No available session slots. Maximum 3 concurrent sessions allowed. Terminate an existing session first.',
            }),
          },
        ],
      };
    }

    try {
      // Spawn the session
      const session = await manager.spawn(workingDir, command);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              session: {
                id: session.id,
                slot: session.slot,
                status: session.status,
                workingDir: session.workingDir,
                currentCommand: session.currentCommand,
                startedAt: session.startedAt,
              },
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error spawning session';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to start session: ${errorMessage}`,
            }),
          },
        ],
      };
    }
  });
}
