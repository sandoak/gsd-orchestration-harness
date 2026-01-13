import type { OrchestrationStore } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { setHighestExecutedPhase } from './start-session.js';

/**
 * Schema for gsd_set_execution_state tool parameters.
 */
const setExecutionStateSchema = {
  projectPath: z.string().describe('Path to the project'),
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
 * @param orchestrationStore - The orchestration store for database updates
 */
export function registerSetExecutionStateTool(
  server: McpServer,
  orchestrationStore: OrchestrationStore
): void {
  server.tool(
    'gsd_set_execution_state',
    setExecutionStateSchema,
    async ({ projectPath, highestExecutedPhase }) => {
      console.log(
        `[mcp] gsd_set_execution_state called - projectPath: ${projectPath}, highestExecutedPhase: ${highestExecutedPhase}`
      );

      // Get previous state from database
      const previousState = orchestrationStore.getState(projectPath);
      const previousPhase = previousState.highestExecutedPhase;

      // Update in-memory state (legacy compatibility)
      setHighestExecutedPhase(highestExecutedPhase);

      // Update database state (this is what canStartPlan actually reads)
      orchestrationStore.updateState(projectPath, { highestExecutedPhase });

      console.log(
        `[mcp] highestExecutedPhase updated: ${previousPhase} -> ${highestExecutedPhase} (in DB and memory)`
      );

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
