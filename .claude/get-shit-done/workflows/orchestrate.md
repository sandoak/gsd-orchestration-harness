<trigger>
Use this workflow when:
- User invokes /gsd:orchestrate
- Harness MCP tools are available (gsd_* tools visible)
- Parallel GSD session execution is desired
- Managing planning, execution, and verification in parallel
</trigger>

<purpose>
Orchestrate the **complete GSD lifecycle** using 3 specialized parallel session slots.

The harness provides 3 purpose-specific slots:

- **Slot 1 (Planning)**: Runs `/gsd:plan-phase X` - creates PLAN.md files
- **Slot 2 (Execution)**: Runs `/gsd:execute-plan [path]` - builds the code
- **Slot 3 (Verify)**: Runs verification tasks - tests, UAT, quality checks

Claude becomes the session coordinator—monitoring when sessions reach user prompts/hooks, responding to checkpoints, and keeping all slots productively busy.

"Claude as the conductor of a parallel GSD symphony."
</purpose>

<slot_architecture>

```
┌─────────────────────────────────────────────────────────────────────┐
│  GSD ORCHESTRATION HARNESS - Parallel Slot Architecture            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  SLOT 1: PLANNING          SLOT 2: EXECUTION        SLOT 3: VERIFY  │
│  ┌─────────────────┐       ┌─────────────────┐      ┌─────────────┐ │
│  │ /gsd:plan-phase │       │ /gsd:execute-   │      │ /gsd:verify │ │
│  │                 │       │     plan        │      │   -work     │ │
│  │ Creates PLAN.md │  ──►  │ Builds code     │  ──► │ Tests/UAT   │ │
│  │ files           │       │ Creates SUMMARY │      │ Quality     │ │
│  └─────────────────┘       └─────────────────┘      └─────────────┘ │
│         │                          │                       │        │
│         └──────────────────────────┴───────────────────────┘        │
│                           PARALLEL EXECUTION                         │
│  Phase 2 planning can run while Phase 1 executes and verifies       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Parallel Pipeline Example:**

```
Time →
Slot 1 (Plan):    [Plan P1]──────[Plan P2]──────[Plan P3]──────
Slot 2 (Execute):        [Exec P1-01]──[Exec P1-02]──[Exec P2-01]──
Slot 3 (Verify):                [Verify P1-01]──[Verify P1-02]──────
```

</slot_architecture>

<required_reading>
Before orchestrating, ensure context:

- ROADMAP.md: Know which phases exist and their status
- STATE.md: Know current project position
- Harness MCP tools: gsd\_\* tools must be available
  </required_reading>

<process>

<step name="check_harness_available">
Verify harness MCP tools are accessible:

Call `gsd_list_sessions` with no arguments.

**If successful:** Response contains `slots` array with 3 entries.
**If error:** Harness not running or MCP not configured.

```
⚠️ Harness not available

The GSD Orchestration Harness MCP tools are not accessible.

