/**
 * Orchestrator Message Types
 *
 * Messages sent from the orchestrator to worker sessions.
 * Part of the structured communication protocol that replaces output parsing.
 */

/**
 * Types of messages the orchestrator can send to workers.
 */
export type OrchestratorMessageType =
  | 'assign_task' // Assign a new task to the worker
  | 'verification_result' // Result of verification request
  | 'decision_made' // Decision made by user/orchestrator
  | 'action_completed' // Human action has been completed
  | 'abort_task'; // Abort current task

/**
 * Base interface for all orchestrator messages.
 */
export interface OrchestratorMessageBase {
  id: string;
  sessionId: string;
  type: OrchestratorMessageType;
  timestamp: string;
  inResponseTo?: string; // ID of worker message this responds to
}

/**
 * Orchestrator assigns a task to a worker.
 */
export interface AssignTaskMessage extends OrchestratorMessageBase {
  type: 'assign_task';
  payload: {
    phase: number;
    plan: number;
    planPath: string;
    specDir: string;
    taskType: 'execute' | 'research' | 'verify';
    context?: string; // Additional context for the task
  };
}

/**
 * Orchestrator sends verification result.
 */
export interface VerificationResultMessage extends OrchestratorMessageBase {
  type: 'verification_result';
  payload: {
    phase: number;
    plan: number;
    verified: boolean;
    feedback?: string;
    issues?: string[];
    nextSteps?: string[];
  };
}

/**
 * Orchestrator communicates a decision.
 */
export interface DecisionMadeMessage extends OrchestratorMessageBase {
  type: 'decision_made';
  payload: {
    phase: number;
    plan: number;
    decision: string;
    selectedOptionId: string;
    selectedOptionName: string;
    rationale?: string;
  };
}

/**
 * Orchestrator confirms human action was completed.
 */
export interface ActionCompletedMessage extends OrchestratorMessageBase {
  type: 'action_completed';
  payload: {
    phase: number;
    plan: number;
    action: string;
    completedBy: string; // 'user' or identifier
    notes?: string;
  };
}

/**
 * Orchestrator aborts a task.
 */
export interface AbortTaskMessage extends OrchestratorMessageBase {
  type: 'abort_task';
  payload: {
    phase: number;
    plan: number;
    reason: string;
    shouldRetry: boolean;
    retryInstructions?: string;
  };
}

/**
 * Union type of all orchestrator messages.
 */
export type OrchestratorMessage =
  | AssignTaskMessage
  | VerificationResultMessage
  | DecisionMadeMessage
  | ActionCompletedMessage
  | AbortTaskMessage;

/**
 * Input for creating a new orchestrator message (before ID and timestamp).
 */
export type OrchestratorMessageInput = Omit<OrchestratorMessage, 'id' | 'timestamp'>;

/**
 * Helper to check if a message type is a response to a worker request.
 */
export function isResponseMessage(type: OrchestratorMessageType): boolean {
  return ['verification_result', 'decision_made', 'action_completed'].includes(type);
}

/**
 * Helper to check if a message type initiates work.
 */
export function isInitiatingMessage(type: OrchestratorMessageType): boolean {
  return type === 'assign_task';
}
