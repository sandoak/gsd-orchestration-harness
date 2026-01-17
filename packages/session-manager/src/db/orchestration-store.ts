import type { Database } from 'better-sqlite3';

/**
 * Status of a plan in the orchestration pipeline.
 */
export type PlanStatus = 'planned' | 'executing' | 'executed' | 'verified';

/**
 * Represents a single plan within a phase.
 */
export interface PhasePlan {
  id: number;
  projectPath: string;
  phaseNumber: number;
  planNumber: number;
  planPath: string;
  status: PlanStatus;
  createdAt: string;
  executedAt: string | null;
  verifiedAt: string | null;
}

/**
 * Current orchestration state for a project.
 */
export interface OrchestrationState {
  projectPath: string;
  highestExecutedPhase: number;
  highestPlannedPhase: number;
  pendingVerifyPhase: number | null; // Phase that needs verify before more executes
  // Plan-level tracking for finer-grained limits
  highestExecutingPhase: number; // Phase of currently executing plan (e.g., 5 for 05-01)
  highestExecutingPlan: number; // Plan number within phase (e.g., 1 for 05-01)
  updatedAt: string;
}

/**
 * Map a raw database row to PhasePlan with camelCase properties.
 */
function mapRowToPhasePlan(row: Record<string, unknown>): PhasePlan {
  return {
    id: row.id as number,
    projectPath: row.project_path as string,
    phaseNumber: row.phase_number as number,
    planNumber: row.plan_number as number,
    planPath: row.plan_path as string,
    status: row.status as PlanStatus,
    createdAt: row.created_at as string,
    executedAt: (row.executed_at as string | null) ?? null,
    verifiedAt: (row.verified_at as string | null) ?? null,
  };
}

/**
 * OrchestrationStore manages the orchestration state database.
 * Tracks plans, executions, and verify status to enforce physical barriers.
 */