Run setup: curl -sSL https://raw.githubusercontent.com/sandoak/gsd-orchestration-harness/main/scripts/setup-gsd-harness.sh | bash
```

Proceed only if harness is accessible.
</step>

<step name="load_project_context">
Load project state to understand what work needs orchestration:

```bash
cat .planning/ROADMAP.md
cat .planning/STATE.md
ls -R .planning/phases/
```

Extract:

- Current phase position
- Phases that need planning (no PLAN.md files)
- Plans that need execution (PLAN.md exists, no SUMMARY.md)
- Plans that need verification (SUMMARY.md exists, not verified)
- Completed work (verified)

Build work queues for each slot type.
</step>

<step name="build_work_queues">
**Build separate queues for each slot type:**

**Planning Queue (Slot 1):**

```
[0] /gsd:plan-phase 1
[1] /gsd:plan-phase 2
[2] /gsd:plan-phase 3
...
```

**Execution Queue (Slot 1):**

```
[0] /gsd:execute-plan .planning/phases/01-xxx/01-01-PLAN.md
[1] /gsd:execute-plan .planning/phases/01-xxx/01-02-PLAN.md
[2] /gsd:execute-plan .planning/phases/02-xxx/02-01-PLAN.md
...
```

**Verification Queue (Slot 2):**

```
[0] /gsd:verify-work (after 01-01 executes)
[1] /gsd:verify-work (after 01-02 executes)
...
```

**Queue Dependencies:**

- Execution waits for planning to create PLAN.md
- Verification waits for execution to create SUMMARY.md
- Next phase planning can start once current phase is planned
- Verification can run in parallel with next plan's execution

**Dynamic Queue Updates:**

- After planning completes: Add new execution items
- After execution completes: Add new verification items
- Re-scan `.planning/phases/` after each session completes
  </step>

<step name="display_session_status">
Present current harness state:

```
╔══════════════════════════════════════════════════════════════════════╗
║  GSD ORCHESTRATION HARNESS                                            ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  PLANNING (Slot 1):   [state]  Phase 2 planning                       ║
║  EXECUTION (Slot 2):  [state]  Phase 1 Plan 2 executing               ║
║  VERIFY (Slot 3):     [state]  Phase 1 Plan 1 verifying               ║
║                                                                        ║
║  Project: [project name]                                              ║
║  Pipeline: Plan → Execute → Verify                                    ║
║                                                                        ║
╚══════════════════════════════════════════════════════════════════════╝
```

State indicators:

- `idle`: Available for work assignment
- `running`: Actively working
- `waiting_input`: At user prompt, needs orchestrator response
- `waiting_checkpoint`: Checkpoint needs handling
- `completed`: Finished, slot available
- `failed`: Error occurred
  </step>

<step name="detect_user_prompt">
**Critical: Detect when session is waiting for user input**

Sessions reach user prompts/hooks when they need orchestrator response. Detect via:

1. **Poll session output:**
   Call `gsd_get_output(sessionId, lines=20)` and look for:
   - Prompt indicators: `❯`, `>`, `?`, `Enter to select`
   - Hook markers: `[CHECKPOINT]`, `waiting for input`
   - Question patterns: `Options:`, `Select:`, `Continue?`

2. **Check session state:**
   Call `gsd_list_sessions` - look for `waiting_checkpoint` or `waiting_input` states

3. **Pattern matching in output:**
   ```
   # Patterns indicating session needs response:
   - "Enter to select"
   - "Options:" followed by numbered list
   - "Continue? (y/n)"
   - "CHECKPOINT:"
   - User prompt character at end of output
   ```

**When detected:** Route to appropriate handler (checkpoint or prompt response)
</step>

<step name="session_tracking">
**CRITICAL: Maintain orchestrator state to prevent issues**

The orchestrator MUST track:

```
orchestrator_state = {
  active_sessions: {
    planning: { session_id, command, started_at } | null,
    execution: { session_id, command, started_at } | null,
    verify: { session_id, command, started_at } | null,
  },
  pending_start: Set<slot_type>,  // Slots where start was just called
  last_poll: timestamp,
}
```

**Before starting a session:**

1. Call `gsd_list_sessions` to check current state
2. Only start if slot is truly idle (not pending, not running)
3. Mark slot as `pending_start` immediately after calling `gsd_start_session`
4. Remove from `pending_start` after first successful output poll

**This prevents duplicate sessions caused by:**

- Calling start_session twice before first registers
- Race conditions between checking and starting

</step>

<step name="cli_initialization">
**CRITICAL: Claude CLI takes time to initialize**

After calling `gsd_start_session`, the Claude CLI process needs 5-15 seconds to:

1. Load Claude Code environment
2. Parse project files
3. Begin executing the command

**DO NOT poll for output immediately after starting a session!**

**Initialization protocol:**

1. Call `gsd_start_session` and record session ID
2. Wait 10 seconds before first output poll
3. If output is still empty, wait another 10 seconds
4. After 30 seconds of empty output, check if session failed

**Empty output handling:**

```
if output == "" and session.status == "running":
  if elapsed_since_start < 30 seconds:
    # Normal - CLI still initializing
    continue polling
  else:
    # Potential issue - check session health
    check gsd_list_sessions for session status
