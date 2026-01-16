/**
 * Worker Message Types
 *
 * Messages sent from worker sessions to the orchestrator.
 * Part of the structured communication protocol that replaces output parsing.
 */

/**
 * Types of messages workers can send to the orchestrator.
 */
export type WorkerMessageType =
  | 'session_ready' // Worker initialized and ready for task
  | 'task_started' // Worker began executing a task
  | 'progress_update' // Worker reporting progress
  | 'verification_needed' // Worker needs verification of completed work
  | 'decision_needed' // Worker needs a decision from orchestrator
  | 'action_needed' // Worker needs human action (rare)
  | 'credentials_needed' // Worker needs credentials for a service
  | 'task_completed' // Worker finished task successfully
  | 'task_failed'; // Worker failed to complete task

/**
 * Status of a worker message in the message store.
 */
export type WorkerMessageStatus = 'pending' | 'responded' | 'expired';

/**
 * Base interface for all worker messages.
 */
export interface WorkerMessageBase {
  id: string;
  sessionId: string;
  type: WorkerMessageType;
  timestamp: string;
  status: WorkerMessageStatus;
}

/**
 * Worker signals it's ready to receive a task.
 */
export interface SessionReadyMessage extends WorkerMessageBase {
  type: 'session_ready';
  payload: {
    workingDir: string;
    capabilities: string[]; // e.g., ['execute', 'research', 'verify']
  };
}

/**
 * Worker signals it started a task.
 */
export interface TaskStartedMessage extends WorkerMessageBase {
  type: 'task_started';
  payload: {
    phase: number;
    plan: number;
    taskNumber: number;
    totalTasks: number;
    taskName: string;
    planPath: string;
  };
}

/**
 * Worker reports progress on current task.
 */
export interface ProgressUpdateMessage extends WorkerMessageBase {
  type: 'progress_update';
  payload: {
    phase: number;
    plan: number;
    taskNumber: number;
    totalTasks: number;
    message: string;
    percentComplete?: number;
  };
}

/**
 * Worker needs verification of completed work.
 */
export interface VerificationNeededMessage extends WorkerMessageBase {
  type: 'verification_needed';
  payload: {
    phase: number;
    plan: number;
    whatBuilt: string;
    howToVerify: string[];
    artifacts: string[]; // Files created/modified
  };
}

/**
 * Worker needs a decision from orchestrator/user.
 */
export interface DecisionNeededMessage extends WorkerMessageBase {
  type: 'decision_needed';
  payload: {
    phase: number;
    plan: number;
    decision: string;
    context: string;
    options: Array<{
      id: string;
      name: string;
      description: string;
      recommended?: boolean;
    }>;
  };
}

/**
 * Worker needs human action (rare - for things Claude can't automate).
 */
export interface ActionNeededMessage extends WorkerMessageBase {
  type: 'action_needed';
  payload: {
    phase: number;
    plan: number;
    action: string;
    instructions: string;
    reason: string; // Why this can't be automated
  };
}

/**
 * Worker needs credentials for an external service.
 * The orchestrator will look up credentials from the configured credentials directory.
 */
export interface CredentialsNeededMessage extends WorkerMessageBase {
  type: 'credentials_needed';
  payload: {
    phase: number;
    plan: number;
    service: string; // e.g., 'postgres', 'stripe', 'openai'
    envVars: string[]; // e.g., ['DATABASE_URL', 'PGPASSWORD']
    reason: string; // Why credentials are needed
    context?: string; // Additional context (e.g., which database)
  };
}

/**
 * Worker completed task successfully.
 */
export interface TaskCompletedMessage extends WorkerMessageBase {
  type: 'task_completed';
  payload: {
    phase: number;
    plan: number;
    taskNumber: number;
    totalTasks: number;
    summary: string;
    filesModified: string[];
    filesCreated: string[];
    commitHash?: string;
  };
}

/**
 * Worker failed to complete task.
 */
export interface TaskFailedMessage extends WorkerMessageBase {
  type: 'task_failed';
  payload: {
    phase: number;
    plan: number;
    taskNumber: number;
    error: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

/**
 * Union type of all worker messages.
 */
export type WorkerMessage =
  | SessionReadyMessage
  | TaskStartedMessage
  | ProgressUpdateMessage
  | VerificationNeededMessage
  | DecisionNeededMessage
  | ActionNeededMessage
  | CredentialsNeededMessage
  | TaskCompletedMessage
  | TaskFailedMessage;

/**
 * Input for creating a new worker message (before ID and timestamp are assigned).
 */
export type WorkerMessageInput = Omit<WorkerMessage, 'id' | 'timestamp' | 'status'>;

/**
 * Helper to check if a message requires a response.
 */
export function messageRequiresResponse(type: WorkerMessageType): boolean {
  return ['verification_needed', 'decision_needed', 'action_needed', 'credentials_needed'].includes(
    type
  );
}