export class OrchestrationStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.initSchema();
  }

  /**
   * Initialize the orchestration tables.
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orchestration_state (
        project_path TEXT PRIMARY KEY,
        highest_executed_phase INTEGER DEFAULT 0,
        highest_planned_phase INTEGER DEFAULT 0,
        pending_verify_phase INTEGER DEFAULT NULL,
        highest_executing_phase INTEGER DEFAULT 0,
        highest_executing_plan INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );


      CREATE TABLE IF NOT EXISTS phase_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        phase_number INTEGER NOT NULL,
        plan_number INTEGER NOT NULL,
        plan_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        executed_at TEXT DEFAULT NULL,
        verified_at TEXT DEFAULT NULL,
        UNIQUE(project_path, phase_number, plan_number)
      );

      CREATE INDEX IF NOT EXISTS idx_phase_plans_project ON phase_plans(project_path);
      CREATE INDEX IF NOT EXISTS idx_phase_plans_status ON phase_plans(status);
    `);

    // Migration: Add new columns to existing databases
    this.migrateSchema();
  }

  /**
   * Migrate schema for existing databases that don't have new columns.
   */
  private migrateSchema(): void {
    // Check if columns exist by querying table info
    const columns = this.db.prepare('PRAGMA table_info(orchestration_state)').all() as Array<{
      name: string;
    }>;
    const columnNames = columns.map((c) => c.name);

    if (!columnNames.includes('highest_executing_phase')) {
      this.db.exec(
        'ALTER TABLE orchestration_state ADD COLUMN highest_executing_phase INTEGER DEFAULT 0'
      );
      console.log('[orchestration-store] Migrated: added highest_executing_phase column');
    }
    if (!columnNames.includes('highest_executing_plan')) {
      this.db.exec(
        'ALTER TABLE orchestration_state ADD COLUMN highest_executing_plan INTEGER DEFAULT 0'
      );
      console.log('[orchestration-store] Migrated: added highest_executing_plan column');
    }
  }

  /**
   * Get or create orchestration state for a project.
   */
  getState(projectPath: string): OrchestrationState {
    const row = this.db
      .prepare('SELECT * FROM orchestration_state WHERE project_path = ?')
      .get(projectPath) as Record<string, unknown> | undefined;

    if (row) {
      // Map snake_case DB columns to camelCase TypeScript properties
      return {
        projectPath: row.project_path as string,
        highestExecutedPhase: row.highest_executed_phase as number,
        highestPlannedPhase: row.highest_planned_phase as number,
        pendingVerifyPhase: (row.pending_verify_phase as number | null) ?? null,
        highestExecutingPhase: (row.highest_executing_phase as number) ?? 0,
        highestExecutingPlan: (row.highest_executing_plan as number) ?? 0,
        updatedAt: row.updated_at as string,
      };
    }

    // Create default state
    this.db
      .prepare(
        `INSERT INTO orchestration_state (project_path, highest_executed_phase, highest_planned_phase, highest_executing_phase, highest_executing_plan)
         VALUES (?, 0, 0, 0, 0)`
      )
      .run(projectPath);

    return {
      projectPath,
      highestExecutedPhase: 0,
      highestPlannedPhase: 0,
      pendingVerifyPhase: null,
      highestExecutingPhase: 0,
      highestExecutingPlan: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Update orchestration state.
   */
  updateState(
    projectPath: string,
    updates: Partial<Omit<OrchestrationState, 'projectPath' | 'updatedAt'>>
  ): void {
    const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: (string | number | null)[] = [];

    if (updates.highestExecutedPhase !== undefined) {
      setClauses.push('highest_executed_phase = ?');
      values.push(updates.highestExecutedPhase);
    }
    if (updates.highestPlannedPhase !== undefined) {
      setClauses.push('highest_planned_phase = ?');
      values.push(updates.highestPlannedPhase);
    }
    if (updates.pendingVerifyPhase !== undefined) {
      setClauses.push('pending_verify_phase = ?');
      values.push(updates.pendingVerifyPhase);
    }
    if (updates.highestExecutingPhase !== undefined) {
      setClauses.push('highest_executing_phase = ?');
      values.push(updates.highestExecutingPhase);
    }
    if (updates.highestExecutingPlan !== undefined) {
      setClauses.push('highest_executing_plan = ?');
      values.push(updates.highestExecutingPlan);
    }

    values.push(projectPath);

    this.db
      .prepare(`UPDATE orchestration_state SET ${setClauses.join(', ')} WHERE project_path = ?`)
      .run(...values);
  }

  /**
   * Add or update a plan in the database.
   */
  upsertPlan(
    projectPath: string,
    phaseNumber: number,
    planNumber: number,
    planPath: string,
    status: PlanStatus = 'planned'
  ): void {
    this.db
      .prepare(
        `INSERT INTO phase_plans (project_path, phase_number, plan_number, plan_path, status)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_path, phase_number, plan_number) DO UPDATE SET
           plan_path = excluded.plan_path,
           status = CASE
             WHEN phase_plans.status = 'verified'
             THEN phase_plans.status  -- Never downgrade verified status
             WHEN phase_plans.status = 'executed' AND excluded.status = 'planned'
             THEN phase_plans.status  -- Don't downgrade executed to planned
             ELSE excluded.status
           END`
      )
      .run(projectPath, phaseNumber, planNumber, planPath, status);
  }

  /**
   * Get all plans for a project.
   */
  getPlans(projectPath: string): PhasePlan[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM phase_plans WHERE project_path = ? ORDER BY phase_number, plan_number'
      )
      .all(projectPath) as Record<string, unknown>[];
    return rows.map(mapRowToPhasePlan);
  }

  /**
   * Get plans for a specific phase.
   */
  getPhasePlans(projectPath: string, phaseNumber: number): PhasePlan[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM phase_plans WHERE project_path = ? AND phase_number = ? ORDER BY plan_number'
      )
      .all(projectPath, phaseNumber) as Record<string, unknown>[];
    return rows.map(mapRowToPhasePlan);
  }

  /**
   * Mark a plan as executing and update the highestExecuting tracking.
   */
  markExecuting(projectPath: string, planPath: string): void {
    this.db
      .prepare(
        "UPDATE phase_plans SET status = 'executing' WHERE project_path = ? AND plan_path = ?"
      )
      .run(projectPath, planPath);

    // Extract phase and plan number from path (e.g., "phases/05-name/05-01-PLAN.md")
    const planMatch = planPath.match(/(\d{2})-(\d{2})-PLAN\.md/i);

    if (planMatch && planMatch[1] && planMatch[2]) {
      const phaseNumber = parseInt(planMatch[1], 10);
      const planNumber = parseInt(planMatch[2], 10);

      const state = this.getState(projectPath);

      // Update if this is a higher phase, or same phase with higher plan
      const shouldUpdate =
        phaseNumber > state.highestExecutingPhase ||
        (phaseNumber === state.highestExecutingPhase && planNumber > state.highestExecutingPlan);

      if (shouldUpdate) {
        this.updateState(projectPath, {
          highestExecutingPhase: phaseNumber,
          highestExecutingPlan: planNumber,
        });
        console.log(
          `[orchestration-store] Updated highestExecuting to ${String(phaseNumber).padStart(2, '0')}-${String(planNumber).padStart(2, '0')}`
        );
      }
    }
  }

  /**
   * Mark a plan as executed.
   */
  markExecuted(projectPath: string, planPath: string): void {
    this.db
      .prepare(
        "UPDATE phase_plans SET status = 'executed', executed_at = CURRENT_TIMESTAMP WHERE project_path = ? AND plan_path = ?"
      )
      .run(projectPath, planPath);

    // Extract phase number from plan path and update state
    const match = planPath.match(/phases\/(\d{2})-/);
    if (match && match[1]) {
      const phaseNumber = parseInt(match[1], 10);
      const state = this.getState(projectPath);

      // Update highest executed phase
      if (phaseNumber > state.highestExecutedPhase) {
        this.updateState(projectPath, { highestExecutedPhase: phaseNumber });
      }

      // Check if all plans in this phase are executed
      const phasePlans = this.getPhasePlans(projectPath, phaseNumber);
      const allExecuted = phasePlans.every(
        (p) => p.status === 'executed' || p.status === 'verified'
      );

      if (allExecuted && state.pendingVerifyPhase === null) {
        // Set pending verify - blocks new executes until verify runs
        this.updateState(projectPath, { pendingVerifyPhase: phaseNumber });
        console.log(`[orchestration-store] Phase ${phaseNumber} complete - pending verify`);
      }
    }
  }

  /**
   * Mark a phase as verified.
   */
  markPhaseVerified(projectPath: string, phaseNumber: number): void {
    this.db
      .prepare(
        "UPDATE phase_plans SET status = 'verified', verified_at = CURRENT_TIMESTAMP WHERE project_path = ? AND phase_number = ?"
      )
      .run(projectPath, phaseNumber);

    // Clear pending verify if this was the pending phase
    const state = this.getState(projectPath);
    if (state.pendingVerifyPhase === phaseNumber) {
      this.updateState(projectPath, { pendingVerifyPhase: null });
      console.log(`[orchestration-store] Phase ${phaseNumber} verified - executes unblocked`);
    }
  }

  /**
   * Check if a new execute can start (enforces verify gate).
   *
   * Verify gate only blocks progression to NEXT phase, not current phase executes.
   * For example, if Phase 3 is pending verify:
   * - Phase 4 executes: ALLOWED (one phase ahead)
   * - Phase 5 executes: BLOCKED (must verify Phase 3 first, then Phase 4)
   *
   * @param projectPath - Project path
   * @param targetPhase - Optional phase number being executed. If provided, only blocks
   *                      if target is more than 1 phase ahead of pending verify.
   */
  canStartExecute(
    projectPath: string,
    targetPhase?: number
  ): {
    allowed: boolean;
    reason?: string;
    pendingPhase?: number;
  } {
    const state = this.getState(projectPath);

    if (state.pendingVerifyPhase !== null) {
      // If we know the target phase, only block if it's more than 1 ahead
      if (targetPhase !== undefined) {
        // Allow executing one phase ahead of pending verify
        // E.g., if Phase 3 pending verify, Phase 4 is OK, Phase 5 is blocked
        if (targetPhase > state.pendingVerifyPhase + 1) {
          return {
            allowed: false,
            reason: `Phase ${state.pendingVerifyPhase} must be verified before executing Phase ${targetPhase}. Current limit: Phase ${state.pendingVerifyPhase + 1}.`,
            pendingPhase: state.pendingVerifyPhase,
          };
        }
        // Target phase is within allowed range
        return { allowed: true };
      }

      // If no target phase specified, be conservative and block
      return {
        allowed: false,
        reason: `Phase ${state.pendingVerifyPhase} completed but not verified. Specify target phase to check if allowed.`,
        pendingPhase: state.pendingVerifyPhase,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if a new plan can start (enforces 2-ahead limit at PLAN level).
   *
   * Planning limit is 2 PLANS ahead of current execution, not phases.
   * Example: If executing 05-01, can plan 05-01, 05-02, 05-03 but NOT 05-04 or 06-xx.
   *
   * Cross-phase planning only allowed after current phase is complete.
   *
   * @param projectPath - Project path
   * @param phaseNumber - Phase number of requested plan (e.g., 5 for 05-01)
   * @param planNumber - Plan number within phase (e.g., 1 for 05-01). If not provided, defaults to 1.
   */
  canStartPlan(
    projectPath: string,
    phaseNumber: number,
    _planNumber: number = 1
  ): { allowed: boolean; reason?: string; maxAllowedPlan?: string } {
    // RELAXED PLANNING LIMIT:
    // The orchestrator knows the dependency graph from ROADMAP.md and can make
    // intelligent decisions about what to plan in parallel. We trust the orchestrator
    // to not plan phases that have unmet dependencies.
    //
    // Only enforce a soft limit: don't plan more than 5 phases ahead of execution
    // to prevent runaway planning that wastes resources.

    const state = this.getState(projectPath);
    const basePhase = Math.max(state.highestExecutingPhase, state.highestExecutedPhase, 0);

    // Allow planning up to 5 phases ahead of wherever execution is
    // This gives the orchestrator plenty of room to parallelize independent phases
    const maxPhase = basePhase + 5;

    if (phaseNumber <= maxPhase) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Phase ${phaseNumber} is more than 5 phases ahead of execution (currently at Phase ${basePhase}). This limit prevents runaway planning.`,
      maxAllowedPlan: `${String(maxPhase).padStart(2, '0')}-01`,
    };
  }

  /**
   * Get count of currently executing plans.
   */
  getExecutingCount(projectPath: string): number {
    const result = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM phase_plans WHERE project_path = ? AND status = 'executing'"
      )
      .get(projectPath) as { count: number };
    return result.count;
  }

  /**
   * Sync plans from filesystem scan.
   * Called by orchestrator after reading .planning/phases/
   */
  syncPlans(
    projectPath: string,
    plans: Array<{
      phaseNumber: number;
      planNumber: number;
      planPath: string;
      hasExecuted: boolean;
    }>
  ): void {
    let highestPlanned = 0;

    for (const plan of plans) {
      const status: PlanStatus = plan.hasExecuted ? 'executed' : 'planned';
      this.upsertPlan(projectPath, plan.phaseNumber, plan.planNumber, plan.planPath, status);

      if (plan.phaseNumber > highestPlanned) {
        highestPlanned = plan.phaseNumber;
      }
    }

    this.updateState(projectPath, { highestPlannedPhase: highestPlanned });
    console.log(
      `[orchestration-store] Synced ${plans.length} plans, highest planned: Phase ${highestPlanned}`
    );
  }

  /**
   * Clear all data for a project (for testing/reset).
   */
  clearProject(projectPath: string): void {
    this.db.prepare('DELETE FROM phase_plans WHERE project_path = ?').run(projectPath);
    this.db.prepare('DELETE FROM orchestration_state WHERE project_path = ?').run(projectPath);
  }
}