```

</step>

<step name="orchestration_loop">
**Main orchestration loop - repeat until all work complete:**

**Pre-loop setup:**

- Initialize orchestrator_state tracking (see session_tracking step)
- Set initial poll delay for new sessions: 10 seconds

1. **Check all slot statuses:**
   Call `gsd_list_sessions` to get current state of all 3 slots.
   Update orchestrator_state.active_sessions based on response.

2. **Wait for new sessions to initialize:**
   For any session started in the last 10 seconds:
   - Skip output polling for now (CLI initializing)
   - Mark as "initializing" in status display

3. **Check for sessions waiting for input:**
   For each running slot (not initializing):
   - Call `gsd_get_output(sessionId, lines=20)`
   - If empty: Continue (may still be working)
   - If has content: Look for prompt patterns (see detect_user_prompt)
   - If waiting: Route to appropriate handler

4. **Handle checkpoints:**
   For slots in `waiting_checkpoint` state:
   - Call `gsd_get_checkpoint(sessionId)`
   - Route to checkpoint_handling step
   - Respond and continue

5. **Handle completed slots:**
   When a slot completes:
   - **Planning slot**: Refresh execution queue (new PLAN.md files)
   - **Execution slot**: Refresh verification queue, add to verify queue
   - **Verify slot**: Mark phase/plan as fully complete
   - Clear from orchestrator_state.active_sessions
   - Assign next work from appropriate queue

6. **Handle failed slots:**
   - Get output, analyze error
   - Clear from orchestrator_state.active_sessions
   - Offer: Retry, Skip, or Investigate
   - See error_handling step

7. **Assign work to idle slots (with duplicate prevention):**

   **Before assigning ANY work:**
   - Verify slot is not in orchestrator_state.pending_start
   - Verify slot is not in orchestrator_state.active_sessions
   - Check gsd_list_sessions confirms slot is idle

   **Slot 1 (Planning) idle:**
   - Check planning queue
   - Assign next phase that needs planning
   - `gsd_start_session(workingDir, "/gsd:plan-phase X")`
   - Record in orchestrator_state.active_sessions.planning
   - Add to orchestrator_state.pending_start

   **Slot 2 (Execution) idle:**
   - Check execution queue
   - Assign next PLAN.md that needs execution
   - `gsd_start_session(workingDir, "/gsd:execute-plan [path]")`
   - Record in orchestrator_state.active_sessions.execution
   - Add to orchestrator_state.pending_start

   **Slot 3 (Verify) idle:**
   - Check verification queue
   - Assign next completed execution that needs verification
   - `gsd_start_session(workingDir, "/gsd:verify-work")`
   - Record in orchestrator_state.active_sessions.verify
   - Add to orchestrator_state.pending_start

8. **Refresh queues after completions:**
   - After planning: Scan for new PLAN.md files
   - After execution: Scan for new SUMMARY.md files
   - Update queues accordingly

9. **Check if done:**
   - All queues empty AND all slots idle: Complete
   - Otherwise: Continue loop

**Polling intervals:**

- New sessions (< 10 seconds old): Skip output polling
- Running sessions: Poll every 5-10 seconds
- Use `gsd_list_sessions` to refresh slot states each iteration

</step>

<step name="respond_to_prompt">
When a session is at a user prompt (not a formal checkpoint):

1. **Analyze the prompt:**
   Read output to understand what's being asked

2. **Auto-respond if possible:**
   - Yes/No questions: Respond based on context
   - Continue prompts: Usually respond "y" or press Enter
   - Selection prompts: Choose appropriate option

3. **Use `gsd_respond_checkpoint` or direct input:**

   ```
   gsd_respond_checkpoint(sessionId, "y")
   gsd_respond_checkpoint(sessionId, "1")  // Select option 1
   gsd_respond_checkpoint(sessionId, "continue")
   ```

4. **Surface to user if uncertain:**
   If the prompt requires human judgment:

   ```
   Session [slot] is asking:
   [prompt content]

   How should I respond?
   ```

   </step>

<step name="checkpoint_handling">
When a formal checkpoint is detected:

**For checkpoint:human-verify (90%):**

1. Get checkpoint details: `gsd_get_checkpoint(sessionId)`
2. Attempt automated verification
3. Respond: `gsd_respond_checkpoint(sessionId, "approved")` or surface to user

**For checkpoint:decision (9%):**

1. Get options: `gsd_get_checkpoint(sessionId)`
2. Present to user with context
3. Relay choice: `gsd_respond_checkpoint(sessionId, "option-id")`

**For checkpoint:human-action (1%):**

1. Get action details: `gsd_get_checkpoint(sessionId)`
2. Alert user with instructions
3. Wait for "done": `gsd_respond_checkpoint(sessionId, "done")`
   </step>

<step name="parallel_coordination">
**Maximize parallelism while respecting dependencies:**

```
VALID PARALLEL STATES:
✓ Plan Phase 2 + Execute Phase 1 + Verify Phase 1 earlier work
✓ Plan Phase 3 + Execute Phase 2 + Verify Phase 1
✓ All three slots working on different phases

