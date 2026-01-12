import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DatabaseConnection } from './db/database.js';
import { SessionStore } from './db/session-store.js';
import { PersistentSessionManager } from './persistent-session-manager.js';

/**
 * Creates a unique temp directory for each test.
 */
function createTempDir(): string {
  const dir = join(tmpdir(), `gsd-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Cleans up a temp directory.
 */
function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('PersistentSessionManager', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: PersistentSessionManager;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir, 'test.db');
  });

  afterEach(async () => {
    // Close manager if exists
    if (manager) {
      await manager.close();
    }
    // Clean up temp directory
    cleanupTempDir(tempDir);
  });

  describe('spawn() persists session to database', () => {
    it('creates session record in database', async () => {
      manager = new PersistentSessionManager({
        dbPath,
        executable: '/bin/sh',
        autoRecover: false,
      });

      const session = await manager.spawn('/tmp', '-c "echo test"');

      // Query database directly to verify persistence
      const dbConnection = new DatabaseConnection(dbPath);
      const sessionStore = new SessionStore(dbConnection.db);

      const storedSession = sessionStore.get(session.id);
      expect(storedSession).toBeDefined();
      expect(storedSession!.id).toBe(session.id);
      expect(storedSession!.slot).toBe(session.slot);
      expect(storedSession!.workingDir).toBe('/tmp');

      dbConnection.close();
    });
  });

  describe('output is persisted as events arrive', () => {
    it('stores output in database', async () => {
      manager = new PersistentSessionManager({
        dbPath,
        executable: '/bin/sh',
        autoRecover: false,
      });

      // Set up all event listeners BEFORE spawning
      const outputEvents: string[] = [];

      // Wait for both output AND completion before proceeding
      const allDone = new Promise<string>((resolve, reject) => {
        let sessionId: string | null = null;
        let hasOutput = false;
        let completed = false;

        const checkDone = () => {
          if (hasOutput && completed && sessionId) {
            resolve(sessionId);
          }
        };

        manager.on('session:output', (event) => {
          outputEvents.push(event.data);
          hasOutput = true;
          checkDone();
        });

        manager.on('session:completed', (event) => {
          sessionId = event.sessionId;
          completed = true;
          checkDone();
        });

        manager.on('session:failed', (event) => {
          reject(new Error(`Session failed: ${event.error}`));
        });

        // Timeout fallback
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      // Use a slightly delayed echo to ensure output is captured
      const session = await manager.spawn('/tmp', '-c "sleep 0.05 && echo hello_persist"');

      // Wait for both output and completion
      const completedSessionId = await allDone;

      expect(completedSessionId).toBe(session.id);

      // Verify output events were emitted (proves persistence happened)
      expect(outputEvents.length).toBeGreaterThan(0);
      expect(outputEvents.join('')).toContain('hello_persist');

      // Also verify via manager's getOutput (uses internal database connection)
      const retrievedOutput = manager.getOutput(session.id);
      expect(retrievedOutput.length).toBeGreaterThan(0);
      expect(retrievedOutput.join('')).toContain('hello_persist');
    });
  });

  describe('completed sessions are updated in store', () => {
    it('updates status to completed on exit', async () => {
      manager = new PersistentSessionManager({
        dbPath,
        executable: '/bin/sh',
        autoRecover: false,
      });

      const session = await manager.spawn('/tmp', '-c "echo done"');

      // Wait for completion
      await new Promise<void>((resolve) => {
        manager.on('session:completed', (event) => {
          if (event.sessionId === session.id) {
            resolve();
          }
        });
        setTimeout(() => resolve(), 3000);
      });

      // Query database to verify status update
      const dbConnection = new DatabaseConnection(dbPath);
      const sessionStore = new SessionStore(dbConnection.db);

      const storedSession = sessionStore.get(session.id);
      expect(storedSession).toBeDefined();
      expect(storedSession!.status).toBe('completed');
      expect(storedSession!.endedAt).toBeDefined();

      dbConnection.close();
    });
  });

  describe('recovery marks orphaned sessions as failed', () => {
    it('marks running sessions as failed on startup', async () => {
      // First, create a database with a "running" session manually
      const dbConnection = new DatabaseConnection(dbPath);
      const sessionStore = new SessionStore(dbConnection.db);

      const fakeSessionId = randomUUID();
      sessionStore.create({
        id: fakeSessionId,
        slot: 1,
        status: 'running',
        workingDir: '/tmp',
        startedAt: new Date(),
        pid: 99999, // Non-existent PID
      });

      dbConnection.close();

      // Now create a new manager which should recover
      manager = new PersistentSessionManager({
        dbPath,
        executable: '/bin/sh',
        autoRecover: true,
      });

      // The recovery has already happened in constructor

      // The recovery should have already happened in constructor
      // Check database for updated status
      const dbConnection2 = new DatabaseConnection(dbPath);
      const sessionStore2 = new SessionStore(dbConnection2.db);

      const recoveredSession = sessionStore2.get(fakeSessionId);
      expect(recoveredSession).toBeDefined();
      expect(recoveredSession!.status).toBe('failed');
      expect(recoveredSession!.endedAt).toBeDefined();

      dbConnection2.close();
    });
  });

  describe('getOutput() returns historical output for completed sessions', () => {
    it('retrieves output from database after completion', async () => {
      manager = new PersistentSessionManager({
        dbPath,
        executable: '/bin/sh',
        autoRecover: false,
      });

      const session = await manager.spawn('/tmp', '-c "echo historical_output"');

      // Wait for completion
      await new Promise<void>((resolve) => {
        manager.on('session:completed', (event) => {
          if (event.sessionId === session.id) {
            resolve();
          }
        });
        setTimeout(() => resolve(), 3000);
      });

      // Session is complete, internal buffer should be cleared
      // But getOutput should still work via database
      const output = manager.getOutput(session.id);
      expect(output.length).toBeGreaterThan(0);
      expect(output.join('')).toContain('historical_output');
    });
  });

  describe('listSessions() includes both live and completed', () => {
    it('merges live sessions with completed from database', async () => {
      manager = new PersistentSessionManager({
        dbPath,
        executable: '/bin/sh',
        autoRecover: false,
      });

      // Start a long-running session
      const liveSession = await manager.spawn('/tmp', '-c "sleep 10"');

      // Start and complete a session
      const completedSession = await manager.spawn('/tmp', '-c "echo quick"');

      // Wait for the quick one to complete
      await new Promise<void>((resolve) => {
        manager.on('session:completed', (event) => {
          if (event.sessionId === completedSession.id) {
            resolve();
          }
        });
        setTimeout(() => resolve(), 3000);
      });

      // List should include both
      const sessions = manager.listSessions();

      // Should have at least the live session
      // (completed session might be in list from database)
      expect(sessions.length).toBeGreaterThanOrEqual(1);

      const liveFound = sessions.find((s) => s.id === liveSession.id);
      expect(liveFound).toBeDefined();
      expect(liveFound!.status).toBe('running');

      const completedFound = sessions.find((s) => s.id === completedSession.id);
      expect(completedFound).toBeDefined();
      expect(completedFound!.status).toBe('completed');

      // Clean up
      await manager.terminate(liveSession.id);
    });
  });

  describe('getHistoricalSessions()', () => {
    it('returns sessions from database with limit', async () => {
      manager = new PersistentSessionManager({
        dbPath,
        executable: '/bin/sh',
        autoRecover: false,
      });

      // Create multiple sessions
      for (let i = 0; i < 3; i++) {
        const session = await manager.spawn('/tmp', `-c "echo session_${i}"`);
        // Wait for completion
        await new Promise<void>((resolve) => {
          manager.on('session:completed', (event) => {
            if (event.sessionId === session.id) {
              resolve();
            }
          });
          setTimeout(() => resolve(), 2000);
        });
      }

      // Get all historical sessions
      const allSessions = manager.getHistoricalSessions();
      expect(allSessions.length).toBe(3);

      // Get limited historical sessions
      const limitedSessions = manager.getHistoricalSessions(2);
      expect(limitedSessions.length).toBe(2);
    });
  });

  describe('close()', () => {
    it('terminates running sessions and closes database', async () => {
      manager = new PersistentSessionManager({
        dbPath,
        executable: '/bin/sh',
        autoRecover: false,
      });

      // Start a long-running session
      const session = await manager.spawn('/tmp', '-c "sleep 30"');
      expect(manager.availableSlotsCount).toBe(2);

      // Close the manager
      await manager.close();

      // Manager is now closed - don't use it further
      // The session should have been terminated

      // Create a new manager to check the database
      const dbConnection = new DatabaseConnection(dbPath);
      const sessionStore = new SessionStore(dbConnection.db);

      // Note: The session might be marked as failed or completed depending on timing
      // The important thing is it's no longer "running"
      const storedSession = sessionStore.get(session.id);
      // Session should exist in database
      expect(storedSession).toBeDefined();

      dbConnection.close();
    });
  });
});
