import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { GsdStateParser } from '@gsd/core';
import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for gsd_get_state tool parameters.
 */
const getStateSchema = {
  sessionId: z.string().describe('ID of the session to get GSD state from'),
};

/**
 * Registers the gsd_get_state tool with the MCP server.
 *
 * This tool reads GSD state from the session's working directory using
 * GsdStateParser to extract comprehensive project state from .planning/ files.
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerGetStateTool(server: McpServer, manager: PersistentSessionManager): void {
  server.tool('gsd_get_state', getStateSchema, async ({ sessionId }) => {
    // Verify session exists and get working directory
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

    const planningDir = join(session.workingDir, '.planning');

    // Check if GSD project exists
    if (!existsSync(planningDir)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'No GSD project found (missing .planning/ directory)',
            }),
          },
        ],
      };
    }

    try {
      // Parse state using GsdStateParser
      const parsedState = GsdStateParser.parseFromDirectory(session.workingDir);

      // Override hasCheckpoint with session status (more accurate for runtime)
      const hasCheckpoint = session.status === 'waiting_checkpoint' || parsedState.hasCheckpoint;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sessionId,
              workingDir: session.workingDir,
              state: {
                projectName: parsedState.projectName,
                currentPhase: parsedState.currentPhase,
                currentPlan: parsedState.currentPlan,
                status: parsedState.status,
                progress: parsedState.progress,
                totalPhases: parsedState.totalPhases,
                plansInCurrentPhase: parsedState.plansInCurrentPhase,
                phases: parsedState.phases,
                hasCheckpoint,
                decisions: parsedState.decisions,
                deferredIssues: parsedState.deferredIssues,
                currentPlanTasks: parsedState.currentPlanTasks,
                currentPlanHasCheckpoints: parsedState.currentPlanHasCheckpoints,
              },
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error reading state';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to read GSD state: ${errorMessage}`,
            }),
          },
        ],
      };
    }
  });
}
