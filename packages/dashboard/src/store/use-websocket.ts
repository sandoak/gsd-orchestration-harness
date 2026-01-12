import { useEffect, useRef } from 'react';

import type { WsMessage } from '../types';

import { useSessionStore } from './session-store';

const MAX_RECONNECT_DELAY = 10000; // 10 seconds
const INITIAL_RECONNECT_DELAY = 1000; // 1 second

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);

  // Use stable selectors to avoid infinite re-renders
  const setConnected = useSessionStore((state) => state.setConnected);
  const handleEvent = useSessionStore((state) => state.handleEvent);
  const handleInitialState = useSessionStore((state) => state.handleInitialState);

  useEffect(() => {
    const connect = () => {
      // Determine WebSocket URL based on environment
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setConnected(true);
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

        // Fetch initial state from REST API
        try {
          const response = await fetch('/api/sessions');
          if (response.ok) {
            const sessions = await response.json();
            handleInitialState(sessions);
          }
        } catch {
          // Initial state fetch failed, will receive updates via WebSocket
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);

          if (message.type === 'initial-state') {
            handleInitialState(message.sessions);
          } else {
            handleEvent(message);
          }
        } catch {
          // Invalid message, ignore
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;

        // Reconnect with exponential backoff
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_DELAY);
          connect();
        }, reconnectDelayRef.current);
      };

      ws.onerror = () => {
        // Error will trigger onclose, which handles reconnection
      };
    };

    connect();

    return () => {
      // Cleanup on unmount
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [setConnected, handleEvent, handleInitialState]);
}
