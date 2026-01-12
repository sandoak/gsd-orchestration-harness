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
  updatedAt: string;
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
  }

  /**
   * Get or create orchestration state for a project.
   */
  getState(projectPath: string): OrchestrationState {
    const row = this.db
      .prepare('SELECT * FROM orchestration_state WHERE project_path = ?')
      .get(projectPath) as OrchestrationState | undefined;

    if (row) {
      return row;
    }

    // Create default state
    this.db
      .prepare(
        `INSERT INTO orchestration_state (project_path, highest_executed_phase, highest_planned_phase)
         VALUES (?, 0, 0)`
      )
      .run(projectPath);

    return {
      projectPath,
      highestExecutedPhase: 0,
      highestPlannedPhase: 0,
      pendingVerifyPhase: null,
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
             WHEN phase_plans.status IN ('executed', 'verified') AND excluded.status = 'planned'
             THEN phase_plans.status
             ELSE excluded.status
           END`
      )
      .run(projectPath, phaseNumber, planNumber, planPath, status);
  }

  /**
   * Get all plans for a project.
   */
  getPlans(projectPath: string): PhasePlan[] {
    return this.db
      .prepare(
        'SELECT * FROM phase_plans WHERE project_path = ? ORDER BY phase_number, plan_number'
      )
      .all(projectPath) as PhasePlan[];
  }

  /**
   * Get plans for a specific phase.
   */
  getPhasePlans(projectPath: string, phaseNumber: number): PhasePlan[] {
    return this.db
      .prepare(
        'SELECT * FROM phase_plans WHERE project_path = ? AND phase_number = ? ORDER BY plan_number'
      )
      .all(projectPath, phaseNumber) as PhasePlan[];
  }

  /**
   * Mark a plan as executing.
   */
  markExecuting(projectPath: string, planPath: string): void {
    this.db
      .prepare(
        "UPDATE phase_plans SET status = 'executing' WHERE project_path = ? AND plan_path = ?"
      )
      .run(projectPath, planPath);
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
   */
  canStartExecute(projectPath: string): {
    allowed: boolean;
    reason?: string;
    pendingPhase?: number;
  } {
    const state = this.getState(projectPath);

    if (state.pendingVerifyPhase !== null) {
      return {
        allowed: false,
        reason: `Phase ${state.pendingVerifyPhase} completed but not verified. Run verify before starting new executes.`,
        pendingPhase: state.pendingVerifyPhase,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if a new plan can start (enforces 2-ahead limit).
   */
  canStartPlan(
    projectPath: string,
    phaseNumber: number
  ): { allowed: boolean; reason?: string; maxAllowed?: number } {
    const state = this.getState(projectPath);
    const maxAllowed = state.highestExecutedPhase + 2;

    // Special case: if nothing executed yet, allow phases 1-2
    const effectiveMax = state.highestExecutedPhase === 0 ? 2 : maxAllowed;

    if (phaseNumber > effectiveMax) {
      return {
        allowed: false,
        reason: `Can only plan ${2} phases ahead. Highest executed: Phase ${state.highestExecutedPhase}. Max allowed: Phase ${effectiveMax}. Requested: Phase ${phaseNumber}.`,
        maxAllowed: effectiveMax,
      };
    }

    return { allowed: true };
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
