import type { CheckpointInfo } from './checkpoint.js';

export type EventType =
  | 'session:started'
  | 'session:output'
  | 'session:checkpoint'
  | 'session:waiting'
  | 'session:completed'
  | 'session:failed';

/**
 * Type of wait state detected from PTY output.
 */
export type WaitStateType =
  | 'menu' // AskUserQuestion numbered menu
  | 'prompt' // Regular input prompt (❯)
  | 'permission' // Permission request (y/n, Allow?)
  | 'continue' // Press Enter to continue
  | 'unknown'; // Generic wait state

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

export interface SessionWaitingEvent extends BaseEvent {
  type: 'session:waiting';
  waitType: WaitStateType;
  /** Number of menu options if waitType is 'menu' */
  menuOptions?: number;
  /** Raw output snippet that triggered the detection */
  trigger?: string;
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
  | SessionWaitingEvent
  | SessionCompletedEvent
  | SessionFailedEvent;
