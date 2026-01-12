#!/usr/bin/env node
/**
 * GSD MCP Server - Entry Point
 *
 * This is the CLI entry point for the MCP server.
 * It can be run directly or via the gsd-mcp-server binary.
 */

import { PersistentSessionManager } from '@gsd/session-manager';

import { GsdMcpServer } from './server.js';

// Export GsdMcpServer for testing and programmatic use
export { GsdMcpServer } from './server.js';

/**
 * Main entry point - creates manager and server, handles shutdown.
 */
async function main(): Promise<void> {
  // Create session manager with default options
  const manager = new PersistentSessionManager();

  // Create and start MCP server
  const server = new GsdMcpServer(manager);

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the server - this will block waiting for MCP messages
  await server.start();
}

// Run main function
main().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- CLI error output
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
