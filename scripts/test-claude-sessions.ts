#!/usr/bin/env npx tsx
/**
 * Test script to verify real Claude CLI sessions with dashboard monitoring.
 *
 * This script:
 * 1. Starts the web dashboard server
 * 2. Spawns actual Claude sessions
 * 3. Monitors their output in real-time
 *
 * Watch the dashboard at http://localhost:3333 while this runs.
 */

import { PersistentSessionManager } from '@gsd/session-manager';
import { HarnessServer } from '@gsd/web-server';

const PORT = 3333;

async function main() {
  console.log('Starting test harness...');

  // Create shared session manager
  const manager = new PersistentSessionManager();

  manager.on('recovery:complete', (result) => {
    if (result.orphanedCount > 0) {
      console.log(`Recovery: Found ${result.orphanedCount} orphaned sessions`);
    }
  });

  // Create and start web server
  const webServer = new HarnessServer({
    manager,
    port: PORT,
  });

  await webServer.start();
  console.log(`\n📺 Dashboard running at http://localhost:${PORT}`);
  console.log('Open the dashboard in a browser to watch the sessions!\n');

  // Set up event listeners
  manager.on('session:started', (event) => {
    console.log(`✓ Session ${event.sessionId.slice(0, 8)} started in slot ${event.slot}`);
  });

  manager.on('session:output', (event) => {
    const output = event.data.trim();
    if (output) {
      // Truncate long output
      const displayOutput = output.length > 100 ? output.slice(0, 100) + '...' : output;
      console.log(`  [slot ${event.sessionId.slice(0, 8)}] ${displayOutput}`);
    }
  });

  manager.on('session:completed', (event) => {
    console.log(`✓ Session ${event.sessionId.slice(0, 8)} completed`);
  });

  manager.on('session:failed', (event) => {
    console.log(`✗ Session ${event.sessionId.slice(0, 8)} failed: ${event.error}`);
  });

  // Give the user time to open the dashboard
  console.log('Waiting 5 seconds for you to open the dashboard...\n');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Spawn a real Claude session with a simple task
  console.log('Spawning Claude session with a simple task...\n');

  const session = await manager.spawn(
    process.cwd(),
    '-p "List the top 3 files in this directory by size. Be very brief, just list the files."'
  );

  console.log(`Started session ${session.id.slice(0, 8)} in slot ${session.slot}`);
  console.log(`Using executable: ${process.env.CLAUDE_EXECUTABLE ?? 'claude'}`);

  // Wait for session to complete (with timeout)
  console.log('\nWaiting for session to complete (max 2 minutes)...\n');

  await new Promise<void>((resolve) => {
    let resolved = false;

    const complete = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    manager.on('session:completed', complete);
    manager.on('session:failed', complete);

    // Timeout after 2 minutes
    setTimeout(() => {
      if (!resolved) {
        console.log('Timeout reached');
        complete();
      }
    }, 120000);
  });

  console.log('\n--- Test Complete ---');
  console.log('Session output from buffer:');
  const output = manager.getOutput(session.id);
  console.log(output.join(''));

  // Clean up
  console.log('\nShutting down...');
  await webServer.stop();
  await manager.close();
  console.log('Done!');
}

main().catch(console.error);
