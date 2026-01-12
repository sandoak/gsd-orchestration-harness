#!/usr/bin/env npx tsx
/**
 * Demo: Interactive Orchestration with Checkpoint Response
 *
 * This script demonstrates the full orchestration flow:
 * 1. Spawns 3 interactive sessions (simulating Claude with GSD)
 * 2. Each session prompts for input (simulating checkpoints)
 * 3. Orchestrator detects prompts and sends responses via stdin
 * 4. Sessions continue after receiving responses
 *
 * Watch the dashboard at http://localhost:3333 to see the interaction!
 */

import { PersistentSessionManager } from '@gsd/session-manager';
import { HarnessServer } from '@gsd/web-server';

const PORT = 3333;

// Simulated "GSD sessions" that prompt for checkpoint responses
// Using bash to simulate the prompt/response cycle
const INTERACTIVE_COMMANDS = [
  // Session 1: Planning checkpoint simulation
  `-c 'echo "=== SLOT 1: Planning Session ===" && echo "Planning Phase 1..." && sleep 2 && echo "" && echo "CHECKPOINT:verify" && echo "Plan created: 5 tasks identified" && echo "Approve plan? [yes/no]:" && read response && echo "Received: $response" && if [ "$response" = "yes" ]; then echo "✓ Plan approved, continuing..."; else echo "✗ Plan rejected"; fi && sleep 1 && echo "Planning complete!"'`,

  // Session 2: Execution checkpoint simulation
  `-c 'echo "=== SLOT 2: Execution Session ===" && echo "Executing tasks..." && sleep 3 && echo "" && echo "CHECKPOINT:decision" && echo "Found 2 approaches:" && echo "  1. Use existing pattern" && echo "  2. Create new abstraction" && echo "Select option [1/2]:" && read choice && echo "Selected option: $choice" && sleep 1 && echo "Implementing with option $choice..." && sleep 2 && echo "Execution complete!"'`,

  // Session 3: Verification checkpoint simulation
  `-c 'echo "=== SLOT 3: Verification Session ===" && echo "Running verification..." && sleep 4 && echo "" && echo "CHECKPOINT:human-action" && echo "Manual step required:" && echo "  Please verify the dashboard shows 3 sessions" && echo "Type done when ready:" && read confirm && echo "Confirmed: $confirm" && sleep 1 && echo "Verification complete!"'`,
];

// Responses to send when checkpoints are detected
const CHECKPOINT_RESPONSES: Record<
  number,
  { pattern: RegExp; response: string; description: string }
> = {
  1: { pattern: /Approve plan\?/, response: 'yes', description: 'Approving plan' },
  2: { pattern: /Select option/, response: '1', description: 'Selecting option 1' },
  3: { pattern: /Type done when ready/, response: 'done', description: 'Confirming manual action' },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  INTERACTIVE ORCHESTRATION DEMO                                 ║');
  console.log('║  Demonstrates checkpoint detection and stdin response           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Create session manager with bash as executable (for controlled demo)
  const manager = new PersistentSessionManager({
    executable: '/bin/bash',
  });

  // Create and start web server
  const webServer = new HarnessServer({
    manager,
    port: PORT,
  });

  await webServer.start();
  console.log(`📺 Dashboard running at http://localhost:${PORT}`);
  console.log('   Open the dashboard to watch the interactive sessions!\n');

  // Track session states
  const sessionStates: Map<
    string,
    {
      slot: number;
      checkpointDetected: boolean;
      responseSent: boolean;
      completed: boolean;
    }
  > = new Map();

  // Event listeners
  manager.on('session:started', (event) => {
    console.log(`🚀 Session ${event.sessionId.slice(0, 8)} started in slot ${event.slot}`);
    sessionStates.set(event.sessionId, {
      slot: event.slot,
      checkpointDetected: false,
      responseSent: false,
      completed: false,
    });
  });

  manager.on('session:completed', (event) => {
    const state = sessionStates.get(event.sessionId);
    if (state) {
      state.completed = true;
      console.log(`✅ Session ${event.sessionId.slice(0, 8)} (slot ${state.slot}) completed`);
    }
  });

  manager.on('session:failed', (event) => {
    console.log(`❌ Session ${event.sessionId.slice(0, 8)} failed: ${event.error}`);
  });

  // Give user time to open dashboard
  console.log('Waiting 5 seconds for you to open the dashboard...\n');
  await sleep(5000);

  // Spawn all 3 sessions
  console.log('Spawning 3 interactive sessions with checkpoint prompts...\n');
  const workingDir = process.cwd();
  const sessions: Array<{ id: string; slot: number }> = [];

  for (let i = 0; i < 3; i++) {
    const session = await manager.spawn(workingDir, INTERACTIVE_COMMANDS[i]);
    sessions.push({ id: session.id, slot: session.slot });
    console.log(`   Spawned session ${session.id.slice(0, 8)} in slot ${session.slot}`);
    await sleep(500); // Small delay between spawns
  }

  console.log('\n📡 Orchestrator now monitoring for checkpoints...\n');
  console.log('─'.repeat(60));

  // Orchestration loop - monitor and respond to checkpoints
  let allComplete = false;
  let iterations = 0;
  const maxIterations = 60; // 60 seconds max

  while (!allComplete && iterations < maxIterations) {
    iterations++;

    // Check each session
    for (const session of sessions) {
      const state = sessionStates.get(session.id);
      if (!state || state.completed || state.responseSent) continue;

      // Get recent output
      const output = manager.getOutput(session.id).join('');
      const checkpointConfig = CHECKPOINT_RESPONSES[session.slot];

      // Check for checkpoint pattern
      if (checkpointConfig && checkpointConfig.pattern.test(output) && !state.checkpointDetected) {
        state.checkpointDetected = true;
        console.log(`\n🔔 CHECKPOINT DETECTED in Slot ${session.slot}:`);

        // Show last few lines of output
        const lines = output
          .split('\n')
          .filter((l) => l.trim())
          .slice(-5);
        lines.forEach((line) => console.log(`   │ ${line}`));

        // Wait a moment to simulate "thinking"
        await sleep(1000);

        // Send response
        console.log(
          `\n📤 ORCHESTRATOR RESPONDING: "${checkpointConfig.response}" (${checkpointConfig.description})`
        );
        const sent = manager.sendInput(session.id, checkpointConfig.response);

        if (sent) {
          state.responseSent = true;
          console.log(`   ✓ Response sent to session ${session.id.slice(0, 8)}`);
        } else {
          console.log(`   ✗ Failed to send response`);
        }
        console.log('─'.repeat(60));
      }
    }

    // Check if all sessions complete
    allComplete = [...sessionStates.values()].every((s) => s.completed);

    if (!allComplete) {
      await sleep(1000); // Poll every second
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  ORCHESTRATION DEMO COMPLETE                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Show final output for each session
  console.log('Final session outputs:');
  console.log('');

  for (const session of sessions) {
    const state = sessionStates.get(session.id);
    console.log(`Slot ${session.slot} (${state?.completed ? '✓ completed' : '✗ incomplete'}):`);
    const output = manager.getOutput(session.id).join('');
    // Clean ANSI codes and show output
    const cleanOutput = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
    const lines = cleanOutput.split('\n').slice(-8);
    lines.forEach((line) => console.log(`  ${line}`));
    console.log('');
  }

  // Keep server running to view results
  console.log('Dashboard will remain open for 15 more seconds...');
  await sleep(15000);

  // Cleanup
  console.log('Shutting down...');
  await webServer.stop();
  await manager.close();
  console.log('Done!');
}

main().catch(console.error);