INVALID (must wait):
✗ Execute Plan X before Plan X is created
✗ Verify Plan X before Plan X execution completes
✗ Execute Phase N+1 before Phase N execution completes
```

**Keep slots busy:**

- Don't let planning slot idle while execution/verify run
- Start next phase planning as soon as current phase planning done
- Pipeline work through slots for maximum throughput
  </step>

<step name="progress_reporting">
Periodically display overall progress:

```
═══════════════════════════════════════════════════════════════════════
ORCHESTRATION PROGRESS - Parallel Pipeline
═══════════════════════════════════════════════════════════════════════

Pipeline Status:
  PLANNING:   Phase 3 of 5 [██████░░░░] 60%
  EXECUTION:  Phase 2 of 5 [████░░░░░░] 40%
  VERIFY:     Phase 1 of 5 [██░░░░░░░░] 20%

Active Sessions:
  Slot 1 (Plan):    Planning Phase 3
  Slot 2 (Execute): Executing 02-02-PLAN.md
  Slot 3 (Verify):  Verifying 01-03 execution

Recently Completed:
  ✓ Phase 1 fully verified
  ✓ Phase 2 planned (3 plans)
  ✓ 02-01 executed

Queued:
  Execute: 02-03, 03-01, 03-02
  Verify: 02-01, 02-02

═══════════════════════════════════════════════════════════════════════
```

</step>

<step name="error_handling">
When a session fails:

1. Identify which slot/type failed (planning, execution, or verify)
2. Get error context: `gsd_get_output(sessionId, lines=100)`
3. Analyze and offer options:

```
[PLANNING/EXECUTION/VERIFY] FAILED

Slot: [1/2/3]
Task: [what was being done]
Error: [summary]

Options:
1. Retry - Start the task again
2. Skip - Mark as failed, continue pipeline
3. Investigate - Show full output
```

4. Handle based on choice
5. Continue pipeline with other slots
   </step>

<step name="completion">
When all work is complete:

```
╔══════════════════════════════════════════════════════════════════════╗
║  ORCHESTRATION COMPLETE                                               ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  ✓ All phases planned                                                 ║
║  ✓ All plans executed                                                 ║
║  ✓ All work verified                                                  ║
║                                                                        ║
║  Pipeline Summary:                                                     ║
║    Phases planned: [N]                                                ║
║    Plans executed: [N]                                                ║
║    Verifications passed: [N]                                          ║
║    Checkpoints handled: [N]                                           ║
║                                                                        ║
║  Project state updated in STATE.md                                    ║
║                                                                        ║
╚══════════════════════════════════════════════════════════════════════╝
```

</step>

</process>

<mcp_tool_reference>
Quick reference for harness MCP tools:

**gsd_list_sessions**

- Purpose: Get status of all 3 session slots
- Returns: `{ slots: [{ id, slot, state, projectPath, command }] }`
- States: `idle`, `running`, `waiting_input`, `waiting_checkpoint`, `completed`, `failed`

**gsd_start_session**

- Purpose: Start work in an available slot
- Args: `workingDir`, `command`
- Commands: `/gsd:plan-phase X`, `/gsd:execute-plan [path]`, `/gsd:verify-work`

**gsd_end_session**

- Purpose: Terminate a session
- Args: `sessionId`

**gsd_get_output**

- Purpose: Get session output (monitor for prompts)
- Args: `sessionId`, `lines`
- Use: Detect user prompts, monitor progress

**gsd_get_checkpoint**

- Purpose: Get checkpoint details
- Args: `sessionId`
- Returns: `{ type, content, options }`

**gsd_respond_checkpoint**

- Purpose: Respond to checkpoint or prompt
- Args: `sessionId`, `response`
- Use: Answer prompts, approve checkpoints, make decisions
  </mcp_tool_reference>

<usage_examples>

**Start orchestration on a new project:**

```
/gsd:orchestrate

