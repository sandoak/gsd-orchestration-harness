import type { OrchestrationStore } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for gsd_mark_phase_verified tool parameters.
 */
const markPhaseVerifiedSchema = {
  projectPath: z.string().describe('Absolute path to the project directory'),
  phaseNumber: z.number().int().positive().describe('Phase number to mark as verified'),
};

/**
 * Registers the gsd_mark_phase_verified tool with the MCP server.
 *
 * This tool marks all plans in a phase as verified and clears the verify gate
 * if the phase matches the pending verify phase.
 *
 * @param server - The MCP server instance
 * @param orchestrationStore - The OrchestrationStore instance
 */
export function registerMarkPhaseVerifiedTool(
  server: McpServer,
  orchestrationStore: OrchestrationStore
): void {
  server.tool(
    'gsd_mark_phase_verified',
    markPhaseVerifiedSchema,
    async ({ projectPath, phaseNumber }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[mcp] gsd_mark_phase_verified called - projectPath: ${projectPath}, phaseNumber: ${phaseNumber}`
      );

      try {
        // Get current state
        const stateBefore = orchestrationStore.getState(projectPath);

        // Mark the phase as verified
        orchestrationStore.markPhaseVerified(projectPath, phaseNumber);

        // Get updated state
        const stateAfter = orchestrationStore.getState(projectPath);

        // Get the plans for this phase to confirm
        const phasePlans = orchestrationStore.getPhasePlans(projectPath, phaseNumber);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                projectPath,
                phaseNumber,
                plansVerified: phasePlans.length,
                verifyGateCleared:
                  stateBefore.pendingVerifyPhase === phaseNumber &&
                  stateAfter.pendingVerifyPhase === null,
                state: {
                  pendingVerifyPhaseBefore: stateBefore.pendingVerifyPhase,
                  pendingVerifyPhaseAfter: stateAfter.pendingVerifyPhase,
                },
              }),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // eslint-disable-next-line no-console
        console.error(`[mcp] gsd_mark_phase_verified error:`, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Failed to mark phase as verified: ${errorMessage}`,
              }),
            },
          ],
        };
      }
    }
  );
}
