import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for gsd_start_session tool parameters.
 */
const startSessionSchema = {
  workingDir: z.string().describe('Path to the project working directory'),
  command: z.string().optional().describe('Optional command to pass to Claude'),
};

/**
 * Check if a command is an execution command.
 */
function isExecuteCommand(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes('/gsd:execute-plan') || command.includes('gsd:execute-plan');
}

/**
 * Check if a command is a planning command.
 */
function isPlanCommand(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes('/gsd:plan-phase') || command.includes('gsd:plan-phase');
}

/**
 * Check if a command is a verify command.
 */
function isVerifyCommand(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes('/gsd:verify-work') || command.includes('gsd:verify-work');
}

/**
 * Extract phase number from a command.
 * - Plan: "/gsd:plan-phase 3" → 3
 * - Execute: "/gsd:execute-plan .planning/phases/02-xxx/02-01-PLAN.md" → 2
 * - Verify: "/gsd:verify-work 2" → 2 (if specified)
 */
function extractPhaseNumber(command: string | undefined): number | null {
  if (!command) return null;

  // Plan command: /gsd:plan-phase X
  const planMatch = command.match(/gsd:plan-phase\s+(\d+)/i);
  if (planMatch && planMatch[1]) return parseInt(planMatch[1], 10);

  // Execute command: .planning/phases/XX-xxx/ (first two digits are phase)
  const execMatch = command.match(/phases\/(\d{2})-/);
  if (execMatch && execMatch[1]) return parseInt(execMatch[1], 10);

  // Verify command: /gsd:verify-work X (optional phase number)
  const verifyMatch = command.match(/gsd:verify-work\s+(\d+)/i);
  if (verifyMatch && verifyMatch[1]) return parseInt(verifyMatch[1], 10);

  return null;
}

/**
 * Extract plan path from execute command.
 */
function extractPlanPath(command: string | undefined): string | null {
  if (!command) return null;
  const match = command.match(/gsd:execute-plan\s+(\S+)/i);
  return match && match[1] ? match[1] : null;
}

// Concurrency limits - physical barriers
const MAX_CONCURRENT_EXECUTES = 1;

// Legacy in-memory tracking (kept for setHighestExecutedPhase compatibility)
let highestExecutedPhase = 0;

/**
 * Set the highest executed phase (legacy - prefer using sync_project_state)
 */
export function setHighestExecutedPhase(phase: number): void {
  highestExecutedPhase = phase;
  console.log(`[mcp] highestExecutedPhase set to ${phase} by orchestrator`);
}

/**
 * Get the current highest executed phase (legacy)
 */
export function getHighestExecutedPhase(): number {
  return highestExecutedPhase;
}

/**
 * Registers the gsd_start_session tool with the MCP server.
 *
 * PHYSICAL BARRIERS ENFORCED:
 * 1. Only 1 execute at a time (prevents codebase conflicts)
 * 2. Only plan 2 phases ahead of execution (prevents racing ahead)
 * 3. Verify gate: No new executes until pending verify completes
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerStartSessionTool(
  server: McpServer,
  manager: PersistentSessionManager
): void {
  server.tool('gsd_start_session', startSessionSchema, async ({ workingDir, command }) => {
    console.log(`[mcp] gsd_start_session called - workingDir: ${workingDir}, command: ${command}`);

    const orchestrationStore = manager.orchestrationStore;

    // Check for available slots
    if (manager.availableSlotsCount === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error:
                'No available session slots. Maximum 4 concurrent sessions allowed. Terminate an existing session first.',
            }),
          },
        ],
      };
    }

    const sessions = manager.listSessions();

    // EXECUTION COMMANDS
    if (isExecuteCommand(command)) {
      // Check 1: Only 1 execute at a time
      const runningExecutes = sessions.filter(
        (s) => s.status === 'running' && isExecuteCommand(s.currentCommand)
      );

      if (runningExecutes.length >= MAX_CONCURRENT_EXECUTES) {
        const running = runningExecutes[0]!;
        console.log(`[mcp] BLOCKED: Execute already running in slot ${running.slot}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `EXECUTION LIMIT: Only ${MAX_CONCURRENT_EXECUTES} execute can run at a time. Slot ${running.slot} is already executing "${running.currentCommand}". Wait for it to complete.`,
                runningExecute: {
                  slot: running.slot,
                  command: running.currentCommand,
                  startedAt: running.startedAt,
                },
              }),
            },
          ],
        };
      }

      // Extract phase number for verify gate check
      const phase = extractPhaseNumber(command);

      // Check 2: Verify gate - check if this phase is allowed
      const verifyCheck = orchestrationStore.canStartExecute(workingDir, phase ?? undefined);
      if (!verifyCheck.allowed) {
        console.log(`[mcp] BLOCKED: Verify gate - ${verifyCheck.reason}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `VERIFY GATE: ${verifyCheck.reason}`,
                pendingVerifyPhase: verifyCheck.pendingPhase,
              }),
            },
          ],
        };
      }

      // Mark plan as executing in database
      const planPath = extractPlanPath(command);
      if (planPath) {
        orchestrationStore.markExecuting(workingDir, planPath);
      }

      // Update in-memory tracking for legacy compatibility
      if (phase !== null && phase > highestExecutedPhase) {
        highestExecutedPhase = phase;
        console.log(`[mcp] Updated highestExecutedPhase to ${highestExecutedPhase}`);
      }
    }

    // PLANNING COMMANDS
    if (isPlanCommand(command)) {
      const planPhase = extractPhaseNumber(command);

      if (planPhase !== null) {
        // Check planning limit from database (plan-level, not phase-level)
        // For /gsd:plan-phase X, we check if planning any plan in Phase X is allowed
        const planCheck = orchestrationStore.canStartPlan(workingDir, planPhase);
        if (!planCheck.allowed) {
          console.log(`[mcp] BLOCKED: Planning limit - ${planCheck.reason}`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: `PLANNING LIMIT: ${planCheck.reason}`,
                  maxAllowedPlan: planCheck.maxAllowedPlan,
                  requestedPhase: planPhase,
                }),
              },
            ],
          };
        }
      }
    }

    // VERIFY COMMANDS - clear verify gate when verify runs
    if (isVerifyCommand(command)) {
      const verifyPhase = extractPhaseNumber(command);
      const state = orchestrationStore.getState(workingDir);

      // If this verify matches the pending phase, it will clear the gate on completion
      if (verifyPhase !== null && state.pendingVerifyPhase === verifyPhase) {
        console.log(
          `[mcp] Verify starting for phase ${verifyPhase} - will clear verify gate on completion`
        );
      }
    }

    try {
      // Spawn the session
      const session = await manager.spawn(workingDir, command);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              session: {
                id: session.id,
                slot: session.slot,
                status: session.status,
                workingDir: session.workingDir,
                currentCommand: session.currentCommand,
                startedAt: session.startedAt,
              },
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error spawning session';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to start session: ${errorMessage}`,
            }),
          },
        ],
      };
    }
  });
}
