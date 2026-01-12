import { create } from 'zustand';

import type { Session, SessionEvent, SessionSummary, SessionStatus } from '../types';

interface SessionState {
  // State
  sessions: Map<string, Session>;
  output: Map<string, string[]>;
  connected: boolean;

  // Actions
  setSession: (session: Session) => void;
  updateSessionStatus: (sessionId: string, status: SessionStatus) => void;
  appendOutput: (sessionId: string, line: string) => void;
  setConnected: (connected: boolean) => void;
  handleEvent: (event: SessionEvent) => void;
  handleInitialState: (sessions: SessionSummary[]) => void;
  clearOutput: (sessionId: string) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: new Map(),
  output: new Map(),
  connected: false,

  setSession: (session) => {
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.set(session.id, session);
      return { sessions: newSessions };
    });
  },

  updateSessionStatus: (sessionId, status) => {
    set((state) => {
      const session = state.sessions.get(sessionId);
      if (!session) return state;

      const newSessions = new Map(state.sessions);
      newSessions.set(sessionId, { ...session, status });
      return { sessions: newSessions };
    });
  },

  appendOutput: (sessionId, line) => {
    set((state) => {
      const newOutput = new Map(state.output);
      const lines = newOutput.get(sessionId) || [];
      newOutput.set(sessionId, [...lines, line]);
      return { output: newOutput };
    });
  },

  setConnected: (connected) => {
    set({ connected });
  },

  handleEvent: (event) => {
    const { setSession, updateSessionStatus, appendOutput } = get();

    switch (event.type) {
      case 'session:started': {
        const session: Session = {
          id: event.sessionId,
          slot: event.slot,
          status: 'running',
          workingDir: event.workingDir,
          currentCommand: event.command,
          startedAt: new Date(event.timestamp),
        };
        setSession(session);
        break;
      }

      case 'session:output': {
        appendOutput(event.sessionId, event.data);
        break;
      }

      case 'session:checkpoint': {
        updateSessionStatus(event.sessionId, 'waiting_checkpoint');
        break;
      }

      case 'session:completed': {
        set((state) => {
          const session = state.sessions.get(event.sessionId);
          if (!session) return state;

          const newSessions = new Map(state.sessions);
          newSessions.set(event.sessionId, {
            ...session,
            status: 'completed',
            endedAt: new Date(event.timestamp),
          });
          return { sessions: newSessions };
        });
        break;
      }

      case 'session:failed': {
        set((state) => {
          const session = state.sessions.get(event.sessionId);
          if (!session) return state;

          const newSessions = new Map(state.sessions);
          newSessions.set(event.sessionId, {
            ...session,
            status: 'failed',
            endedAt: new Date(event.timestamp),
          });
          return { sessions: newSessions };
        });
        break;
      }
    }
  },

  handleInitialState: (sessions) => {
    set((state) => {
      const newSessions = new Map(state.sessions);
      for (const summary of sessions) {
        const session: Session = {
          id: summary.id,
          slot: summary.slot,
          status: summary.status,
          workingDir: summary.workingDir,
          startedAt: new Date(summary.startedAt),
        };
        newSessions.set(session.id, session);
      }
      return { sessions: newSessions };
    });
  },

  clearOutput: (sessionId) => {
    set((state) => {
      const newOutput = new Map(state.output);
      newOutput.delete(sessionId);
      return { output: newOutput };
    });
  },
}));
