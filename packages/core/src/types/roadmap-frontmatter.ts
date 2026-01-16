/**
 * ROADMAP.md Frontmatter Types
 *
 * YAML frontmatter schema for ROADMAP.md that consolidates STATE.md information.
 * This allows the harness to quickly read project state without parsing
 * the entire document.
 *
 * Example frontmatter:
 * ```yaml
 * ---
 * version: 1
 * project: my-project
 * milestone: v1.0
 *
 * current_phase: 3
 * current_plan: 2
 * status: executing
 *
 * total_phases: 7
 * completed_phases: 2
 * total_plans: 18
 * completed_plans: 8
 *
 * velocity:
 *   total_plans_completed: 8
 *   total_execution_minutes: 45
 *   average_minutes_per_plan: 6
 * ---
 * ```
 */

/**
 * Project status values
 */
export type ProjectStatus = 'planning' | 'executing' | 'verifying' | 'blocked' | 'complete';

/**
 * Velocity metrics for tracking execution speed
 */
export interface VelocityMetrics {
  /** Total number of plans completed across all sessions */
  total_plans_completed: number;
  /** Total execution time in minutes */
  total_execution_minutes: number;
  /** Average minutes per plan */
  average_minutes_per_plan: number;
}

/**
 * ROADMAP.md YAML frontmatter schema
 */
export interface RoadmapFrontmatter {
  /** Schema version for future compatibility */
  version: number;
  /** Project name */
  project: string;
  /** Current milestone (e.g., "v1.0") */
  milestone: string;

  // Current Position (replaces STATE.md)
  /** Current phase number */
  current_phase: number;
  /** Current plan number within the phase */
  current_plan: number;
  /** Overall project status */
  status: ProjectStatus;

  // Progress
  /** Total number of phases in the milestone */
  total_phases: number;
  /** Number of completed phases */
  completed_phases: number;
  /** Total number of plans across all phases */
  total_plans: number;
  /** Number of completed plans */
  completed_plans: number;

  // Velocity (optional)
  /** Execution velocity metrics */
  velocity?: VelocityMetrics;

  // Spec-centric fields (when used in spec directory)
  /** Path to the spec directory (e.g., "/docs/specs/SPC-001-feature") */
  spec_dir?: string;
  /** Spec identifier (e.g., "SPC-001") */
  spec_id?: string;
}

/**
 * Default frontmatter values for new projects
 */
export const DEFAULT_ROADMAP_FRONTMATTER: RoadmapFrontmatter = {
  version: 1,
  project: '',
  milestone: 'v1.0',
  current_phase: 0,
  current_plan: 0,
  status: 'planning',
  total_phases: 0,
  completed_phases: 0,
  total_plans: 0,
  completed_plans: 0,
};

/**
 * Calculates progress percentage from frontmatter
 */
export function calculateProgress(frontmatter: RoadmapFrontmatter): number {
  if (frontmatter.total_plans === 0) return 0;
  return Math.round((frontmatter.completed_plans / frontmatter.total_plans) * 100);
}

/**
 * Determines if the project is complete
 */
export function isProjectComplete(frontmatter: RoadmapFrontmatter): boolean {
  return (
    frontmatter.status === 'complete' ||
    (frontmatter.total_plans > 0 && frontmatter.completed_plans >= frontmatter.total_plans)
  );
}
