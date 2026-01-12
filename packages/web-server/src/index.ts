// Primary API - HarnessServer integrates session manager with WebSocket streaming
export { HarnessServer, type HarnessServerOptions } from './harness-server.js';

// HTTP server (for testing/advanced use)
export { FastifyServer, type FastifyServerOptions } from './http-server.js';

// MCP HTTP handler (for testing/advanced use)
export { McpHttpHandler } from './mcp-http-handler.js';

// WebSocket server (for testing/advanced use)
export { WsServer, type WsServerOptions, type GetSessionsCallback } from './ws-server.js';

// Message types
export type {
  SessionEventMessage,
  InitialStateMessage,
  SessionSummary,
  WsMessage,
} from './types.js';
