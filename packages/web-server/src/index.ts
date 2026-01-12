// Primary API - FastifyServer for HTTP
export { FastifyServer, type FastifyServerOptions } from './http-server.js';

// WebSocket server
export { WsServer, type WsServerOptions, type GetSessionsCallback } from './ws-server.js';

// Message types
export type {
  SessionEventMessage,
  InitialStateMessage,
  SessionSummary,
  WsMessage,
} from './types.js';
