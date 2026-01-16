/**
 * File-Based Protocol Types
 *
 * Types for the .orchestration/ directory structure used for crash recovery
 * and state persistence. These files allow the harness to recover state
 * after restarts and provide a clear audit trail.
 */

/**
 * Worker execution state for status.json
 */
export type WorkerState = 'initializing' | 'running' | 'checkpoint' | 'completed' | 'failed';

/**
 * Worker status persisted to .orchestration/sessions/{id}/status.json
 */
export interface WorkerStatus {
  sessionId: string;
  timestamp: string;
  state: WorkerState;
  phase: number;
  plan: number;
  currentTask: number;
  totalTasks: number;
  taskName?: string;
  message?: string;
}

/**
 * Checkpoint persisted to .orchestration/sessions/{id}/checkpoint.json
 */
export interface PersistedCheckpoint {
  sessionId: string;
  timestamp: string;
  type: 'verification' | 'decision' | 'action';
  phase: number;
  plan: number;

  // For verification checkpoints
  whatBuilt?: string;
  howToVerify?: string[];
  artifacts?: string[];

  // For decision checkpoints
  decision?: string;
  context?: string;
  options?: Array<{
    id: string;
    name: string;
    description: string;
    recommended?: boolean;
  }>;

  // For action checkpoints
  action?: string;
  instructions?: string;
  reason?: string;
}

/**
 * Checkpoint response persisted to .orchestration/sessions/{id}/checkpoint_response.json
 */
export interface PersistedCheckpointResponse {
  sessionId: string;
  timestamp: string;
  checkpointType: 'verification' | 'decision' | 'action';

  // For verification responses
  verified?: boolean;
  feedback?: string;
  issues?: string[];

  // For decision responses
  selectedOptionId?: string;
  selectedOptionName?: string;
  rationale?: string;

  // For action responses
  actionCompleted?: boolean;
  completedBy?: string;
  notes?: string;
}

/**
 * Execution result persisted to .orchestration/sessions/{id}/result.json
 */
export interface ExecutionResult {
  sessionId: string;
  timestamp: string;
  success: boolean;
  phase: number;
  plan: number;

  // Success details
  summary?: string;
  filesModified?: string[];
  filesCreated?: string[];
  commitHash?: string;

  // Failure details
  error?: string;
  recoverable?: boolean;
  suggestion?: string;
}

/**
 * Plan dependency information for dependency-graph.json
 */
export interface PlanDependency {
  planId: string; // e.g., "03-02"
  dependsOn: string[]; // Plan IDs that must complete first
  filesModified: string[]; // Files this plan will modify
  filesRead: string[]; // Files this plan reads
  autonomous: boolean; // Can run without human interaction
  checkpoints: string[]; // Types of checkpoints expected
}

/**
 * Current state of the dependency graph
 */
export interface DependencyGraphState {
  timestamp: string;
  specDir: string;
  plans: PlanDependency[];
  completed: string[]; // Plan IDs that are complete
  running: string[]; // Plan IDs currently executing
  blocked: string[]; // Plan IDs blocked by dependencies
  available: string[]; // Plan IDs ready to execute
}

/**
 * Active file tracking for conflict detection
 */
export interface ActiveFileEntry {
  path: string;
  sessionId: string;
  planId: string;
  operation: 'read' | 'write';
  startedAt: string;
}

/**
 * Active files state for active-files.json
 */
export interface ActiveFilesState {
  timestamp: string;
  files: ActiveFileEntry[];
}

/**
 * Orchestration configuration in config.yaml
 */
export interface OrchestrationConfig {
  version: string;
  specDir: string;
  maxParallelExecutions: number;
  maxParallelResearch: number;
  verificationRequired: boolean;
  autoCommit: boolean;
}
