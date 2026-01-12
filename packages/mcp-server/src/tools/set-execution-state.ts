import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { setHighestExecutedPhase, getHighestExecutedPhase } from './start-session.js';

/**
 * Schema for gsd_set_execution_state tool parameters.
 */
const setExecutionStateSchema = {
  highestExecutedPhase: z
    .number()
    .int()
    .min(0)
    .describe('The highest phase number that has been fully executed'),
};

/**
 * Registers the gsd_set_execution_state tool with the MCP server.
 *
 * This tool allows the orchestrator to initialize the harness with the current
 * execution state after reading ROADMAP.md and STATE.md. This ensures the
 * planning limits are enforced correctly even after harness restarts.
 *
 * @param server - The MCP server instance
 */
export function registerSetExecutionStateTool(server: McpServer): void {
  server.tool(
    'gsd_set_execution_state',
    setExecutionStateSchema,
    async ({ highestExecutedPhase }) => {
      console.log(
        `[mcp] gsd_set_execution_state called - highestExecutedPhase: ${highestExecutedPhase}`
      );

      const previousPhase = getHighestExecutedPhase();
      setHighestExecutedPhase(highestExecutedPhase);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              previousHighestExecutedPhase: previousPhase,
              newHighestExecutedPhase: highestExecutedPhase,
              message: `Execution state updated. Planning limited to phase ${highestExecutedPhase + 2} until more phases are executed.`,
            }),
          },
        ],
      };
    }
  );
}
