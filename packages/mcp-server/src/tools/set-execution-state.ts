import type { OrchestrationStore } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { setHighestExecutedPhase } from './start-session.js';

/**
 * Schema for harness_set_execution_state tool parameters.
 */
const setExecutionStateSchema = {
  projectPath: z.string().describe('Path to the project'),
  highestExecutedPhase: z
    .number()
    .int()
    .min(0)
    .describe('The highest phase number that has been fully executed'),
  // Plan-level tracking (optional for backwards compatibility)
  highestExecutingPhase: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Phase of currently executing plan (e.g., 5 for 05-01)'),
  highestExecutingPlan: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Plan number within phase (e.g., 1 for 05-01)'),
  // Reset flag for reconciliation
  forceReset: z
    .boolean()
    .optional()
    .describe('If true, clear all project state and reinitialize from scratch'),
};

/**
 * Registers the harness_set_execution_state tool with the MCP server.
 *
 * This tool allows the orchestrator to initialize/reconcile the harness with
 * the current execution state after reading ROADMAP.md and STATE.md.
 *
 * IMPORTANT: The orchestrator is the source of truth. This tool ALWAYS overwrites
 * the database state with the provided values (not just updates if higher).
 * This ensures state reconciliation works correctly after orchestrator restarts.
 *
 * @param server - The MCP server instance
 * @param orchestrationStore - The orchestration store for database updates
 */
export function registerSetExecutionStateTool(
  server: McpServer,
  orchestrationStore: OrchestrationStore
): void {
  server.tool(
    'harness_set_execution_state',
    setExecutionStateSchema,
    async ({
      projectPath,
      highestExecutedPhase,
      highestExecutingPhase,
      highestExecutingPlan,
      forceReset,
    }) => {
      console.log(
        `[mcp] harness_set_execution_state called - projectPath: ${projectPath}, ` +
          `highestExecutedPhase: ${highestExecutedPhase}, ` +
          `highestExecutingPhase: ${highestExecutingPhase ?? 'not set'}, ` +
          `highestExecutingPlan: ${highestExecutingPlan ?? 'not set'}, ` +
          `forceReset: ${forceReset ?? false}`
      );

      // Get previous state from database for comparison
      const previousState = orchestrationStore.getState(projectPath);

      // If forceReset, clear all project state first
      if (forceReset) {
        orchestrationStore.clearProject(projectPath);
        // Ensure a new row exists (getState creates one if missing)
        orchestrationStore.getState(projectPath);
        console.log(`[mcp] Force reset: cleared all state for ${projectPath}`);
      }

      // Build state diff for logging/warnings
      const stateDiff = {
        highestExecutedPhase: {
          old: previousState.highestExecutedPhase,
          new: highestExecutedPhase,
          change: highestExecutedPhase - previousState.highestExecutedPhase,
        },
        highestExecutingPhase: {
          old: previousState.highestExecutingPhase,
          new: highestExecutingPhase ?? highestExecutedPhase,
        },
        highestExecutingPlan: {
          old: previousState.highestExecutingPlan,
          new: highestExecutingPlan ?? 1,
        },
      };

      // Log warning if there's a significant downgrade (possible stale state issue)
      if (stateDiff.highestExecutedPhase.change < -2) {
        console.warn(
          `[mcp] WARNING: Large state downgrade detected! ` +
            `DB had Phase ${previousState.highestExecutedPhase}, ` +
            `orchestrator says Phase ${highestExecutedPhase}. ` +
            `This may indicate stale harness state or orchestrator error.`
        );
      }

      // Update in-memory state (legacy compatibility)
      setHighestExecutedPhase(highestExecutedPhase);

      // Update database state - ALWAYS overwrite with orchestrator's values
      // The orchestrator is the source of truth (reads STATE.md, ROADMAP.md)
      orchestrationStore.updateState(projectPath, {
        highestExecutedPhase,
        highestExecutingPhase: highestExecutingPhase ?? highestExecutedPhase,
        highestExecutingPlan: highestExecutingPlan ?? 1,
      });

      const execPlanStr =
        highestExecutingPhase !== undefined && highestExecutingPlan !== undefined
          ? `${String(highestExecutingPhase).padStart(2, '0')}-${String(highestExecutingPlan).padStart(2, '0')}`
          : 'not set';

      const maxAllowedPlan =
        highestExecutingPhase !== undefined && highestExecutingPlan !== undefined
          ? `${String(highestExecutingPhase).padStart(2, '0')}-${String(highestExecutingPlan + 2).padStart(2, '0')}`
          : `Phase ${highestExecutedPhase + 1}`;

      console.log(
        `[mcp] State updated: executed Phase ${previousState.highestExecutedPhase} -> ${highestExecutedPhase}, ` +
          `executing ${execPlanStr}. Planning limited to ${maxAllowedPlan}.`
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              previousState: {
                highestExecutedPhase: previousState.highestExecutedPhase,
                highestExecutingPhase: previousState.highestExecutingPhase,
                highestExecutingPlan: previousState.highestExecutingPlan,
              },
              newState: {
                highestExecutedPhase,
                highestExecutingPhase: highestExecutingPhase ?? highestExecutedPhase,
                highestExecutingPlan: highestExecutingPlan ?? 1,
              },
              reconciled: forceReset || stateDiff.highestExecutedPhase.change < 0,
              message: `State synchronized. Planning limited to ${maxAllowedPlan}.`,
            }),
          },
        ],
      };
    }
  );
}
