import type { SessionEvent, SessionStatus } from '@gsd/core';

/**
 * WebSocket message wrapper for session events.
 *
 * The message format passes through the SessionEvent structure directly,
 * preserving the type field for client-side routing.
 */
export type SessionEventMessage = SessionEvent;

/**
 * Initial state message sent to new WebSocket connections.
 */
export interface InitialStateMessage {
  type: 'initial-state';
  sessions: SessionSummary[];
}

/**
 * Summary of a session for initial state.
 */
export interface SessionSummary {
  id: string;
  status: SessionStatus;
  workingDir: string;
  slot: 1 | 2 | 3 | 4;
  startedAt: Date;
}

/**
 * All WebSocket message types that can be sent to clients.
 */
export type WsMessage = SessionEventMessage | InitialStateMessage;
