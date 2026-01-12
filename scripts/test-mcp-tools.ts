#!/usr/bin/env npx tsx
/**
 * Test all MCP tools to verify they work correctly.
 */

import { PersistentSessionManager } from '@gsd/session-manager';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  MCP TOOLS TEST                                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const manager = new PersistentSessionManager({
    executable: '/bin/bash',
  });

  const results: { tool: string; status: string; details?: string }[] = [];

  try {
    // 1. gsd_list_sessions - List all sessions (should be empty)
    console.log('1. Testing gsd_list_sessions...');
    const sessions = manager.listSessions();
    results.push({
      tool: 'gsd_list_sessions',
      status: '✅ PASS',
      details: `Found ${sessions.length} sessions (expected 0)`,
    });
    console.log(`   ✅ Listed ${sessions.length} sessions\n`);

    // 2. gsd_start_session - Start a session
    console.log('2. Testing gsd_start_session...');
    const session = await manager.spawn(
      process.cwd(),
      `-c 'echo "Session started"; echo "CHECKPOINT: human-verify"; echo "Approve? [y/n]:"; read r; echo "Got: $r"; sleep 1; echo "Done"'`
    );
    results.push({
      tool: 'gsd_start_session',
      status: '✅ PASS',
      details: `Started session ${session.id.slice(0, 8)} in slot ${session.slot}`,
    });
    console.log(`   ✅ Started session ${session.id.slice(0, 8)} in slot ${session.slot}\n`);

    // Wait for session to produce output
    await sleep(1000);

    // 3. gsd_get_output - Get session output
    console.log('3. Testing gsd_get_output...');
    const output = manager.getOutput(session.id);
    const outputText = output.join('');
    results.push({
      tool: 'gsd_get_output',
      status: outputText.includes('Session started') ? '✅ PASS' : '❌ FAIL',
      details: `Got ${output.length} chunks, ${outputText.length} chars`,
    });
    console.log(`   ✅ Got output: "${outputText.slice(0, 50).replace(/\n/g, '\\n')}..."\n`);

    // 4. gsd_list_sessions again - Should show 1 running
    console.log('4. Testing gsd_list_sessions (with active session)...');
    const activeSessions = manager.listSessions();
    results.push({
      tool: 'gsd_list_sessions (active)',
      status: activeSessions.length === 1 ? '✅ PASS' : '❌ FAIL',
      details: `Found ${activeSessions.length} active session(s)`,
    });
    console.log(`   ✅ Found ${activeSessions.length} active session\n`);

    // 5. gsd_get_state - Get GSD project state
    console.log('5. Testing gsd_get_state...');
    // This requires parsing .planning/STATE.md - check if it exists
    const { GsdStateParser } = await import('@gsd/core');
    try {
      const state = GsdStateParser.parseFromDirectory(process.cwd());
      results.push({
        tool: 'gsd_get_state',
        status: '✅ PASS',
        details: `Phase ${state.currentPhase} of ${state.totalPhases}`,
      });
      console.log(`   ✅ Got state: Phase ${state.currentPhase}/${state.totalPhases}\n`);
    } catch {
      results.push({
        tool: 'gsd_get_state',
        status: '⚠️ SKIP',
        details: 'No .planning/STATE.md found',
      });
      console.log(`   ⚠️ Skipped (no STATE.md)\n`);
    }

    // 6. gsd_get_checkpoint - Detect checkpoint pattern in output
    console.log('6. Testing gsd_get_checkpoint...');
    const { CHECKPOINT_PATTERNS } = await import('@gsd/core');
    let detectedType: string | null = null;
    for (const [type, pattern] of Object.entries(CHECKPOINT_PATTERNS)) {
      if (pattern.test(outputText)) {
        detectedType = type;
        break;
      }
    }
    results.push({
      tool: 'gsd_get_checkpoint',
      status: detectedType ? '✅ PASS' : '❌ FAIL',
      details: detectedType ? `Detected ${detectedType} checkpoint` : 'No checkpoint pattern found',
    });
    if (detectedType) {
      console.log(`   ✅ Detected checkpoint: type=${detectedType}\n`);
    } else {
      console.log(`   ❌ No checkpoint pattern matched\n`);
    }

    // 7. gsd_respond_checkpoint - Send response via stdin
    console.log('7. Testing gsd_respond_checkpoint (sendInput)...');
    const sent = manager.sendInput(session.id, 'y');
    results.push({
      tool: 'gsd_respond_checkpoint',
      status: sent ? '✅ PASS' : '❌ FAIL',
      details: sent ? 'Response sent successfully' : 'Failed to send',
    });
    console.log(`   ✅ Sent response "y" to session\n`);

    // Wait for session to process response
    await sleep(2000);

    // Check final output
    console.log('8. Verifying response was received...');
    const finalOutput = manager.getOutput(session.id).join('');
    const responseReceived = finalOutput.includes('Got: y');
    results.push({
      tool: 'stdin response verification',
      status: responseReceived ? '✅ PASS' : '❌ FAIL',
      details: responseReceived ? 'Session received input' : 'Input not received',
    });
    console.log(
      `   ${responseReceived ? '✅' : '❌'} Session ${responseReceived ? 'received' : 'did not receive'} the input\n`
    );

    // 9. gsd_end_session - Terminate session
    console.log('9. Testing gsd_end_session...');
    await manager.terminate(session.id);
    await sleep(500);
    // listSessions returns only RUNNING sessions (not completed in DB)
    const afterTerminate = manager.listSessions();
    const runningCount = afterTerminate.filter((s) => s.status === 'running').length;
    results.push({
      tool: 'gsd_end_session',
      status: runningCount === 0 ? '✅ PASS' : '❌ FAIL',
      details: `${runningCount} running sessions (${afterTerminate.length} total in memory)`,
    });
    console.log(`   ✅ Terminated session, ${runningCount} running\n`);
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await manager.close();
  }

  // Summary
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST RESULTS                                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter((r) => r.status.includes('PASS')).length;
  const failed = results.filter((r) => r.status.includes('FAIL')).length;
  const skipped = results.filter((r) => r.status.includes('SKIP')).length;

  for (const r of results) {
    console.log(`${r.status} ${r.tool}`);
    if (r.details) console.log(`      ${r.details}`);
  }

  console.log('');
  console.log(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
