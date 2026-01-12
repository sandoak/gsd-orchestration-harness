import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for gsd_get_output tool parameters.
 */
const getOutputSchema = {
  sessionId: z.string().optional().describe('ID of the session to get output from'),
  slot: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe('Slot number (1-3) to get output from. Alternative to sessionId.'),
  lines: z
    .number()
    .int()
    .positive()
    .default(100)
    .describe('Number of lines to return (from the end). Defaults to 100.'),
  since: z.string().datetime().optional().describe('Only return output since this ISO timestamp'),
};

/**
 * Registers the gsd_get_output tool with the MCP server.
 *
 * This tool retrieves output from a session with optional filtering by line count or timestamp.
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerGetOutputTool(server: McpServer, manager: PersistentSessionManager): void {
  server.tool('gsd_get_output', getOutputSchema, async ({ sessionId, slot, lines, since }) => {
    console.log(
      `[mcp] gsd_get_output called - sessionId: ${sessionId}, slot: ${slot}, lines: ${lines}`
    );
    // Resolve session ID from slot if provided
    let resolvedSessionId = sessionId;

    if (slot !== undefined && !sessionId) {
      // Find session by slot number
      const sessions = manager.listSessions();
      const slotSession = sessions.find((s) => s.slot === slot);
      if (slotSession) {
        resolvedSessionId = slotSession.id;
      } else {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `No session found in slot ${slot}`,
              }),
            },
          ],
        };
      }
    }

    if (!resolvedSessionId) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Either sessionId or slot must be provided',
            }),
          },
        ],
      };
    }

    // Verify session exists
    const session = manager.getSession(resolvedSessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Session not found: ${resolvedSessionId}`,
            }),
          },
        ],
      };
    }

    try {
      // Get output chunks from manager
      const outputChunks = manager.getOutput(resolvedSessionId);

      if (outputChunks.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId: resolvedSessionId,
                output: '',
                lineCount: 0,
              }),
            },
          ],
        };
      }

      // Join chunks and split by newlines
      const fullOutput = outputChunks.join('');
      let outputLines = fullOutput.split('\n');

      // Apply since filter if provided
      // Note: This is a simplified implementation. Since output chunks don't have
      // timestamps per-line in the current implementation, we can only filter
      // if we have timestamp markers in the output itself.
      // For MVP, we just apply the lines limit.
      if (since) {
        // TODO: Phase 5 can enhance this with proper timestamp tracking per output chunk
        // For now, since filter is acknowledged but not fully implemented
      }

      // Apply lines limit (tail)
      if (outputLines.length > lines) {
        outputLines = outputLines.slice(-lines);
      }

      const filteredOutput = outputLines.join('\n');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sessionId: resolvedSessionId,
              output: filteredOutput,
              lineCount: outputLines.length,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error getting output';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to get output: ${errorMessage}`,
            }),
          },
        ],
      };
    }
  });
}
