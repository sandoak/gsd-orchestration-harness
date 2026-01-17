import { readdir, readFile, writeFile, access, constants, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import type { OrchestrationStore, PlanStatus } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for harness_sync_project_state tool parameters.
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
 * Supports multiple naming conventions:
 * - "03-02-PLAN.md" → { phase: 3, plan: 2 }
 * - "01-PLAN.md" → { phase: 1, plan: 1 }
 * - "01-error-logger-PLAN.md" → { phase: 1, plan: 1 }
 * - "03-001-app-integration-PLAN.md" → { phase: 3, plan: 1 }
 * - "02-01-feature-name-PLAN.md" → { phase: 2, plan: 1 }
 *
 * @param filename - The PLAN.md filename
 * @param phaseFromDir - Optional phase number from parent directory name
 */
function parsePlanFilename(
  filename: string,
  phaseFromDir?: number
): { phase: number; plan: number } | null {
  // Must end with -PLAN.md
  if (!filename.endsWith('-PLAN.md')) {
    console.log(`[sync] Skipping ${filename}: doesn't end with -PLAN.md`);
    return null;
  }

  // Try strict format first: XX-YY-PLAN.md
  const strictMatch = filename.match(/^(\d{2})-(\d{2})-PLAN\.md$/);
  if (strictMatch?.[1] && strictMatch[2]) {
    console.log(
      `[sync] Parsed ${filename}: strict format → phase=${strictMatch[1]}, plan=${strictMatch[2]}`
    );
    return {
      phase: parseInt(strictMatch[1], 10),
      plan: parseInt(strictMatch[2], 10),
    };
  }

  // Try: XX-YY-name-PLAN.md (phase-plan-description)
  const namedMatch = filename.match(/^(\d{1,2})-(\d{1,3})-[a-zA-Z].*-PLAN\.md$/);
  if (namedMatch?.[1] && namedMatch[2]) {
    console.log(
      `[sync] Parsed ${filename}: named format → phase=${namedMatch[1]}, plan=${namedMatch[2]}`
    );
    return {
      phase: parseInt(namedMatch[1], 10),
      plan: parseInt(namedMatch[2], 10),
    };
  }

  // Try: XX-PLAN.md (single number, assume plan 1)
  const singleMatch = filename.match(/^(\d{1,2})-PLAN\.md$/);
  if (singleMatch?.[1]) {
    const num = parseInt(singleMatch[1], 10);
    // If we have phase from directory, this is the plan number
    if (phaseFromDir !== undefined) {
      console.log(
        `[sync] Parsed ${filename}: single number with dir context → phase=${phaseFromDir}, plan=${num}`
      );
      return { phase: phaseFromDir, plan: num };
    }
    // Otherwise assume phase number with plan 1
    console.log(`[sync] Parsed ${filename}: single number → phase=${num}, plan=1`);
    return { phase: num, plan: 1 };
  }

  // Try: XX-name-PLAN.md (number-description, assume plan 1)
  const numNameMatch = filename.match(/^(\d{1,2})-[a-zA-Z].*-PLAN\.md$/);
  if (numNameMatch?.[1]) {
    const num = parseInt(numNameMatch[1], 10);
    if (phaseFromDir !== undefined) {
      console.log(
        `[sync] Parsed ${filename}: num-name with dir context → phase=${phaseFromDir}, plan=${num}`
      );
      return { phase: phaseFromDir, plan: num };
    }
    console.log(`[sync] Parsed ${filename}: num-name format → phase=${num}, plan=1`);
    return { phase: num, plan: 1 };
  }

  console.log(`[sync] Could not parse ${filename}: no pattern matched`);
  return null;
}

/**
 * Find the planning directory - supports multiple structures.
 * Returns the base path and relative path prefix for plan paths.
 */
async function findPlanningDirectory(
  projectPath: string
): Promise<{ basePath: string; pathPrefix: string } | null> {
  // Try direct spec structure first: planning/plans/ (when projectPath IS the spec)
  const directPlansDir = join(projectPath, 'planning', 'plans');
  try {
    await access(directPlansDir, constants.R_OK);
    console.log(`[sync-project-state] Found direct spec structure at ${directPlansDir}`);
    return {
      basePath: directPlansDir,
      pathPrefix: 'planning/plans',
    };
  } catch {
    // Not a direct spec directory
  }

  // Try spec-centric structure: specs/*/planning/plans/
  const specsDir = join(projectPath, 'specs');
  try {
    await access(specsDir, constants.R_OK);
    const specDirs = await readdir(specsDir, { withFileTypes: true });
    for (const specDir of specDirs) {
      if (!specDir.isDirectory()) continue;
      const plansDir = join(specsDir, specDir.name, 'planning', 'plans');
      try {
        await access(plansDir, constants.R_OK);
        console.log(`[sync-project-state] Found spec-centric structure at ${plansDir}`);
        return {
          basePath: plansDir,
          pathPrefix: `specs/${specDir.name}/planning/plans`,
        };
      } catch {
        // Try next spec dir
      }
    }
  } catch {
    // No specs directory
  }

  // Fall back to legacy structure: .planning/phases/
  const phasesDir = join(projectPath, '.planning', 'phases');
  try {
    await access(phasesDir, constants.R_OK);
    console.log(`[sync-project-state] Found legacy structure at ${phasesDir}`);
    return {
      basePath: phasesDir,
      pathPrefix: '.planning/phases',
    };
  } catch {
    // No planning directory found
  }

  return null;
}

/**
 * Find execution directory for spec-centric structure.
 * SUMMARYs may be in a separate execution/phases/ directory.
 */
async function findExecutionDirectory(
  projectPath: string,
  specDirName: string
): Promise<string | null> {
  const executionDir = join(projectPath, 'specs', specDirName, 'execution', 'phases');
  try {
    await access(executionDir, constants.R_OK);
    return executionDir;
  } catch {
    return null;
  }
}

/**
 * Scan a project's planning directory and discover all plans.
 * Supports both legacy (.planning/phases/) and spec-centric (specs/[spec]/planning/plans/) structures.
 * For spec-centric, also checks execution/phases/ for SUMMARYs (split structure).
 * Also returns set of phases that have VERIFICATION.md files.
 */
async function scanPlanningDirectory(
  projectPath: string
): Promise<{ plans: DiscoveredPlan[]; verifiedPhases: Set<number> }> {
  const plans: DiscoveredPlan[] = [];
  const verifiedPhases = new Set<number>();

  const planningDir = await findPlanningDirectory(projectPath);
  if (!planningDir) {
    console.log(`[sync-project-state] No planning directory found at ${projectPath}`);
    return { plans, verifiedPhases };
  }

  const { basePath, pathPrefix } = planningDir;

  // Find execution directory (where SUMMARYs may live separately)
  let executionBasePath: string | null = null;
  if (pathPrefix === 'planning/plans') {
    // Direct spec structure: projectPath/execution/
    const directExecutionDir = join(projectPath, 'execution');
    try {
      await access(directExecutionDir, constants.R_OK);
      executionBasePath = directExecutionDir;
      console.log(`[sync-project-state] Found direct execution directory at ${executionBasePath}`);
    } catch {
      // No execution directory
    }
  } else if (pathPrefix.startsWith('specs/')) {
    // Spec-centric structure: specs/*/execution/
    const specDirName = pathPrefix.split('/')[1];
    if (specDirName) {
      executionBasePath = await findExecutionDirectory(projectPath, specDirName);
      if (executionBasePath) {
        console.log(`[sync-project-state] Found execution directory at ${executionBasePath}`);
      }
    }
  }

  // Read phase directories from planning
  const phaseDirs = await readdir(basePath, { withFileTypes: true });

  for (const phaseDir of phaseDirs) {
    if (!phaseDir.isDirectory()) continue;

    const phaseMatch = phaseDir.name.match(/^(\d{2})-/);
    if (!phaseMatch || !phaseMatch[1]) continue;

    const phaseNumber = parseInt(phaseMatch[1], 10);
    const phasePath = join(basePath, phaseDir.name);
    const files = await readdir(phasePath);

    // Also read execution phase directory if it exists
    let executionFiles: string[] = [];
    let executionPhasePath: string | null = null;
    if (executionBasePath) {
      executionPhasePath = join(executionBasePath, phaseDir.name);
      try {
        executionFiles = await readdir(executionPhasePath);
        console.log(
          `[sync-project-state] Found ${executionFiles.length} files in execution/${phaseDir.name}`
        );
      } catch {
        // Execution phase directory doesn't exist yet
      }
    }

    // Check for VERIFICATION.md at phase level (in planning OR execution)
    if (files.includes('VERIFICATION.md') || executionFiles.includes('VERIFICATION.md')) {
      verifiedPhases.add(phaseNumber);
      console.log(`[sync-project-state] Phase ${phaseNumber} has VERIFICATION.md`);
    }

    // Find PLAN.md files
    console.log(
      `[sync] Scanning phase dir ${phaseDir.name} (phase ${phaseNumber}): ${files.length} files`
    );
    for (const file of files) {
      const parsed = parsePlanFilename(file, phaseNumber);
      if (!parsed) continue;

      const planPath = join(pathPrefix, phaseDir.name, file);
      const summaryFile = file.replace('-PLAN.md', '-SUMMARY.md');

      // Check for SUMMARY in planning dir OR execution dir
      const hasSummaryInPlanning = files.includes(summaryFile);
      const hasSummaryInExecution = executionFiles.includes(summaryFile);
      const hasSummary = hasSummaryInPlanning || hasSummaryInExecution;

      // Determine status based on SUMMARY existence and content
      let status: PlanStatus = 'planned';
      if (hasSummary) {
        status = 'executed';
        // Check if SUMMARY contains "## Status: VERIFIED"
        try {
          const summaryPath = hasSummaryInPlanning
            ? join(phasePath, summaryFile)
            : join(executionPhasePath!, summaryFile);
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

  // Summary log
  console.log(`[sync] === SCAN SUMMARY ===`);
  console.log(
    `[sync] Found ${plans.length} plans across ${phaseDirs.filter((d) => d.isDirectory()).length} phase directories`
  );
  for (const plan of plans) {
    console.log(
      `[sync]   - Phase ${plan.phaseNumber}, Plan ${plan.planNumber}: ${plan.status} (${plan.planPath})`
    );
  }
  if (plans.length === 0) {
    console.log(`[sync] WARNING: No plans found! Check file naming conventions.`);
  }

  return { plans, verifiedPhases };
}

/**
 * Information about a spec directory for state file management.
 */
interface SpecInfo {
  specId: string;
  specDir: string;
  statePath: string;
  projectName: string;
  milestone: string;
}

/**
 * Audit status for spec completion gate.
 */
interface AuditStatus {
  auditExists: boolean;
  auditPassed: boolean;
  canDeclareComplete: boolean;
  auditMessage: string;
}

/**
 * Check AUDIT.md status in the spec directory.
 * This is the programmatic gate for spec completion.
 */
async function checkAuditStatus(specDir: string): Promise<AuditStatus> {
  const auditPath = join(specDir, 'AUDIT.md');

  try {
    await access(auditPath, constants.R_OK);
    const content = await readFile(auditPath, 'utf-8');

    // Check for 100% adherence indicators
    const hasFullAdherence =
      content.includes('100% adherence') ||
      content.includes('ADHERENCE_100%') ||
      content.includes('100% Adherence') ||
      content.includes('Adherence: 100%');

    if (hasFullAdherence) {
      return {
        auditExists: true,
        auditPassed: true,
        canDeclareComplete: true,
        auditMessage: 'AUDIT.md exists with 100% adherence. Spec can be declared complete.',
      };
    } else {
      return {
        auditExists: true,
        auditPassed: false,
        canDeclareComplete: false,
        auditMessage:
          'AUDIT.md exists but shows gaps. Run /harness:audit-milestone to remediate gaps.',
      };
    }
  } catch {
    return {
      auditExists: false,
      auditPassed: false,
      canDeclareComplete: false,
      auditMessage:
        '⚠️ AUDIT.md MISSING - Cannot declare spec complete! Run /harness:audit-milestone FIRST.',
    };
  }
}

/**
 * Accumulated context from STATE.md that persists across syncs.
 */
interface AccumulatedContext {
  decisions: string[];
  deferred: string[];
  blockers: string[];
  lastSession: string | null;
  stoppedAt: string | null;
}

/**
 * Find spec info for state file management.
 * Returns spec directory info for spec-centric structure, or null for legacy.
 */
async function findSpecInfo(projectPath: string): Promise<SpecInfo | null> {
  const specsDir = join(projectPath, 'specs');
  try {
    await access(specsDir, constants.R_OK);
    const specDirs = await readdir(specsDir, { withFileTypes: true });
    for (const specDir of specDirs) {
      if (!specDir.isDirectory()) continue;
      const specPath = join(specsDir, specDir.name);
      const roadmapPath = join(specPath, 'ROADMAP.md');
      try {
        await access(roadmapPath, constants.R_OK);
        const roadmapContent = await readFile(roadmapPath, 'utf-8');

        // Parse frontmatter for project name and milestone
        const projectMatch = roadmapContent.match(/^project:\s*(.+)$/m);
        const milestoneMatch = roadmapContent.match(/^milestone:\s*(.+)$/m);

        return {
          specId: specDir.name,
          specDir: specPath,
          statePath: join(specPath, 'STATE.md'),
          projectName: projectMatch?.[1]?.trim() || 'unknown',
          milestone: milestoneMatch?.[1]?.trim() || 'unknown',
        };
      } catch {
        // Try next spec dir
      }
    }
  } catch {
    // No specs directory
  }
  return null;
}

/**
 * Read accumulated context from existing STATE.md.
 * This preserves decisions, deferred items, and blockers across syncs.
 */
async function readAccumulatedContext(statePath: string): Promise<AccumulatedContext> {
  const defaults: AccumulatedContext = {
    decisions: [],
    deferred: [],
    blockers: [],
    lastSession: null,
    stoppedAt: null,
  };

  try {
    const content = await readFile(statePath, 'utf-8');

    // Parse Key Decisions section
    const decisionsMatch = content.match(/### Key Decisions\n([\s\S]*?)(?=\n###|\n---|\n## |$)/);
    if (decisionsMatch?.[1]) {
      const lines = decisionsMatch[1]
        .trim()
        .split('\n')
        .filter((l) => l.startsWith('- '));
      defaults.decisions = lines.map((l) => l.slice(2));
    }

    // Parse Deferred Issues section
    const deferredMatch = content.match(/### Deferred Issues\n([\s\S]*?)(?=\n###|\n---|\n## |$)/);
    if (deferredMatch?.[1]) {
      const lines = deferredMatch[1]
        .trim()
        .split('\n')
        .filter((l) => l.startsWith('- '));
      defaults.deferred = lines.map((l) => l.slice(2));
    }

    // Parse Blockers section
    const blockersMatch = content.match(/### Blockers\n([\s\S]*?)(?=\n###|\n---|\n## |$)/);
    if (blockersMatch?.[1]) {
      const lines = blockersMatch[1]
        .trim()
        .split('\n')
        .filter((l) => l.startsWith('- '));
      defaults.blockers = lines.map((l) => l.slice(2));
    }

    // Parse Session Continuity
    const lastSessionMatch = content.match(/\| Last Session \| (.+?) \|/);
    const stoppedAtMatch = content.match(/\| Stopped At \| (.+?) \|/);
    defaults.lastSession = lastSessionMatch?.[1]?.trim() || null;
    defaults.stoppedAt = stoppedAtMatch?.[1]?.trim() || null;
  } catch {
    // STATE.md doesn't exist, use defaults
  }

  return defaults;
}

/**
 * Phase info for state file generation.
 */
interface PhaseInfo {
  phaseNumber: number;
  phaseName: string;
  totalPlans: number;
  executedPlans: number;
  verified: boolean;
}

/**
 * Write STATE.md with current state.
 */
async function writeStateFile(
  statePath: string,
  specInfo: SpecInfo,
  phases: PhaseInfo[],
  state: {
    highestPlannedPhase: number;
    highestExecutedPhase: number;
    highestVerifiedPhase: number;
    pendingVerifyPhase: number | null;
    totalPlans: number;
    completedPlans: number;
  },
  accumulated: AccumulatedContext
): Promise<void> {
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  // Calculate current phase (first incomplete phase)
  const currentPhase =
    phases.find((p) => p.executedPlans < p.totalPlans)?.phaseNumber || state.highestExecutedPhase;
  const currentPhaseInfo = phases.find((p) => p.phaseNumber === currentPhase);
  const plansInCurrentPhase = currentPhaseInfo?.totalPlans || 0;
  const executedInCurrentPhase = currentPhaseInfo?.executedPlans || 0;

  // Calculate progress
  const totalPhases = phases.length;
  const completedPhases = phases.filter(
    (p) => p.executedPlans === p.totalPlans && p.verified
  ).length;
  const progressPercent =
    state.totalPlans > 0 ? Math.round((state.completedPlans / state.totalPlans) * 100) : 0;
  const progressBarFilled = Math.round(progressPercent / 5);
  const progressBar = '█'.repeat(progressBarFilled) + '░'.repeat(20 - progressBarFilled);

  // Determine status
  let status = 'Planning';
  if (state.completedPlans === state.totalPlans && completedPhases === totalPhases) {
    status = 'Complete';
  } else if (state.completedPlans > 0) {
    status = state.pendingVerifyPhase ? 'Pending Verification' : 'Executing';
  }

  // Build phase table
  const phaseTable = phases
    .map((p) => {
      const verified = p.verified ? '✓' : p.executedPlans === p.totalPlans ? '⏳' : '-';
      const execStatus =
        p.executedPlans === p.totalPlans ? 'Complete' : `${p.executedPlans}/${p.totalPlans}`;
      return `| ${p.phaseNumber} | ${p.phaseName} | ${p.totalPlans} | ${execStatus} | ${verified} |`;
    })
    .join('\n');

  // Build decisions list
  const decisionsText =
    accumulated.decisions.length > 0
      ? accumulated.decisions.map((d) => `- ${d}`).join('\n')
      : '_None recorded_';

  // Build deferred list
  const deferredText =
    accumulated.deferred.length > 0
      ? accumulated.deferred.map((d) => `- ${d}`).join('\n')
      : '_None_';

  // Build blockers list
  const blockersText =
    accumulated.blockers.length > 0
      ? accumulated.blockers.map((b) => `- ${b}`).join('\n')
      : '_None_';

  // Determine resume command
  const resumeCommand = state.pendingVerifyPhase
    ? `/harness:verify-work ${state.pendingVerifyPhase}`
    : currentPhase <= totalPhases
      ? `/harness:execute-phase ${currentPhase}`
      : '/harness:orchestrate (complete)';

  const content = `# Project State

## Project Reference

See: specs/${specInfo.specId}/SPEC.md
**Spec ID:** ${specInfo.specId}
**Project:** ${specInfo.projectName}
**Milestone:** ${specInfo.milestone}

## Current Position

| Field | Value |
|-------|-------|
| Phase | ${currentPhase} of ${totalPhases} |
| Plan | ${executedInCurrentPhase} of ${plansInCurrentPhase} |
| Status | ${status} |
| Last Activity | ${today} |

Progress: [${progressBar}] ${progressPercent}%

## Phase Summary

| Phase | Name | Plans | Executed | Verified |
|-------|------|-------|----------|----------|
${phaseTable}

## Verification Gate

| Field | Value |
|-------|-------|
| Highest Executed Phase | ${state.highestExecutedPhase} |
| Highest Verified Phase | ${state.highestVerifiedPhase} |
| Pending Verification | ${state.pendingVerifyPhase ?? 'None'} |

## Performance Metrics

**Velocity:**
- Total plans completed: ${state.completedPlans}
- Total phases completed: ${completedPhases}

## Session Continuity

| Field | Value |
|-------|-------|
| Last Session | ${today} |
| Stopped At | Phase ${currentPhase}, Plan ${executedInCurrentPhase + 1} |
| Resume Command | \`${resumeCommand}\` |

## Accumulated Context

### Key Decisions
${decisionsText}

### Deferred Issues
${deferredText}

### Blockers
${blockersText}

---
_State file maintained by harness. Updated after each sync._
_Last sync: ${now}_
`;

  // Ensure directory exists
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, content, 'utf-8');
  console.log(`[sync-project-state] Wrote STATE.md to ${statePath}`);
}

/**
 * Read STATE.md to find current phase position (legacy support).
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
 * Registers the harness_sync_project_state tool with the MCP server.
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
  server.tool('harness_sync_project_state', syncProjectStateSchema, async ({ projectPath }) => {
    console.log(`[mcp] harness_sync_project_state called - projectPath: ${projectPath}`);

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

      // Write STATE.md for spec-centric projects
      const specInfo = await findSpecInfo(projectPath);
      if (specInfo) {
        // Read accumulated context (decisions, blockers, etc.) from existing STATE.md
        const accumulated = await readAccumulatedContext(specInfo.statePath);

        // Build phase info from phaseGroups
        const phases: PhaseInfo[] = [];
        for (const [phaseNum, phasePlans] of phaseGroups) {
          // Try to get phase name from ROADMAP.md or use generic name
          const phaseName = `Phase ${phaseNum}`; // Could be enhanced to read from ROADMAP
          const executedPlans = phasePlans.filter(
            (p) => p.status === 'executed' || p.status === 'verified'
          ).length;
          phases.push({
            phaseNumber: phaseNum,
            phaseName,
            totalPlans: phasePlans.length,
            executedPlans,
            verified: verifiedPhases.has(phaseNum),
          });
        }
        phases.sort((a, b) => a.phaseNumber - b.phaseNumber);

        // Write STATE.md
        await writeStateFile(
          specInfo.statePath,
          specInfo,
          phases,
          {
            highestPlannedPhase: highestPlanned,
            highestExecutedPhase: highestExecuted,
            highestVerifiedPhase: highestVerified,
            pendingVerifyPhase: newState.pendingVerifyPhase,
            totalPlans: discoveredPlans.length,
            completedPlans: executedCount,
          },
          accumulated
        );
      }

      // Check AUDIT.md status - this is the programmatic gate for completion
      const auditStatus = specInfo
        ? await checkAuditStatus(specInfo.specDir)
        : {
            auditExists: false,
            auditPassed: false,
            canDeclareComplete: false,
            auditMessage: 'No spec directory found to check AUDIT.md',
          };

      // Determine if all work appears done (all plans executed, all phases verified)
      const allPlansExecuted =
        executedCount === discoveredPlans.length && discoveredPlans.length > 0;
      const allPhasesVerified =
        newState.pendingVerifyPhase === null && highestVerified >= highestPlanned;
      const workLooksComplete = allPlansExecuted && allPhasesVerified;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              projectPath,
              // ⚠️ COMPLETION GATE - ORCHESTRATOR MUST CHECK THIS
              completionGate: {
                workLooksComplete,
                auditExists: auditStatus.auditExists,
                auditPassed: auditStatus.auditPassed,
                canDeclareComplete: auditStatus.canDeclareComplete,
                message: auditStatus.auditMessage,
                // This is the key flag - if false, orchestrator CANNOT stop
                canStopOrchestration: auditStatus.canDeclareComplete,
              },
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
      console.error(`[mcp] harness_sync_project_state error:`, error);
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
