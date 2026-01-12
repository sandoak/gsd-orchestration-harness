// Session manager exports
export { SessionManager, type SessionManagerOptions } from './session-manager.js';

// Database exports
export {
  DatabaseConnection,
  getDatabase,
  closeDatabase,
  SessionStore,
  OutputStore,
  type SessionUpdateFields,
} from './db/index.js';

// Re-export relevant types from @gsd/core
export type {
  Session,
  SessionStatus,
  SessionOutput,
  SessionEvent,
  SessionStartedEvent,
  SessionOutputEvent,
  SessionCheckpointEvent,
  SessionCompletedEvent,
  SessionFailedEvent,
} from '@gsd/core';

export { MAX_SESSIONS, SESSION_SLOTS, DEFAULT_OUTPUT_BUFFER_SIZE } from '@gsd/core';
