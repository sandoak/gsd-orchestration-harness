import type { Session } from '@gsd/core';
import type { PersistentSessionManager } from '@gsd/session-manager';

import { FastifyServer, type FastifyServerOptions } from './http-server.js';
import { WsServer } from './ws-server.js';

export interface HarnessServerOptions extends FastifyServerOptions {
  /**
   * PersistentSessionManager to wire events from.
   */
  manager: PersistentSessionManager;
}

/**
 * HarnessServer integrates FastifyServer with PersistentSessionManager.
 *
 * This is the primary entry point for the web server component.
 * It:
 * - Creates and manages HTTP server with CORS and health endpoints
 * - Registers WebSocket on /ws for session event streaming
 * - Subscribes to all PersistentSessionManager events and broadcasts them
 * - Provides /api/sessions REST endpoint for session listing
 */
export class HarnessServer {
  private readonly httpServer: FastifyServer;
  private readonly wsServer: WsServer;
  private readonly manager: PersistentSessionManager;

  constructor(options: HarnessServerOptions) {
    this.manager = options.manager;

    // Create HTTP server
    this.httpServer = new FastifyServer({
      port: options.port,
      host: options.host,
    });

    // Create WebSocket server with session provider
    this.wsServer = new WsServer({
      getSessions: (): Session[] => this.manager.listSessions(),
    });

    // Register API routes (sync)
    this.registerApiRoutes();

    // Wire manager events to WebSocket broadcast
    this.wireEvents();
  }

  /**
   * Registers WebSocket support on the HTTP server.
   * Must be called before start().
   */
  private async registerWebSocket(): Promise<void> {
    await this.wsServer.register(this.httpServer.app);
  }

  /**
   * Registers REST API routes.
   */
  private registerApiRoutes(): void {
    // GET /api/sessions - list all sessions with staleness info
    this.httpServer.app.get('/api/sessions', async () => {
      const sessions = this.manager.listSessions();
      const timeout = this.manager.getSessionTimeout();

      return sessions.map((session) => {
        const lastPolledAt = this.manager.getLastPolledAt(session.id);
        const isStale = this.manager.isSessionStale(session.id);

        return {
          ...session,
          lastPolledAt,
          isStale,
          timeoutMs: timeout,
        };
      });
    });

    // GET /api/sessions/stale - get only stale sessions
    this.httpServer.app.get('/api/sessions/stale', async () => {
      const staleIds = this.manager.getStaleSessions();
      return {
        stale: staleIds,
        count: staleIds.length,
        timeoutMs: this.manager.getSessionTimeout(),
      };
    });
  }

  /**
   * Wires PersistentSessionManager events to WebSocket broadcast.
   */
  private wireEvents(): void {
    // Forward all session events to WebSocket clients
    this.manager.on('session:started', (event) => {
      this.wsServer.broadcast(event);
    });

    this.manager.on('session:output', (event) => {
      this.wsServer.broadcast(event);
    });

    this.manager.on('session:completed', (event) => {
      this.wsServer.broadcast(event);
    });

    this.manager.on('session:failed', (event) => {
      this.wsServer.broadcast(event);
    });

    // Note: recovery:complete is not a SessionEvent type,
    // so we don't broadcast it via WebSocket
  }

  /**
   * Starts the server.
   * Registers WebSocket before starting HTTP server.
   */
  async start(): Promise<void> {
    // Register WebSocket plugin (must be before listen)
    await this.registerWebSocket();
    await this.httpServer.start();
  }

  /**
   * Stops the server gracefully.
   */
  async stop(): Promise<void> {
    await this.httpServer.stop();
  }

  /**
   * Returns the server address once running.
   */
  get address(): string {
    return this.httpServer.address;
  }

  /**
   * Returns whether the server is currently running.
   */
  get running(): boolean {
    return this.httpServer.running;
  }

  /**
   * Returns the number of connected WebSocket clients.
   */
  get connectionCount(): number {
    return this.wsServer.connectionCount;
  }
}
