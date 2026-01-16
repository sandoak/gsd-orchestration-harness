import { readdir, readFile, access, constants } from 'node:fs/promises';
import { join } from 'node:path';

import type { OrchestrationStore, PlanStatus } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for gsd_sync_project_state tool parameters.
 */
const syncProjectStateSchema = {
  projectPath: z.string().describe('Absolute path to the project directory'),
};

/**
 * Discovered plan from filesystem scan.
 */
interface DiscoveredPlan {
  phaseNumber: number;
  planNumber: number;
  planPath: string;
  hasSummary: boolean;
  status: PlanStatus;
}

/**
 * Parse phase and plan numbers from a PLAN.md filename.
 * E.g., "03-02-PLAN.md" → { phase: 3, plan: 2 }
 */
function parsePlanFilename(filename: string): { phase: number; plan: number } | null {
  const match = filename.match(/^(\d{2})-(\d{2})-PLAN\.md$/);
  if (!match || !match[1] || !match[2]) return null;
  return {
    phase: parseInt(match[1], 10),
    plan: parseInt(match[2], 10),
  };
}

/**
 * Scan a project's .planning/phases/ directory and discover all plans.
 * Also returns set of phases that have VERIFICATION.md files.
 */
async function scanPlanningDirectory(
  projectPath: string
): Promise<{ plans: DiscoveredPlan[]; verifiedPhases: Set<number> }> {
  const phasesDir = join(projectPath, '.planning', 'phases');
  const plans: DiscoveredPlan[] = [];
  const verifiedPhases = new Set<number>();

  try {
    await access(phasesDir, constants.R_OK);
  } catch {
    console.log(`[sync-project-state] No .planning/phases/ directory at ${phasesDir}`);
    return { plans, verifiedPhases };
  }

  // Read phase directories
  const phaseDirs = await readdir(phasesDir, { withFileTypes: true });

  for (const phaseDir of phaseDirs) {
    if (!phaseDir.isDirectory()) continue;

    const phaseMatch = phaseDir.name.match(/^(\d{2})-/);
    if (!phaseMatch || !phaseMatch[1]) continue;

    const phaseNumber = parseInt(phaseMatch[1], 10);
    const phasePath = join(phasesDir, phaseDir.name);
    const files = await readdir(phasePath);

    // Check for VERIFICATION.md at phase level
    if (files.includes('VERIFICATION.md')) {
      verifiedPhases.add(phaseNumber);
      console.log(`[sync-project-state] Phase ${phaseNumber} has VERIFICATION.md`);
    }

    // Find PLAN.md files
    for (const file of files) {
      const parsed = parsePlanFilename(file);
      if (!parsed) continue;

      const planPath = join('.planning', 'phases', phaseDir.name, file);
      const summaryFile = file.replace('-PLAN.md', '-SUMMARY.md');
      const hasSummary = files.includes(summaryFile);

      // Determine status based on SUMMARY existence and content
      let status: PlanStatus = 'planned';
      if (hasSummary) {
        status = 'executed';
        // Check if SUMMARY contains "## Status: VERIFIED"
        try {
          const summaryPath = join(phasePath, summaryFile);
          const summaryContent = await readFile(summaryPath, 'utf-8');
          if (summaryContent.includes('## Status: VERIFIED')) {
            status = 'verified';
          }
        } catch {
          // Ignore read errors, keep as executed
        }
      }

      // If phase has VERIFICATION.md, mark all executed plans as verified
      if (verifiedPhases.has(parsed.phase) && status === 'executed') {
        status = 'verified';
      }

      plans.push({
        phaseNumber: parsed.phase,
        planNumber: parsed.plan,
        planPath,
        hasSummary,
        status,
      });
    }
  }

  // Sort by phase then plan number
  plans.sort((a, b) => {
    if (a.phaseNumber !== b.phaseNumber) return a.phaseNumber - b.phaseNumber;
    return a.planNumber - b.planNumber;
  });

  return { plans, verifiedPhases };
}

/**
 * Read STATE.md to find current phase position.
 */
async function readStateFile(projectPath: string): Promise<{ currentPhase: number } | null> {
  const statePath = join(projectPath, '.planning', 'STATE.md');

  try {
    const content = await readFile(statePath, 'utf-8');
    // Look for "Current Phase:" or similar patterns
    const match = content.match(/current\s+phase[:\s]+(\d+)/i);
    if (match && match[1]) {
      return { currentPhase: parseInt(match[1], 10) };
    }
  } catch {
    // STATE.md doesn't exist
  }

  return null;
}

/**
 * Registers the gsd_sync_project_state tool with the MCP server.
 *
 * This tool scans a project's .planning/ directory and syncs the discovered
 * plans to the orchestration database. It enforces that the database reflects
 * reality from the filesystem.
 *
 * @param server - The MCP server instance
 * @param orchestrationStore - The OrchestrationStore instance
 */
