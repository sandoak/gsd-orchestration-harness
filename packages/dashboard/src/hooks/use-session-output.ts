import { useRef, useSyncExternalStore } from 'react';

import { useSessionStore } from '../store/session-store';

interface SessionOutputResult {
  output: string[];
  newLines: string[];
  lastIndex: number;
}

/**
 * Hook to subscribe to session output from the Zustand store.
 * Tracks the last read index to provide only new lines since last check.
 *
 * @param sessionId - The session ID to subscribe to
 * @returns Object containing full output array, new lines since last call, and last index
 */
export function useSessionOutput(sessionId: string): SessionOutputResult {
  const lastWrittenIndexRef = useRef(0);

  // Subscribe to the output for this specific session
  const output = useSyncExternalStore(
    (callback) => {
      return useSessionStore.subscribe((state, prevState) => {
        const current = state.output.get(sessionId);
        const previous = prevState.output.get(sessionId);
        if (current !== previous) {
          callback();
        }
      });
    },
    () => useSessionStore.getState().output.get(sessionId) ?? [],
    () => [] // Server snapshot
  );

  // Calculate new lines since last index
  const lastIndex = lastWrittenIndexRef.current;
  const newLines = output.slice(lastIndex);

  // Update the ref for next render
  if (output.length > lastWrittenIndexRef.current) {
    lastWrittenIndexRef.current = output.length;
  }

  return {
    output,
    newLines,
    lastIndex,
  };
}
