import type { Session } from '@gsd/core';
import type { PersistentSessionManager } from '@gsd/session-manager';

import { FastifyServer, type FastifyServerOptions } from './http-server.js';
import { McpHttpHandler } from './mcp-http-handler.js';
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
  private readonly mcpHandler: McpHttpHandler;
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

    // Create MCP HTTP handler for Streamable HTTP transport
    this.mcpHandler = new McpHttpHandler(this.manager);

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
   * Registers MCP HTTP handler routes.
   * Must be called before start().
   */
  private registerMcpHandler(): void {
    this.mcpHandler.register(this.httpServer.app);
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

    // POST /api/sessions/:sessionId/resize - resize a session's PTY
    this.httpServer.app.post<{
      Params: { sessionId: string };
      Body: { cols: number; rows: number };
    }>('/api/sessions/:sessionId/resize', async (request, reply) => {
      const { sessionId } = request.params;
      const { cols, rows } = request.body;

      if (!cols || !rows || typeof cols !== 'number' || typeof rows !== 'number') {
        return reply.status(400).send({ error: 'cols and rows are required numbers' });
      }

      const success = this.manager.resize(sessionId, cols, rows);

      if (!success) {
        return reply.status(404).send({ error: `Session not found: ${sessionId}` });
      }

      return { success: true, sessionId, cols, rows };
    });

    // GET /api/sessions/:sessionId/output - get session output (for debugging)
    this.httpServer.app.get<{
      Params: { sessionId: string };
      Querystring: { lines?: string };
    }>('/api/sessions/:sessionId/output', async (request, reply) => {
      const { sessionId } = request.params;
      const lines = parseInt(request.query.lines ?? '100', 10);

      const output = this.manager.getOutput(sessionId);

      if (output.length === 0) {
        // Check if session exists
        const session = this.manager.getSession(sessionId);
        if (!session) {
          return reply.status(404).send({ error: `Session not found: ${sessionId}` });
        }
      }

      // Join output and return last N lines
      const fullOutput = output.join('');
      const outputLines = fullOutput.split('\n');
      const lastLines = outputLines.slice(-lines).join('\n');

      return {
        sessionId,
        totalLines: outputLines.length,
        requestedLines: lines,
        output: lastLines,
      };
    });

    // GET /api/projects - list active projects grouped by working directory
    this.httpServer.app.get('/api/projects', async () => {
      const sessions = this.manager.listSessions();

      // Group sessions by workingDir
      const projectMap = new Map<
        string,
        {
          path: string;
          activeSessions: number;
          runningSessions: number;
          sessions: Array<{
            id: string;
            slot: number;
            status: string;
            command: string | undefined;
          }>;
        }
      >();

      for (const session of sessions) {
        const path = session.workingDir;
        const existing = projectMap.get(path);

        const sessionInfo = {
          id: session.id,
          slot: session.slot,
          status: session.status,
          command: session.currentCommand,
        };

        if (existing) {
          existing.activeSessions++;
          if (session.status === 'running' || session.status === 'waiting_checkpoint') {
            existing.runningSessions++;
          }
          existing.sessions.push(sessionInfo);
        } else {
          projectMap.set(path, {
            path,
            activeSessions: 1,
            runningSessions:
              session.status === 'running' || session.status === 'waiting_checkpoint' ? 1 : 0,
            sessions: [sessionInfo],
          });
        }
      }

      return {
        projects: Array.from(projectMap.values()),
        totalProjects: projectMap.size,
        totalSessions: sessions.length,
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
   * Registers WebSocket and MCP handler before starting HTTP server.
   */
  async start(): Promise<void> {
    // Register MCP HTTP handler routes
    this.registerMcpHandler();
    // Register WebSocket plugin (must be before listen)
    await this.registerWebSocket();
    await this.httpServer.start();
  }

  /**
   * Stops the server gracefully.
   */
  async stop(): Promise<void> {
    // Close all MCP sessions first
    await this.mcpHandler.closeAll();
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
