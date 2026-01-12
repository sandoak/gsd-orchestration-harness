#!/usr/bin/env npx tsx
/**
 * Test script to verify concurrent Claude CLI sessions.
 *
 * This script:
 * 1. Starts the web dashboard server
 * 2. Spawns 3 concurrent Claude sessions
 * 3. Monitors their output in real-time
 *
 * Watch the dashboard at http://localhost:3333 while this runs.
 */

import { PersistentSessionManager } from '@gsd/session-manager';
import { HarnessServer } from '@gsd/web-server';

const PORT = 3333;

// Different prompts for each slot
const PROMPTS = [
  '-p "Count from 1 to 5, one number per line. Be brief."',
  '-p "List 3 colors. Be brief, one per line."',
  '-p "Name 3 planets. Be brief, one per line."',
];

async function main() {
  console.log('Starting concurrent Claude session test...');

  // Create shared session manager
  const manager = new PersistentSessionManager();

  manager.on('recovery:complete', (result) => {
    if (result.orphanedCount > 0) {
      console.log('Recovery: Found ' + result.orphanedCount + ' orphaned sessions');
    }
  });

  // Create and start web server
  const webServer = new HarnessServer({
    manager,
    port: PORT,
  });

  await webServer.start();
  console.log('\n Dashboard running at http://localhost:' + PORT);
  console.log('Open the dashboard in a browser to watch the sessions!\n');

  // Set up event listeners
  manager.on('session:started', (event) => {
    console.log('Session ' + event.sessionId.slice(0, 8) + ' started in slot ' + event.slot);
  });

  manager.on('session:output', (event) => {
    const output = event.data.trim();
    if (output && output.length > 0) {
      const displayOutput = output.length > 80 ? output.slice(0, 80) + '...' : output;
      console.log('  [slot ' + event.sessionId.slice(0, 8) + '] ' + displayOutput);
    }
  });

  manager.on('session:completed', (event) => {
    console.log('Session ' + event.sessionId.slice(0, 8) + ' completed');
  });

  manager.on('session:failed', (event) => {
    console.log('Session ' + event.sessionId.slice(0, 8) + ' failed: ' + event.error);
  });

  // Give the user time to open the dashboard
  console.log('Waiting 3 seconds for you to open the dashboard...\n');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Spawn 3 Claude sessions sequentially (spawn lock prevents true parallel spawn)
  console.log('Spawning 3 concurrent Claude sessions...\n');
  const workingDir = process.cwd();

  const sessions = [];
  for (let i = 0; i < 3; i++) {
    const session = await manager.spawn(workingDir, PROMPTS[i]);
    sessions.push(session);
    console.log('Spawned session ' + session.id.slice(0, 8) + ' in slot ' + session.slot);
  }

  console.log('\nAll 3 sessions spawned. Waiting for completion...\n');

  // Wait for all sessions to complete (with timeout)
  let completedCount = 0;
  await new Promise<void>((resolve) => {
    const complete = () => {
      completedCount++;
      if (completedCount >= 3) {
        resolve();
      }
    };

    manager.on('session:completed', complete);
    manager.on('session:failed', complete);

    // Timeout after 3 minutes
    setTimeout(() => {
      console.log('Timeout reached');
      resolve();
    }, 180000);
  });

  console.log('\n--- All Sessions Complete ---\n');

  // Show final output for each slot
  for (const session of sessions) {
    console.log('Slot ' + session.slot + ' output:');
    const output = manager.getOutput(session.id);
    console.log(output.join('').slice(0, 200));
    console.log('---\n');
  }

  // Keep server running for 10 more seconds to view results
  console.log('Keeping dashboard open for 10 more seconds...');
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Clean up
  console.log('Shutting down...');
  await webServer.stop();
  await manager.close();
  console.log('Done!');
}

main().catch(console.error);
