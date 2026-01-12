import websocket, { type WebSocket } from '@fastify/websocket';
import type { Session, SessionEvent } from '@gsd/core';
import type { FastifyInstance } from 'fastify';

import type { InitialStateMessage, SessionSummary, WsMessage } from './types.js';

/**
 * Callback to get current sessions for initial state message.
 */
export type GetSessionsCallback = () => Session[];

export interface WsServerOptions {
  /**
   * Callback to get current sessions when a client connects.
   * Used to send initial state.
   */
  getSessions?: GetSessionsCallback;
}

/**
 * WsServer manages WebSocket connections and broadcasts session events.
 *
 * It registers @fastify/websocket on the /ws path and maintains
 * a set of active connections for broadcasting.
 */
export class WsServer {
  private connections: Set<WebSocket> = new Set();
  private getSessions: GetSessionsCallback;

  constructor(options?: WsServerOptions) {
    this.getSessions = options?.getSessions ?? ((): Session[] => []);
  }

  /**
   * Registers WebSocket support on a Fastify instance.
   *
   * @param app - The Fastify instance to register on
   */
  async register(app: FastifyInstance): Promise<void> {
    // Register the websocket plugin
    await app.register(websocket);

    // Register the /ws route
    app.get('/ws', { websocket: true }, (socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handles a new WebSocket connection.
   */
  private handleConnection(socket: WebSocket): void {
    // Add to active connections
    this.connections.add(socket);

    // Send initial state
    const sessions = this.getSessions();
    const initialState: InitialStateMessage = {
      type: 'initial-state',
      sessions: sessions.map(this.toSessionSummary),
    };
    this.send(socket, initialState);

    // Handle disconnection
    socket.on('close', () => {
      this.connections.delete(socket);
    });

    socket.on('error', () => {
      this.connections.delete(socket);
    });
  }

  /**
   * Converts a Session to a SessionSummary for initial state.
   */
  private toSessionSummary(session: Session): SessionSummary {
    return {
      id: session.id,
      status: session.status,
      workingDir: session.workingDir,
      slot: session.slot,
      startedAt: session.startedAt,
    };
  }

  /**
   * Broadcasts a session event to all connected clients.
   *
   * @param event - The session event to broadcast
   */
  broadcast(event: SessionEvent): void {
    const message = JSON.stringify(event);
    for (const socket of this.connections) {
      if (socket.readyState === 1) {
        // WebSocket.OPEN
        socket.send(message);
      }
    }
  }

  /**
   * Sends a message to a specific WebSocket connection.
   */
  private send(socket: WebSocket, message: WsMessage): void {
    if (socket.readyState === 1) {
      // WebSocket.OPEN
      socket.send(JSON.stringify(message));
    }
  }

  /**
   * Returns the number of active connections.
   */
  get connectionCount(): number {
    return this.connections.size;
  }
}
