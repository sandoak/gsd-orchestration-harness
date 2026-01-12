import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';

import type { SessionEvent } from '@gsd/core';
import { PersistentSessionManager } from '@gsd/session-manager';
import { HarnessServer } from '@gsd/web-server';
import WebSocket from 'ws';

/**
 * Test harness context containing all components for integration testing.
 */
export interface TestHarness {
  /** Session manager with temp database */
  manager: PersistentSessionManager;
  /** Web server instance */
  server: HarnessServer;
  /** Port the server is running on */
  port: number;
  /** Base URL for HTTP requests */
  baseUrl: string;
  /** WebSocket URL */
  wsUrl: string;
  /** Temp directory for this test */
  tempDir: string;
  /** Path to temp database */
  dbPath: string;
}

/**
 * Creates an isolated test harness with temp database and random port.
 * Each test gets its own harness to avoid conflicts.
 *
 * @param mockScript - Optional path to mock executable script (instead of Claude CLI)
 * @returns Test harness ready for integration testing
 */
export async function createTestHarness(mockScript?: string): Promise<TestHarness> {
  // Create unique temp directory for this test
  const tempDir = join(tmpdir(), `gsd-harness-test-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });

  // Create temp database path
  const dbPath = join(tempDir, 'test-sessions.db');

  // Use random port (0 = OS assigns available port)
  const port = 0;

  // Create manager with temp DB and mock executable if provided
  const manager = new PersistentSessionManager({
    dbPath,
    autoRecover: false, // Skip recovery for tests
    executable: mockScript ?? '/bin/sh', // Default to /bin/sh for basic testing
  });

  // Create server
  const server = new HarnessServer({
    manager,
    port,
    host: '127.0.0.1',
  });

  // Start server to get assigned port
  await server.start();

  // Extract port from address (format: http://127.0.0.1:XXXX)
  const addressMatch = server.address.match(/:(\d+)$/);
  if (!addressMatch) {
    throw new Error(`Failed to parse port from address: ${server.address}`);
  }
  const actualPort = parseInt(addressMatch[1]!, 10);

  return {
    manager,
    server,
    port: actualPort,
    baseUrl: `http://127.0.0.1:${actualPort}`,
    wsUrl: `ws://127.0.0.1:${actualPort}/ws`,
    tempDir,
    dbPath,
  };
}

/**
 * Cleans up a test harness, stopping server and removing temp files.
 *
 * @param harness - The test harness to clean up
 */
export async function cleanupTestHarness(harness: TestHarness): Promise<void> {
  try {
    // Stop server (also terminates sessions)
    await harness.server.stop();
  } catch {
    // Ignore errors during cleanup
  }

  try {
    // Close manager (closes DB connection)
    await harness.manager.close();
  } catch {
    // Ignore errors during cleanup
  }

  try {
    // Remove temp directory
    rmSync(harness.tempDir, { recursive: true, force: true });
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * WebSocket connection result.
 */
export interface WsConnection {
  /** WebSocket instance */
  ws: WebSocket;
  /** Initial state received on connection */
  initialState: { sessions: unknown[] };
  /** All received events */
  events: SessionEvent[];
  /** Close the WebSocket */
  close: () => void;
  /** Wait for next event of specified type */
  waitForEvent: <T extends SessionEvent['type']>(
    type: T,
    timeout?: number
  ) => Promise<Extract<SessionEvent, { type: T }>>;
}

/**
 * Connects to WebSocket and returns connection handle.
 * Resolves when connection is open and initial state received.
 *
 * @param wsUrl - WebSocket URL to connect to
 * @param timeout - Connection timeout in ms (default 5000)
 * @returns WebSocket connection handle
 */
export function waitForWebSocket(wsUrl: string, timeout = 5000): Promise<WsConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const events: SessionEvent[] = [];
    let initialState: { sessions: unknown[] } | undefined;
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        ws.close();
        reject(new Error(`WebSocket connection timeout after ${timeout}ms`));
      }
    }, timeout);

    ws.on('error', (error) => {
      if (!resolved) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    ws.on('open', () => {
      // Wait for initial state message
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as {
          type: string;
          sessions?: unknown[];
        };

        if (message.type === 'init') {
          initialState = { sessions: message.sessions ?? [] };
          resolved = true;
          clearTimeout(timeoutId);

          // Create waitForEvent helper
          const waitForEvent = <T extends SessionEvent['type']>(
            type: T,
            eventTimeout = 5000
          ): Promise<Extract<SessionEvent, { type: T }>> => {
            return new Promise((resolveEvent, rejectEvent) => {
              // Check existing events first
              const existing = events.find((e) => e.type === type);
              if (existing) {
                resolveEvent(existing as Extract<SessionEvent, { type: T }>);
                return;
              }

              const eventTimeoutId = setTimeout(() => {
                rejectEvent(new Error(`Timeout waiting for event: ${type}`));
              }, eventTimeout);

              // Set up listener for future events
              const originalOnMessage = ws.onmessage as
                | ((event: WebSocket.MessageEvent) => void)
                | null;
              ws.onmessage = (msgEvent: WebSocket.MessageEvent): void => {
                if (originalOnMessage) {
                  originalOnMessage.call(ws, msgEvent);
                }

                try {
                  const event = JSON.parse(msgEvent.data.toString()) as SessionEvent;
                  if (event.type === type) {
                    clearTimeout(eventTimeoutId);
                    ws.onmessage = originalOnMessage;
                    resolveEvent(event as Extract<SessionEvent, { type: T }>);
                  }
                } catch {
                  // Ignore parse errors
                }
              };
            });
          };

          resolve({
            ws,
            initialState,
            events,
            close: () => ws.close(),
            waitForEvent,
          });
        } else {
          // Store session events
          events.push(message as SessionEvent);
        }
      } catch {
        // Ignore parse errors
      }
    });
  });
}

/**
 * Creates a temporary shell script that outputs controlled data for testing.
 * The script outputs messages and exits after a delay.
 *
 * @param tempDir - Directory to create script in
 * @param options - Script behavior options
 * @returns Path to the created script
 */
export function createMockScript(
  tempDir: string,
  options: {
    /** Output lines to emit */
    output?: string[];
    /** Delay in ms before each output line */
    delayPerLine?: number;
    /** Exit code (default 0) */
    exitCode?: number;
  } = {}
): string {
  const { output = ['Hello from mock session'], delayPerLine = 50, exitCode = 0 } = options;

  const scriptPath = join(tempDir, `mock-cli-${randomUUID()}.sh`);

  // Build script content
  const lines: string[] = ['#!/bin/sh', ''];

  for (const line of output) {
    if (delayPerLine > 0) {
      // Sleep in fractional seconds
      const seconds = (delayPerLine / 1000).toFixed(3);
      lines.push(`sleep ${seconds}`);
    }
    // Use printf for exact control over output (no extra newlines)
    lines.push(`printf '%s\\n' '${line.replace(/'/g, "'\"'\"'")}'`);
  }

  if (exitCode !== 0) {
    lines.push(`exit ${exitCode}`);
  }

  writeFileSync(scriptPath, lines.join('\n'), { mode: 0o755 });
  chmodSync(scriptPath, 0o755);

  return scriptPath;
}

/**
 * Removes a mock script created by createMockScript.
 *
 * @param scriptPath - Path to script to remove
 */
export function removeMockScript(scriptPath: string): void {
  try {
    unlinkSync(scriptPath);
  } catch {
    // Ignore errors during cleanup
  }
}
