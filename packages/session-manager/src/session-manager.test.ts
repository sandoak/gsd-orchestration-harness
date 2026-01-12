import { setTimeout } from 'node:timers';

import type { SessionStartedEvent, SessionCompletedEvent, SessionOutputEvent } from '@gsd/core';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { SessionManager } from './session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    // Use /bin/sh as executable for testing (not actual claude CLI)
    manager = new SessionManager({ executable: '/bin/sh' });
  });

  afterEach(async () => {
    // Clean up any remaining sessions
    const sessions = manager.listSessions();
    for (const session of sessions) {
      await manager.terminate(session.id);
    }
  });

  describe('spawn()', () => {
    it('assigns available slot and returns session', async () => {
      const session = await manager.spawn('/tmp', '-c echo test');

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.slot).toBeGreaterThanOrEqual(1);
      expect(session.slot).toBeLessThanOrEqual(3);
      expect(session.status).toBe('running');
      expect(session.workingDir).toBe('/tmp');
      expect(session.startedAt).toBeInstanceOf(Date);
    });

    it('emits session:started event', async () => {
      const startedEvents: SessionStartedEvent[] = [];
      manager.on('session:started', (event) => {
        startedEvents.push(event);
      });

      const session = await manager.spawn('/tmp', '-c echo hello');

      expect(startedEvents.length).toBe(1);
      expect(startedEvents[0]).toBeDefined();
      expect(startedEvents[0]!.type).toBe('session:started');
      expect(startedEvents[0]!.sessionId).toBe(session.id);
      expect(startedEvents[0]!.slot).toBe(session.slot);
      expect(startedEvents[0]!.workingDir).toBe('/tmp');
      expect(startedEvents[0]!.timestamp).toBeInstanceOf(Date);
    });

    it('captures stdout in output buffer', async () => {
      const outputEvents: SessionOutputEvent[] = [];
      manager.on('session:output', (event) => {
        outputEvents.push(event);
      });

      const session = await manager.spawn('/tmp', '-c "echo test_output"');

      // Wait for process to complete
      await new Promise<void>((resolve) => {
        manager.on('session:completed', (event) => {
          if (event.sessionId === session.id) {
            resolve();
          }
        });
        // Timeout fallback
        setTimeout(() => resolve(), 3000);
      });

      // Verify output was captured
      const sessionOutput = outputEvents.filter((e) => e.sessionId === session.id);
      expect(sessionOutput.length).toBeGreaterThan(0);
      const combinedOutput = sessionOutput.map((e) => e.data).join('');
      expect(combinedOutput).toContain('test_output');
    });

    it('emits session:completed on process exit', async () => {
      // Set up event listener BEFORE spawning
      const completedPromise = new Promise<SessionCompletedEvent>((resolve, reject) => {
        manager.on('session:completed', (event) => {
          resolve(event);
        });
        manager.on('session:failed', (event) => {
          reject(new Error(`Session failed: ${event.error}`));
        });
      });

      const session = await manager.spawn('/tmp', '-c "echo done"');

      // Wait for completion with timeout
      const completedEvent = await Promise.race([
        completedPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for completion')), 10000)
        ),
      ]);

      expect(completedEvent.type).toBe('session:completed');
      expect(completedEvent.sessionId).toBe(session.id);
      expect(completedEvent.exitCode).toBe(0);
    }, 15000);

    it('throws when all slots occupied', async () => {
      // Spawn 3 sessions with long-running commands
      await manager.spawn('/tmp', '-c "sleep 10"');
      await manager.spawn('/tmp', '-c "sleep 10"');
      await manager.spawn('/tmp', '-c "sleep 10"');

      // Fourth spawn should throw
      await expect(manager.spawn('/tmp', '-c "echo fail"')).rejects.toThrow(
        'All 3 session slots are occupied'
      );
    });
  });

  describe('terminate()', () => {
    it('kills process and frees slot', async () => {
      // Spawn a long-running process
      const session = await manager.spawn('/tmp', '-c "sleep 30"');
      expect(manager.availableSlotsCount).toBe(2);

      // Terminate it
      await manager.terminate(session.id);

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Slot should be freed
      expect(manager.availableSlotsCount).toBe(3);

      // Should be able to spawn a new session
      const newSession = await manager.spawn('/tmp', '-c "echo new"');
      expect(newSession).toBeDefined();
    });
  });

  describe('listSessions()', () => {
    it('returns all active sessions', async () => {
      // Spawn 2 long-running sessions
      await manager.spawn('/tmp', '-c "sleep 10"');
      await manager.spawn('/tmp', '-c "sleep 10"');

      const sessions = manager.listSessions();

      expect(sessions.length).toBe(2);
      expect(sessions[0]!.status).toBe('running');
      expect(sessions[1]!.status).toBe('running');
    });
  });

  describe('getSession()', () => {
    it('returns undefined for unknown ID', () => {
      const session = manager.getSession('nonexistent-id');
      expect(session).toBeUndefined();
    });

    it('returns session for valid ID', async () => {
      const spawned = await manager.spawn('/tmp', '-c "sleep 5"');
      const retrieved = manager.getSession(spawned.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(spawned.id);
      expect(retrieved!.slot).toBe(spawned.slot);
    });
  });
});
