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

/**
 * Semantic classification of prompt intent.
 * Helps orchestrator know HOW to respond to plain text prompts.
 */
export type PromptIntent =
  | 'verification' // "Does this match?", "Is X correct?" - needs actual testing
  | 'action-required' // "Let me know when X", "Apply migrations" - needs action
  | 'decision' // "Select option", "Choose between" - needs choice
  | 'completion' // Session finished, waiting for next command
  | 'unknown'; // Unclassified prompt

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
  /** Semantic classification of what the prompt is asking for */
  promptIntent?: PromptIntent;
  /** Extracted context from the prompt (e.g., what to verify, action to take) */
  promptContext?: string;
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
