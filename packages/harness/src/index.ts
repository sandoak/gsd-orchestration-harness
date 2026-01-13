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
 *
 * Dev Mode:
 * - When running from a git checkout (not ~/.gsd-harness), dev mode is detected
 * - Dev mode refuses to start if production harness is already running
 * - Override with GSD_DEV_SERVER=true to run a separate dev server
 */

import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { PersistentSessionManager } from '@gsd/session-manager';
import { HarnessServer } from '@gsd/web-server';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default port for the web dashboard.
 */
const DEFAULT_PORT = 3333;

/**
 * Production harness installation directory.
 */
const PRODUCTION_DIR = path.join(os.homedir(), '.gsd-harness');

/**
 * Environment variable set in child sessions to prevent harness from starting.
 * When Claude CLI is spawned by the harness, it inherits .mcp.json which includes
 * gsd-harness. Without this check, the child would try to start another harness
 * instance, causing port conflicts and failures.
 */
const HARNESS_CHILD_ENV = 'GSD_HARNESS_CHILD';

/**
 * Environment variable to force dev server mode.
 */
const DEV_SERVER_ENV = 'GSD_DEV_SERVER';

/**
 * Logs a message to stderr.
 */
function log(message: string): void {
  // eslint-disable-next-line no-console -- CLI output
  console.error(`[gsd-harness] ${message}`);
}

/**
 * Checks if we're running from production install or a dev checkout.
 */
function isDevMode(): boolean {
  // Get the directory containing the running script
  const scriptDir = path.resolve(__dirname, '..', '..', '..');

  // Check if this is the production directory
  const isProduction = scriptDir.startsWith(PRODUCTION_DIR);

  // Also check for .git directory (dev checkout)
  const hasGitDir = fs.existsSync(path.join(scriptDir, '.git'));

  return !isProduction && hasGitDir;
}

/**
 * Checks if production harness is running on the given port.
 */
async function isProductionRunning(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: '/health',
        method: 'GET',
        timeout: 1000,
      },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
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

  const port = parseInt(process.env.GSD_HARNESS_PORT ?? String(DEFAULT_PORT), 10);

  // Dev mode detection
  if (isDevMode()) {
    const forceDevServer = process.env[DEV_SERVER_ENV] === 'true';

    if (!forceDevServer) {
      // Check if production harness is running
      const productionRunning = await isProductionRunning(DEFAULT_PORT);

      if (productionRunning) {
        log('Dev mode detected - production harness is running at :' + DEFAULT_PORT);
        log('');
        log('Your dev changes will be used after:');
        log('  1. Push to GitHub');
        log('  2. Run: ~/.gsd-harness/scripts/setup-machine.sh');
        log('');
        log('To query production harness from dev:');
        log('  curl http://localhost:' + DEFAULT_PORT + '/api/projects');
        log('');
        log('To run a separate dev server (for testing):');
        log('  GSD_DEV_SERVER=true GSD_HARNESS_PORT=3334 node packages/harness/dist/index.js');
        process.exit(0);
      } else {
        // No production harness running - allow dev server to start
        log('Dev mode: No production harness detected, starting dev server...');
      }
    } else {
      log('Dev mode: Forced dev server mode (GSD_DEV_SERVER=true)');
      if (port === DEFAULT_PORT) {
        log('Warning: Using default port ' + DEFAULT_PORT + ' - may conflict with production');
      }
    }
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
