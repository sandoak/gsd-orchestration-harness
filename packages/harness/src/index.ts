#!/usr/bin/env node
/**
 * GSD Orchestration Harness - Unified Entry Point
 *
 * This is the main entry point that starts the web dashboard with integrated
 * HTTP Streamable MCP support.
 *
 * The harness enables:
 * - Claude Code to call MCP tools via HTTP Streamable transport (http://localhost:3333/mcp)
 * - Multiple Claude Code clients to connect simultaneously
 * - Humans to monitor sessions via the web dashboard (http://localhost:3333)
 * - Real-time session event streaming via WebSocket (/ws)
 */

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
 * Logs a message to stderr.
 */
function log(message: string): void {
  // eslint-disable-next-line no-console -- CLI output
  console.error(`[gsd-harness] ${message}`);
}

/**
 * Main entry point - creates shared manager and starts web server with HTTP MCP.
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

  // Create web server (HTTP + WebSocket + MCP HTTP transport)
  const port = parseInt(process.env.GSD_HARNESS_PORT ?? String(DEFAULT_PORT), 10);
  const webServer = new HarnessServer({
    manager,
    port,
  });

  // Track shutdown state
  let isShuttingDown = false;

  /**
   * Handles graceful shutdown.
   */
  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    log('Shutting down...');

    try {
      // Stop web server (includes MCP HTTP sessions)
      await webServer.stop();
      log('Web server stopped');

      // Close session manager
      await manager.close();
      log('Session manager closed');

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
    // Start web server (includes HTTP MCP endpoint at /mcp)
    await webServer.start();
    log(`Web dashboard running at http://localhost:${port}`);
    log(`MCP HTTP endpoint at http://localhost:${port}/mcp`);
    log(`WebSocket endpoint at ws://localhost:${port}/ws`);
    log('Ready for connections');

    // Keep the process running
    await new Promise(() => {
      // Never resolves - keeps process alive until shutdown signal
    });
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
