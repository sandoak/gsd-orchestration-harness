import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for harness_send_input tool parameters.
 */
const sendInputSchema = {
  sessionId: z
    .string()
    .optional()
    .describe('ID of the session to send input to (provide either sessionId or slot)'),
  slot: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .describe('Slot number (0-3) of the session to send input to'),
  input: z
    .string()
    .describe(
      'Text to send to the session stdin. For menu selections use just the number (e.g., "2").'
    ),
  pressEnter: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Whether to press Enter after the input (default: true). Set false for raw character input.'
    ),
};

/**
 * Registers the harness_send_input tool with the MCP server.
 *
 * This tool sends arbitrary input to a running Harness session's stdin,
 * similar to a human typing into the terminal. Unlike respond_checkpoint,
 * this does NOT wait for a checkpoint - it sends input immediately.
 *
 * Use cases:
 * - Send information to a session that's processing (credentials, paths, etc.)
 * - Interrupt a session with guidance
 * - Provide context while a session is working
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerSendInputTool(server: McpServer, manager: PersistentSessionManager): void {
  server.tool(
    'harness_send_input',
    sendInputSchema,
    async ({ sessionId, slot, input, pressEnter }) => {
      console.log(
        `[mcp] harness_send_input called - sessionId: ${sessionId}, slot: ${slot}, input: ${input.substring(0, 50)}..., pressEnter: ${pressEnter}`
      );

      // Resolve session ID from slot if provided
      let resolvedSessionId = sessionId;

      if (slot !== undefined && !sessionId) {
        // Find session in the specified slot
        const sessions = manager.listSessions();
        const slotSession = sessions.find((s) => s.slot === slot);

        if (!slotSession) {
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
        resolvedSessionId = slotSession.id;
      }

      if (!resolvedSessionId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Must provide either sessionId or slot',
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

      // Check session is in a state that can receive input
      if (session.status !== 'running' && session.status !== 'waiting_checkpoint') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Session ${resolvedSessionId} cannot receive input (status: ${session.status})`,
              }),
            },
          ],
        };
      }

      // Send the input to stdin
      // By default (pressEnter=true), use sendInput which handles Enter key properly
      // With pressEnter=false, use sendRawInput for exact character input
      let sent: boolean;

      if (pressEnter === false) {
        // Raw input - no Enter key handling
        sent = manager.sendRawInput(resolvedSessionId, input);
      } else {
        // Smart input - handles Enter key, delays for menus, etc.
        sent = manager.sendInput(resolvedSessionId, input);
      }

      if (!sent) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Failed to send input to session ${resolvedSessionId}. Session may not exist or stdin not writable.`,
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
              sessionId: resolvedSessionId,
              slot: session.slot,
              inputSent: input,
              inputLength: input.length,
              pressEnter: pressEnter !== false,
            }),
          },
        ],
      };
    }
  );
}
