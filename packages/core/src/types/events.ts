import type { CheckpointInfo } from './checkpoint.js';

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
