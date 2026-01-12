/**
 * Dashboard types - aligned with @gsd/core and @gsd/web-server
 */

// Session types
export type SessionStatus = 'idle' | 'running' | 'waiting_checkpoint' | 'completed' | 'failed';

export interface Session {
  id: string;
  slot: 1 | 2 | 3 | 4;
  status: SessionStatus;
  workingDir: string;
  currentCommand?: string;
  startedAt: Date;
  endedAt?: Date;
  pid?: number;
}

// Checkpoint types
export type CheckpointType = 'human-verify' | 'decision' | 'human-action';

export interface CheckpointBase {
  type: CheckpointType;
  sessionId: string;
  detectedAt: Date;
}

export interface HumanVerifyCheckpoint extends CheckpointBase {
  type: 'human-verify';
  whatBuilt: string;
  howToVerify: string[];
  resumeSignal: string;
}

export interface DecisionCheckpoint extends CheckpointBase {
  type: 'decision';
  decision: string;
  context: string;
  options: Array<{
    id: string;
    name: string;
    pros: string;
    cons: string;
  }>;
  resumeSignal: string;
}

export interface HumanActionCheckpoint extends CheckpointBase {
  type: 'human-action';
  action: string;
  instructions: string;
  resumeSignal: string;
}

export type CheckpointInfo = HumanVerifyCheckpoint | DecisionCheckpoint | HumanActionCheckpoint;

// Event types
export type EventType =
  | 'session:started'
  | 'session:output'
  | 'session:checkpoint'
  | 'session:completed'
  | 'session:failed';

export interface BaseEvent {
  type: EventType;
  timestamp: Date;
  sessionId: string;
}

export interface SessionStartedEvent extends BaseEvent {
  type: 'session:started';
  slot: 1 | 2 | 3 | 4;
  workingDir: string;
  command: string;
}

export interface SessionOutputEvent extends BaseEvent {
  type: 'session:output';
  stream: 'stdout' | 'stderr';
  data: string;
}

export interface SessionCheckpointEvent extends BaseEvent {
  type: 'session:checkpoint';
  checkpoint: CheckpointInfo;
}

export interface SessionCompletedEvent extends BaseEvent {
  type: 'session:completed';
  exitCode: number;
}

export interface SessionFailedEvent extends BaseEvent {
  type: 'session:failed';
  error: string;
}

export type SessionEvent =
  | SessionStartedEvent
  | SessionOutputEvent
  | SessionCheckpointEvent
  | SessionCompletedEvent
  | SessionFailedEvent;

// WebSocket message types
export interface SessionSummary {
  id: string;
  status: SessionStatus;
  workingDir: string;
  slot: 1 | 2 | 3 | 4;
  startedAt: Date;
}

export interface InitialStateMessage {
  type: 'initial-state';
  sessions: SessionSummary[];
}

export type WsMessage = SessionEvent | InitialStateMessage;
