#!/usr/bin/env npx tsx
/**
 * Test script to verify parallel session execution.
 * Starts 3 sessions with test commands and monitors output.
 */

import { PersistentSessionManager } from '@gsd/session-manager';

// Use simple echo commands that produce output over time
const TEST_COMMANDS = [
  "-c 'echo Slot1-Start; sleep 1; echo Slot1-Mid; sleep 1; echo Slot1-End'",
  "-c 'echo Slot2-Start; sleep 1; echo Slot2-Mid; sleep 1; echo Slot2-End'",
  "-c 'echo Slot3-Start; sleep 1; echo Slot3-Mid; sleep 1; echo Slot3-End'",
];

async function main() {
  console.log('Creating session manager with bash executable...');

  // Create manager with bash as executable for testing
  const manager = new PersistentSessionManager({
    // @ts-expect-error - accessing internal option
    executable: 'bash',
  });

  manager.on('recovery:complete', (result) => {
    if (result.orphanedCount > 0) {
      console.log(`Recovery: Found ${result.orphanedCount} orphaned sessions`);
    }
  });

  manager.on('session:started', (event) => {
    console.log(`✓ Session ${event.sessionId.slice(0, 8)} started in slot ${event.slot}`);
  });

  manager.on('session:output', (event) => {
    const output = event.data.trim();
    if (output) {
      console.log(`  [${event.sessionId.slice(0, 8)}] ${output}`);
    }
  });

  manager.on('session:completed', (event) => {
    console.log(`✓ Session ${event.sessionId.slice(0, 8)} completed`);
  });

  manager.on('session:failed', (event) => {
    console.log(`✗ Session ${event.sessionId.slice(0, 8)} failed: ${event.error}`);
  });

  console.log('\nStarting 3 parallel sessions...\n');

  // Start all 3 sessions sequentially to respect spawn lock
  const sessions = [];
  for (const cmd of TEST_COMMANDS) {
    sessions.push(await manager.spawn('/tmp', cmd));
  }

  console.log(`\nStarted ${sessions.length} sessions:`);
  sessions.forEach((s) => {
    console.log(`  - ${s.id.slice(0, 8)} (slot ${s.slot}): ${s.status}`);
  });

  // Wait for all sessions to complete
  console.log('\nWaiting for sessions to complete...\n');

  await new Promise((resolve) => {
    let completedCount = 0;
    const checkComplete = () => {
      completedCount++;
      if (completedCount >= 3) {
        resolve(undefined);
      }
    };

    manager.on('session:completed', checkComplete);
    manager.on('session:failed', checkComplete);

    // Timeout after 30 seconds
    setTimeout(() => {
      console.log('Timeout - forcing completion');
      resolve(undefined);
    }, 30000);
  });

  console.log('\n--- Final Status ---');
  const allSessions = manager.listSessions();
  allSessions.forEach((s) => {
    console.log(`${s.id.slice(0, 8)}: ${s.status} (slot ${s.slot})`);
  });

  console.log('\nClosing manager...');
  await manager.close();
  console.log('Done!');
}

main().catch(console.error);
