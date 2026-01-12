import { useSessionStore } from '../store/session-store';
import type { Session } from '../types';

import { SessionSlot } from './SessionSlot';

export function SessionPanel() {
  const sessions = useSessionStore((state) => state.sessions);

  // Find the best session for each slot:
  // 1. Prefer running/waiting sessions
  // 2. Fall back to most recent completed/failed session
  const getSessionForSlot = (slot: 1 | 2 | 3): Session | undefined => {
    let runningSession: Session | undefined;
    let latestSession: Session | undefined;

    for (const session of sessions.values()) {
      if (session.slot !== slot) continue;

      // Running or waiting sessions take priority
      if (session.status === 'running' || session.status === 'waiting_checkpoint') {
        runningSession = session;
        break; // Found active session, no need to continue
      }

      // Track the most recent session by startedAt
      if (!latestSession || session.startedAt > latestSession.startedAt) {
        latestSession = session;
      }
    }

    return runningSession ?? latestSession;
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-hidden md:grid-cols-3">
      <SessionSlot slot={1} session={getSessionForSlot(1)} />
      <SessionSlot slot={2} session={getSessionForSlot(2)} />
      <SessionSlot slot={3} session={getSessionForSlot(3)} />
    </div>
  );
}