# Orchestrator:
# 1. Checks harness - 3 slots available
# 2. Builds queues - Phase 1 needs planning
# 3. Assigns Slot 1: /gsd:plan-phase 1
# 4. Monitors for completion
# 5. When planning done: Assigns Slot 2 execution, Slot 1 next planning
# 6. Pipeline runs until complete
```

**Parallel pipeline in action:**

```
Slot 1: Plan Phase 1 → Plan Phase 2 → Plan Phase 3 → idle
Slot 2: wait → Execute 01-01 → Execute 01-02 → Execute 02-01
Slot 3: wait → wait → Verify 01-01 → Verify 01-02
```

**Detecting and responding to prompt:**

```
gsd_get_output("session-1", 20) →
  "...
   Options:
   1. Use Supabase auth
   2. Use Clerk

   ❯ Select option:"

# Orchestrator detects prompt, responds:
gsd_respond_checkpoint("session-1", "1")
```

</usage_examples>

<success_criteria>
Orchestration succeeds when:

- [ ] All phases planned (Slot 1 completed all planning)
- [ ] All plans executed (Slot 2 completed all execution)
- [ ] All work verified (Slot 3 completed all verification)
- [ ] All checkpoints/prompts handled
- [ ] No failed sessions (or failures acknowledged)
- [ ] STATE.md updated with completion
      </success_criteria>

<guidelines>

**DO:**

- Use slots for their designated purposes (plan/execute/verify)
- Monitor output frequently for user prompts
- Keep pipeline flowing - start next work immediately when slot frees
- Run slots in parallel when dependencies allow
- Respond to prompts quickly to avoid blocking

**DON'T:**

- Mix purposes (don't execute in planning slot)
- Wait for full phase completion before starting next phase planning
- Ignore sessions waiting for input
- Let slots sit idle when there's queued work
- Assume checkpoint is only way sessions wait for input

**Parallel is the goal:**

- Always have all 3 slots busy when possible
- Pipeline: Plan → Execute → Verify flows continuously
- Different phases can be at different stages simultaneously
  </guidelines>

<orphan_prevention>
**Session Lifecycle and Orphan Prevention**

The harness includes automatic orphan prevention mechanisms:

**Automatic Cleanup:**

1. **On Harness Restart**: Orphaned sessions from previous runs are detected and their processes are killed
2. **Session Timeout**: Sessions not polled for 10 minutes are automatically terminated
3. **Graceful Shutdown**: When harness stops, all running sessions are terminated

**Orchestrator Responsibilities:**

1. **Poll regularly**: Call `gsd_get_output` at least every 5-10 seconds to keep sessions alive
2. **Clean exit**: Before stopping orchestration, call `gsd_end_session` for each running session
3. **Handle errors**: If orchestrator crashes, harness will clean up on next restart

**Dashboard Monitoring:**

- Sessions show `lastPolledAt` timestamp
- Stale sessions (not polled for 10+ minutes) are flagged
- Access stale sessions API: `GET /api/sessions/stale`

**If Sessions Become Orphaned:**

1. Restart Claude Code (harness will kill orphaned processes)
2. Or manually check and terminate:
   ```
   gsd_list_sessions  # Find running sessions
   gsd_end_session(sessionId)  # Terminate each
   ```

</orphan_prevention>
