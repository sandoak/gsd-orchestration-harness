#!/usr/bin/env node
/**
 * GSD Orchestration Harness - Unified Entry Point
 *
 * This is the main entry point that starts both the MCP server and web dashboard
 * with a shared PersistentSessionManager instance.
 *
 * The harness enables:
 * - Claude Code to call MCP tools via stdio
 * - Humans to monitor sessions via the web dashboard (http://localhost:3333)
 * - Real-time session event streaming via WebSocket (/ws)
 */

import { GsdMcpServer } from '@gsd/mcp-server';
import { PersistentSessionManager } from '@gsd/session-manager';
import { HarnessServer } from '@gsd/web-server';

/**
 * Default port for the web dashboard.
 */
const DEFAULT_PORT = 3333;

/**
 * Environment variable set in child sessions to prevent harness from starting.
 * When Claude CLI is spawned by the harness, it inherits .mcp.json which includes
 * gsd-harness. Without this check, the child would try to start another harness
 * instance, causing port conflicts and failures.
 */
const HARNESS_CHILD_ENV = 'GSD_HARNESS_CHILD';

/**
 * Logs a message to stderr to avoid interfering with MCP stdout communication.
 */
function log(message: string): void {
  // eslint-disable-next-line no-console -- CLI output must go to stderr
  console.error(`[gsd-harness] ${message}`);
}

/**
 * Main entry point - creates shared manager and starts both servers.
 */
async function main(): Promise<void> {
  // Skip initialization if running as a child session
  // Child sessions inherit .mcp.json but shouldn't start their own harness
  if (process.env[HARNESS_CHILD_ENV] === '1') {
    log('Running as child session - harness disabled (parent harness handles orchestration)');
    // Exit cleanly - MCP will see this as server unavailable, which is fine
    // The child Claude session doesn't need harness tools
    process.exit(0);
  }

  log('Starting GSD Orchestration Harness...');

  // Create single shared session manager instance
  const manager = new PersistentSessionManager();

  // Log recovery results (orphaned session cleanup)
  manager.on('recovery:complete', (result) => {
    if (result.orphanedCount > 0) {
      log(`Recovery: Found ${result.orphanedCount} orphaned session(s)`);
      if (result.killedPids.length > 0) {
        log(
          `Recovery: Killed ${result.killedPids.length} orphaned process(es): ${result.killedPids.join(', ')}`
        );
      }
      log(`Recovery: Marked sessions as failed: ${result.markedFailed.join(', ')}`);
    }
  });

  log('Session manager initialized');

  // Create web dashboard server (HTTP + WebSocket)
  const port = parseInt(process.env.GSD_HARNESS_PORT ?? String(DEFAULT_PORT), 10);
  const webServer = new HarnessServer({
    manager,
    port,
  });

  // Create MCP server (stdio transport)
  const mcpServer = new GsdMcpServer(manager);

  // Track shutdown state
  let isShuttingDown = false;

  /**
   * Handles graceful shutdown of both servers.
   */
  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    log('Shutting down...');

    try {
      // Stop web server first (stops accepting new connections)
      await webServer.stop();
      log('Web server stopped');

      // Close MCP server (also closes the session manager)
      await mcpServer.close();
      log('MCP server stopped');

      log('Shutdown complete');
      process.exit(0);
    } catch (error) {
      log(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  };

  // Register signal handlers for graceful shutdown
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  try {
    // Start web server first
    await webServer.start();
    log(`Web dashboard running at http://localhost:${port}`);
    log(`WebSocket endpoint at ws://localhost:${port}/ws`);

    // Start MCP server (this blocks waiting for MCP messages on stdin)
    log('MCP server ready on stdio');
    await mcpServer.start();
  } catch (error) {
    log(`Failed to start harness: ${error instanceof Error ? error.message : String(error)}`);
    await shutdown();
  }
}

// Run main function
main().catch((error: unknown) => {
  log(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
