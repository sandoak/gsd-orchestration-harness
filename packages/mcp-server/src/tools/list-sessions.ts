import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for harness_list_sessions tool parameters.
 */
const listSessionsSchema = {
  filter: z
    .enum(['all', 'running', 'completed', 'failed'])
    .default('all')
    .describe('Filter sessions by status'),
};

/**
 * Registers the harness_list_sessions tool with the MCP server.
 *
 * This tool lists all sessions with optional status filtering.
 * Returns session details and available slot count.
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerListSessionsTool(
  server: McpServer,
  manager: PersistentSessionManager
): void {
  server.tool('harness_list_sessions', listSessionsSchema, async ({ filter }) => {
    console.log(`[mcp] harness_list_sessions called - filter: ${filter}`);
    try {
      let sessions = manager.listSessions();

      // Apply filter if not 'all'
      if (filter !== 'all') {
        sessions = sessions.filter((session) => session.status === filter);
      }

      // Map sessions to response format
      const sessionList = sessions.map((session) => ({
        id: session.id,
        slot: session.slot,
        status: session.status,
        workingDir: session.workingDir,
        currentCommand: session.currentCommand,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sessions: sessionList,
              count: sessionList.length,
              availableSlots: manager.availableSlotsCount,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error listing sessions';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to list sessions: ${errorMessage}`,
            }),
          },
        ],
      };
    }
  });
}
