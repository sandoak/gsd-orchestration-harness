/**
 * Integration tests for the GSD Harness.
 *
 * These tests verify that all components work together:
 * - PersistentSessionManager (session spawning, events)
 * - HarnessServer (HTTP + WebSocket)
 * - Event flow from manager → WebSocket clients
 * - REST API consistency with manager state
 */

import { setTimeout } from 'node:timers';

import type { Session } from '@gsd/core';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  createTestHarness,
  cleanupTestHarness,
  waitForWebSocket,
  createMockScript,
  type TestHarness,
} from './test-utils.js';

describe('Harness Integration', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createTestHarness();
  });

  afterEach(async () => {
    await cleanupTestHarness(harness);
  });

  describe('Session lifecycle via shared manager', () => {
    it('sends session:started event to WebSocket on spawn', async () => {
      // Connect WebSocket
      const wsConn = await waitForWebSocket(harness.wsUrl);

      try {
        // Create mock script that outputs and exits
        const script = createMockScript(harness.tempDir, {
          output: ['Hello from session'],
          delayPerLine: 10,
        });

        // Spawn session
        const session = await harness.manager.spawn(harness.tempDir, script);

        // Wait for session:started event
        const startedEvent = await wsConn.waitForEvent('session:started', 5000);

        expect(startedEvent.type).toBe('session:started');
        expect(startedEvent.sessionId).toBe(session.id);
        expect(startedEvent.slot).toBe(session.slot);
        expect(startedEvent.workingDir).toBe(harness.tempDir);
      } finally {
        wsConn.close();
      }
    });

    it('sends session:output events to WebSocket', async () => {
      // Connect WebSocket
      const wsConn = await waitForWebSocket(harness.wsUrl);

      try {
        // Create mock script that outputs specific text
        const script = createMockScript(harness.tempDir, {
          output: ['test_output_line'],
          delayPerLine: 10,
        });

        // Spawn session
        await harness.manager.spawn(harness.tempDir, script);

        // Wait for output event
        const outputEvent = await wsConn.waitForEvent('session:output', 5000);

        expect(outputEvent.type).toBe('session:output');
        expect(outputEvent.data).toContain('test_output_line');
      } finally {
        wsConn.close();
      }
    });

    it('sends session:completed event to WebSocket on process exit', async () => {
      // Connect WebSocket
      const wsConn = await waitForWebSocket(harness.wsUrl);

      try {
        // Create mock script that exits quickly
        const script = createMockScript(harness.tempDir, {
          output: ['Quick exit'],
          delayPerLine: 10,
        });

        // Spawn session
        const session = await harness.manager.spawn(harness.tempDir, script);

        // Wait for completed event
        const completedEvent = await wsConn.waitForEvent('session:completed', 5000);

        expect(completedEvent.type).toBe('session:completed');
        expect(completedEvent.sessionId).toBe(session.id);
        expect(completedEvent.exitCode).toBe(0);
      } finally {
        wsConn.close();
      }
    });
  });

  describe('REST API consistency', () => {
    it('GET /api/sessions returns spawned session', async () => {
      // Create mock script that runs for a bit
      const script = createMockScript(harness.tempDir, {
        output: ['Running...'],
        delayPerLine: 500,
      });

      // Spawn session
      const session = await harness.manager.spawn(harness.tempDir, script);

      // Fetch sessions via REST API
      const response = await fetch(`${harness.baseUrl}/api/sessions`);
      expect(response.ok).toBe(true);

      const sessions = (await response.json()) as Session[];

      // Should include our session
      const found = sessions.find((s) => s.id === session.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe('running');
      expect(found!.slot).toBe(session.slot);
    });

    it('session status matches manager state', async () => {
      // Create mock script that exits quickly
      const script = createMockScript(harness.tempDir, {
        output: ['Done'],
        delayPerLine: 10,
      });

      // Spawn and wait for completion
      const session = await harness.manager.spawn(harness.tempDir, script);

      // Wait for completion event in manager
      await new Promise<void>((resolve) => {
        harness.manager.on('session:completed', (event) => {
          if (event.sessionId === session.id) {
            resolve();
          }
        });
        // Timeout fallback
        setTimeout(resolve, 3000);
      });

      // Small delay to ensure state is updated
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify manager getSession returns completed status
      const managerSession = harness.manager.getSession(session.id);
      expect(managerSession).toBeDefined();
      expect(managerSession!.status).toBe('completed');

      // Verify REST API also returns completed status
      const response = await fetch(`${harness.baseUrl}/api/sessions`);
      const sessions = (await response.json()) as Session[];
      const apiSession = sessions.find((s) => s.id === session.id);
      expect(apiSession).toBeDefined();
      expect(apiSession!.status).toBe('completed');
    });
  });

  describe('Multiple sessions', () => {
    it('handles 2 concurrent sessions', async () => {
      // Create mock scripts
      const script1 = createMockScript(harness.tempDir, {
        output: ['Session 1 output'],
        delayPerLine: 200,
      });
      const script2 = createMockScript(harness.tempDir, {
        output: ['Session 2 output'],
        delayPerLine: 200,
      });

      // Spawn 2 sessions
      const session1 = await harness.manager.spawn(harness.tempDir, script1);
      const session2 = await harness.manager.spawn(harness.tempDir, script2);

      // Both should have different slots
      expect(session1.slot).not.toBe(session2.slot);

      // Connect WebSocket and check initial state
      const wsConn = await waitForWebSocket(harness.wsUrl);

      try {
        // Initial state should have both sessions
        expect(wsConn.initialState.sessions.length).toBeGreaterThanOrEqual(2);
      } finally {
        wsConn.close();
      }

      // REST API should return both
      const response = await fetch(`${harness.baseUrl}/api/sessions`);
      const sessions = (await response.json()) as Session[];

      const found1 = sessions.find((s) => s.id === session1.id);
      const found2 = sessions.find((s) => s.id === session2.id);

      expect(found1).toBeDefined();
      expect(found2).toBeDefined();
    });

    it('WebSocket receives events from all sessions', async () => {
      // Connect WebSocket first
      const wsConn = await waitForWebSocket(harness.wsUrl);

      try {
        // Create mock scripts with identifiable output
        const script1 = createMockScript(harness.tempDir, {
          output: ['MARKER_SESSION_ONE'],
          delayPerLine: 10,
        });
        const script2 = createMockScript(harness.tempDir, {
          output: ['MARKER_SESSION_TWO'],
          delayPerLine: 10,
        });

        // Spawn sessions
        const session1 = await harness.manager.spawn(harness.tempDir, script1);
        const session2 = await harness.manager.spawn(harness.tempDir, script2);

        // Wait for started events from both
        const started1 = await wsConn.waitForEvent('session:started', 5000);
        expect([session1.id, session2.id]).toContain(started1.sessionId);

        // Wait a bit for second started event
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Events array should have started events from both sessions
        const startedEvents = wsConn.events.filter((e) => e.type === 'session:started');
        const startedSessionIds = startedEvents.map((e) => e.sessionId);
        expect(startedSessionIds).toContain(session1.id);
        expect(startedSessionIds).toContain(session2.id);
      } finally {
        wsConn.close();
      }
    });
  });

  describe('WebSocket connection', () => {
    it('receives init message with current sessions on connect', async () => {
      // Spawn a session first
      const script = createMockScript(harness.tempDir, {
        output: ['Running...'],
        delayPerLine: 1000,
      });
      const session = await harness.manager.spawn(harness.tempDir, script);

      // Connect WebSocket after session exists
      const wsConn = await waitForWebSocket(harness.wsUrl);

      try {
        // Initial state should include the session
        expect(wsConn.initialState.sessions.length).toBeGreaterThanOrEqual(1);
        const sessionInState = (wsConn.initialState.sessions as Session[]).find(
          (s) => s.id === session.id
        );
        expect(sessionInState).toBeDefined();
      } finally {
        wsConn.close();
      }
    });
  });
});
