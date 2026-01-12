/**
 * HTTP Streamable MCP Handler
 *
 * Implements the MCP Streamable HTTP transport specification for the web server.
 * This allows multiple Claude Code clients to connect to the same harness instance
 * via HTTP instead of stdio.
 *
 * Each MCP session gets its own transport and server instance, but they all share
 * the same PersistentSessionManager.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  registerEndSessionTool,
  registerGetCheckpointTool,
  registerGetOutputTool,
  registerGetStateTool,
  registerListSessionsTool,
  registerRespondCheckpointTool,
  registerSetExecutionStateTool,
  registerStartSessionTool,
  registerSyncProjectStateTool,
  registerWaitForStateChangeTool,
} from '@gsd/mcp-server';
import type { PersistentSessionManager } from '@gsd/session-manager';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * MCP server version.
 */
const SERVER_VERSION = '0.1.0';

/**
 * Represents an active MCP session with its transport and server.
 */
interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  createdAt: Date;
}

/**
 * Creates a new MCP server instance with all tools registered.
 */
function createMcpServer(manager: PersistentSessionManager): McpServer {
  const server = new McpServer(
    {
      name: 'gsd-harness',
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all tools
  registerStartSessionTool(server, manager);
  registerListSessionsTool(server, manager);
  registerEndSessionTool(server, manager);
  registerGetOutputTool(server, manager);
  registerGetStateTool(server, manager);
  registerGetCheckpointTool(server, manager);
  registerRespondCheckpointTool(server, manager);
  registerSetExecutionStateTool(server);
  registerSyncProjectStateTool(server, manager.orchestrationStore);
  registerWaitForStateChangeTool(server, manager);

  return server;
}

/**
 * Checks if the request body is an MCP initialization request.
 */
function isInitializeRequest(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return obj.method === 'initialize';
}

/**
 * MCP HTTP Handler manages HTTP Streamable MCP transport sessions.
 *
 * Usage:
 * 1. Create handler with manager instance
 * 2. Register routes on Fastify instance
 * 3. Handler manages MCP sessions automatically
 */
export class McpHttpHandler {
  private readonly manager: PersistentSessionManager;
  private readonly sessions = new Map<string, McpSession>();

  constructor(manager: PersistentSessionManager) {
    this.manager = manager;
  }

  /**
   * Registers MCP routes on the Fastify instance.
   * Call this before starting the server.
   */
  register(app: FastifyInstance): void {
    // Configure raw body for MCP endpoint
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    });

    // POST /mcp - Main MCP request handler
    app.post('/mcp', {
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        await this.handlePost(request, reply);
      },
    });

    // GET /mcp - SSE stream for server-initiated messages
    app.get('/mcp', {
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        await this.handleGet(request, reply);
      },
    });

    // DELETE /mcp - Session termination
    app.delete('/mcp', {
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        await this.handleDelete(request, reply);
      },
    });
  }

  /**
   * Handles POST requests (MCP messages).
   */
  private async handlePost(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    const body = request.body;

    try {
      let session: McpSession | undefined;

      if (sessionId && this.sessions.has(sessionId)) {
        // Reuse existing session
        session = this.sessions.get(sessionId);
      } else if (!sessionId && isInitializeRequest(body)) {
        // New initialization request - create new session
        session = await this.createSession();
      } else {
        // Invalid request
        await reply.status(400).send({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      if (!session) {
        await reply.status(500).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error: Session not found',
          },
          id: null,
        });
        return;
      }

      // Handle the request using raw Node.js objects
      // Fastify provides access to raw req/res via request.raw and reply.raw
      await session.transport.handleRequest(
        request.raw as IncomingMessage,
        reply.raw as ServerResponse,
        body
      );

      // Don't let Fastify send a response - transport handles it
      reply.hijack();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[mcp-http] Error handling MCP POST request:', error);
      if (!reply.sent) {
        await reply.status(500).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  }

  /**
   * Handles GET requests (SSE streams).
   */
  private async handleGet(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !this.sessions.has(sessionId)) {
      await reply.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = this.sessions.get(sessionId)!;

    try {
      await session.transport.handleRequest(
        request.raw as IncomingMessage,
        reply.raw as ServerResponse
      );
      reply.hijack();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[mcp-http] Error handling MCP GET request:', error);
      if (!reply.sent) {
        await reply.status(500).send('Error establishing SSE stream');
      }
    }
  }

  /**
   * Handles DELETE requests (session termination).
   */
  private async handleDelete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !this.sessions.has(sessionId)) {
      await reply.status(400).send('Invalid or missing session ID');
      return;
    }

    const session = this.sessions.get(sessionId)!;

    try {
      await session.transport.handleRequest(
        request.raw as IncomingMessage,
        reply.raw as ServerResponse
      );
      reply.hijack();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[mcp-http] Error handling MCP DELETE request:', error);
      if (!reply.sent) {
        await reply.status(500).send('Error processing session termination');
      }
    }
  }

  /**
   * Creates a new MCP session with transport and server.
   */
  private async createSession(): Promise<McpSession> {
    const server = createMcpServer(this.manager);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: (): string => randomUUID(),
      onsessioninitialized: (sessionId: string): void => {
        // eslint-disable-next-line no-console
        console.error(`[mcp-http] Session initialized: ${sessionId}`);
        // Store session once ID is assigned
        const session: McpSession = {
          transport,
          server,
          createdAt: new Date(),
        };
        this.sessions.set(sessionId, session);
      },
    });

    // Set up cleanup on close
    transport.onclose = (): void => {
      const sid = transport.sessionId;
      if (sid && this.sessions.has(sid)) {
        // eslint-disable-next-line no-console
        console.error(`[mcp-http] Session closed: ${sid}`);
        this.sessions.delete(sid);
      }
    };

    // Connect server to transport
    await server.connect(transport);

    // Return temporary session object (will be stored properly via onsessioninitialized)
    return {
      transport,
      server,
      createdAt: new Date(),
    };
  }

  /**
   * Closes all active sessions.
   */
  async closeAll(): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      try {
        // eslint-disable-next-line no-console
        console.error(`[mcp-http] Closing session: ${sessionId}`);
        await session.transport.close();
        await session.server.close();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[mcp-http] Error closing session ${sessionId}:`, error);
      }
    }
    this.sessions.clear();
  }

  /**
   * Returns the number of active MCP sessions.
   */
  get sessionCount(): number {
    return this.sessions.size;
  }
}
