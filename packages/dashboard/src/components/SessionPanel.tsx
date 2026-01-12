import { useSessionStore } from '../store/session-store';

import { SessionSlot } from './SessionSlot';

export function SessionPanel() {
  const sessions = useSessionStore((state) => state.sessions);

  // Find session for each slot
  const getSessionForSlot = (slot: 1 | 2 | 3) => {
    for (const session of sessions.values()) {
      if (session.slot === slot) {
        return session;
      }
    }
    return undefined;
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <SessionSlot slot={1} session={getSessionForSlot(1)} />
      <SessionSlot slot={2} session={getSessionForSlot(2)} />
      <SessionSlot slot={3} session={getSessionForSlot(3)} />
    </div>
  );
}
