import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * Basic GSD state extracted from STATE.md.
 * Phase 5 will enhance with full parsing.
 */
interface BasicGsdState {
  currentPhase: number;
  currentPlan: number;
  status: string;
  progress: string;
  hasCheckpoint: boolean;
}

/**
 * Extracts basic GSD state from STATE.md content using regex.
 */
function parseStateFile(content: string): Partial<BasicGsdState> {
  const result: Partial<BasicGsdState> = {};

  // Extract phase number from "Phase: X of Y"
  const phaseMatch = content.match(/Phase:\s*(\d+)\s*of\s*\d+/i);
  if (phaseMatch?.[1]) {
    result.currentPhase = parseInt(phaseMatch[1], 10);
  }

  // Extract plan number from "Plan: X of Y"
  const planMatch = content.match(/Plan:\s*(\d+)\s*of\s*\d+/i);
  if (planMatch?.[1]) {
    result.currentPlan = parseInt(planMatch[1], 10);
  }

  // Extract status from "Status:" line
  const statusMatch = content.match(/Status:\s*([^\n]+)/i);
  if (statusMatch?.[1]) {
    result.status = statusMatch[1].trim();
  }

  // Extract progress percentage if present (e.g., "[███████░░░] 41%")
  const progressMatch = content.match(/(\[\S+\]\s*\d+%)/);
  if (progressMatch) {
    result.progress = progressMatch[1];
  }

  return result;
}

/**
 * Registers the gsd_get_state tool with the MCP server.
 *
 * This tool reads GSD state from the session's working directory.
 * Basic regex-based extraction for MVP; Phase 5 adds full parsing.
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
    const stateFile = join(planningDir, 'STATE.md');

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
      // Read and parse STATE.md
      let state: Partial<BasicGsdState> = {};
      if (existsSync(stateFile)) {
        const stateContent = readFileSync(stateFile, 'utf-8');
        state = parseStateFile(stateContent);
      }

      // Check session status for checkpoint
      const hasCheckpoint = session.status === 'waiting_checkpoint';

      const gsdState: BasicGsdState = {
        currentPhase: state.currentPhase ?? 0,
        currentPlan: state.currentPlan ?? 0,
        status: state.status ?? 'unknown',
        progress: state.progress ?? '',
        hasCheckpoint,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sessionId,
              workingDir: session.workingDir,
              state: gsdState,
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