export function registerSyncProjectStateTool(
  server: McpServer,
  orchestrationStore: OrchestrationStore
): void {
  server.tool('gsd_sync_project_state', syncProjectStateSchema, async ({ projectPath }) => {
    console.log(`[mcp] gsd_sync_project_state called - projectPath: ${projectPath}`);

    try {
      // Scan filesystem for plans and verified phases
      const { plans: discoveredPlans, verifiedPhases } = await scanPlanningDirectory(projectPath);

      // Read STATE.md for context
      await readStateFile(projectPath);

      // Ensure state row exists in database
      orchestrationStore.getState(projectPath);

      // Sync plans to database
      let highestPlanned = 0;
      let highestExecuted = 0;
      let highestVerified = 0;
      let executedCount = 0;
      let plannedCount = 0;

      for (const plan of discoveredPlans) {
        orchestrationStore.upsertPlan(
          projectPath,
          plan.phaseNumber,
          plan.planNumber,
          plan.planPath,
          plan.status
        );

        if (plan.phaseNumber > highestPlanned) {
          highestPlanned = plan.phaseNumber;
        }

        if (plan.status === 'executed' || plan.status === 'verified') {
          executedCount++;
          if (plan.phaseNumber > highestExecuted) {
            highestExecuted = plan.phaseNumber;
          }
          if (plan.status === 'verified' && plan.phaseNumber > highestVerified) {
            highestVerified = plan.phaseNumber;
          }
        } else {
          plannedCount++;
        }
      }

      // Track highest verified phase from VERIFICATION.md files
      for (const phase of verifiedPhases) {
        if (phase > highestVerified) {
          highestVerified = phase;
        }
      }

      // Update state
      orchestrationStore.updateState(projectPath, {
        highestPlannedPhase: highestPlanned,
        highestExecutedPhase: highestExecuted,
      });

      // Mark phases with VERIFICATION.md as verified in the database
      for (const phase of verifiedPhases) {
        orchestrationStore.markPhaseVerified(projectPath, phase);
      }

      // Check for pending verify (all plans in a phase executed but phase not verified)
      const dbPlans = orchestrationStore.getPlans(projectPath);
      const phaseGroups = new Map<number, typeof dbPlans>();
      for (const plan of dbPlans) {
        const existing = phaseGroups.get(plan.phaseNumber) || [];
        existing.push(plan);
        phaseGroups.set(plan.phaseNumber, existing);
      }

      // Check for pending verify (all plans in a phase executed but not verified)
      // Only SET pendingVerifyPhase if there's work to do, otherwise preserve existing state
      // (mark_phase_verified clears it, sync shouldn't override that unless truly needed)
      const currentState = orchestrationStore.getState(projectPath);
      let pendingVerifyPhase: number | null = null;

      for (const [phaseNum, phasePlans] of phaseGroups) {
        const allExecuted = phasePlans.every((p) => p.status === 'executed');
        const anyVerified = phasePlans.some((p) => p.status === 'verified');

        if (allExecuted && !anyVerified) {
          pendingVerifyPhase = phaseNum;
          break; // Only track one pending verify at a time
        }
      }

      // Only update pendingVerifyPhase if:
      // 1. We found a phase needing verify AND it's different from current, OR
      // 2. Current is set but we found no phase needing verify (clear it)
      if (pendingVerifyPhase !== currentState.pendingVerifyPhase) {
        orchestrationStore.updateState(projectPath, { pendingVerifyPhase });
      }

      // Get updated state
      const newState = orchestrationStore.getState(projectPath);

      // Calculate limits
      const maxPlanPhase =
        newState.highestExecutedPhase === 0 ? 2 : newState.highestExecutedPhase + 2;

      // Calculate max execute phase based on verify gate
      // If pendingVerifyPhase is set, can execute up to pendingVerifyPhase + 1
      // Otherwise, no limit from verify gate
      const maxExecutePhase =
        newState.pendingVerifyPhase !== null ? newState.pendingVerifyPhase + 1 : null; // null means no limit

      console.log(
        `[sync] pendingVerifyPhase=${newState.pendingVerifyPhase}, maxExecutePhase=${maxExecutePhase}`
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              projectPath,
              sync: {
                totalPlans: discoveredPlans.length,
                executedPlans: executedCount,
                pendingPlans: plannedCount,
              },
              state: {
                highestPlannedPhase: newState.highestPlannedPhase,
                highestExecutedPhase: newState.highestExecutedPhase,
                pendingVerifyPhase: newState.pendingVerifyPhase,
              },
              limits: {
                maxPlanPhase,
                maxExecutePhase, // null means no limit, number means max allowed phase
                pendingVerifyBlocks:
                  newState.pendingVerifyPhase !== null
                    ? `Phase ${newState.pendingVerifyPhase} pending verify. Can execute up to Phase ${newState.pendingVerifyPhase + 1}.`
                    : null,
              },
              plans: discoveredPlans.map((p) => ({
                path: p.planPath,
                phase: p.phaseNumber,
                plan: p.planNumber,
                status: p.status,
              })),
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[mcp] gsd_sync_project_state error:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to sync project state: ${errorMessage}`,
            }),
          },
        ],
      };
    }
  });
}
