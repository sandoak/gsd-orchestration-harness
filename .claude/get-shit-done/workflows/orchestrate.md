<trigger>
Use this workflow when:
- User invokes /gsd:orchestrate
- Harness MCP tools are available (gsd_* tools visible)
- Parallel GSD session execution is desired
- Managing planning, execution, and verification in parallel
</trigger>

<prerequisites>
**IMPORTANT: The GSD Harness must be running before orchestration can begin.**

The harness uses HTTP Streamable MCP transport and runs as a standalone server. It must be started manually:

```bash
# Start the harness (from the harness installation directory)
cd ~/.gsd-harness && pnpm start

# Or run in background:
cd ~/.gsd-harness && nohup pnpm start > /tmp/gsd-harness.log 2>&1 &
```

The harness runs at:

- **Dashboard**: http://localhost:3333
- **MCP endpoint**: http://localhost:3333/mcp
- **WebSocket**: ws://localhost:3333/ws

Multiple Claude Code sessions can connect to the same running harness instance.
</prerequisites>

<purpose>
Orchestrate the **complete GSD lifecycle** using 4 specialized parallel session slots.

**⚠️ YOU ARE THE CONDUCTOR, NOT A MUSICIAN:**

- You START sessions, you don't DO the work
- You MONITOR progress, you don't WRITE code
- You RESPOND to checkpoints, you don't EXECUTE plans
- If you're about to edit a .tsx/.ts/.css file or run npm commands, STOP - that's the session's job

The harness provides 4 parallel session slots (Slot 1-4). Any slot can run any task type.

**Task Types (by priority):**

1. **Verify** - `/gsd:verify-work` - Quality gate, must pass before next phase
2. **Reconcile** - Review next plan against last execution's reality
3. **Execute** - `/gsd:execute-plan [path]` - Build the code
4. **Plan** - `/gsd:plan-phase X` - Create PLAN.md files
5. **Admin** - Tests, builds, misc utility tasks

Claude becomes the session coordinator—monitoring when sessions reach user prompts/hooks, responding to checkpoints, and keeping all slots productively busy.

"Claude as the conductor of a parallel GSD symphony." (Conductors don't play instruments!)
</purpose>

<slot_architecture>

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  GSD ORCHESTRATION HARNESS - 4 Generic Parallel Slots                             │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                              │
│  │ SLOT 1  │  │ SLOT 2  │  │ SLOT 3  │  │ SLOT 4  │                              │
│  │         │  │         │  │         │  │         │                              │
│  │ Any     │  │ Any     │  │ Any     │  │ Any     │                              │
│  │ Task    │  │ Task    │  │ Task    │  │ Task    │                              │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘                              │
│                                                                                    │
│  TASK PRIORITY (orchestrator assigns highest priority to free slots):            │
│    1. VERIFY      - Quality gate, blocks next phase                              │
│    2. RECONCILE   - Validate next plan against reality                           │
│    3. EXECUTE     - Build the code                                               │
│    4. PLAN        - Create PLAN.md files                                         │
│    5. ADMIN       - Tests, builds, utilities                                     │
│                                                                                    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Pipeline with Verify Gates and Plan Reconciliation:**

```
Time →
Slot 1: [Plan P1]──────[Exec 01-01]──────[Reconcile 01-02]──────[Verify P1]──
Slot 2:        [Plan P2]──────[Exec 01-02]──────[Reconcile 02-01]──────────
Slot 3:               [Exec 02-01]──────[Exec 02-02]──────[Verify P2]──────
Slot 4:                      [Admin]──────[Admin]──────[Admin]─────────────
```

**Key Flow:**

- Execute N → Reconcile N+1 plan → Execute N+1
- Phase complete → VERIFY (must pass) → Unlock next phase planning

</slot_architecture>

<required_reading>
Before orchestrating, ensure context:

- ROADMAP.md: Know which phases exist and their status
- STATE.md: Know current project position
- Harness MCP tools: gsd\_\* tools must be available
  </required_reading>

<process>

**⚠️ CRITICAL RULES - READ FIRST:**

You are the ORCHESTRATOR, not the EXECUTOR. Your ONLY job is to:

1. Start sessions via `gsd_start_session`
2. Monitor sessions efficiently via `gsd_wait_for_state_change` (NOT polling!)
3. Respond to checkpoints via `gsd_respond_checkpoint`

**TASK PRIORITY (assign highest priority task to any free slot):**

1. **VERIFY** - Must run after phase execution completes, blocks next phase
2. **RECONCILE** - Must run after each execution, before next execution
3. **EXECUTE** - Run planned work
4. **PLAN** - Create plans (only if verify gate allows)
5. **ADMIN** - Tests, builds, utilities

**Why priority matters:** This prevents racing ahead without verification. The flow is:
Execute → Reconcile next plan → Execute → ... → Verify phase → Unlock next phase

You must NEVER:

- Run npm install, npm build, or any build commands directly
- Create/edit source files (_.tsx, _.ts, _.css, _.json)
- Write SUMMARY.md or update STATE.md directly
- Execute any plan tasks yourself
- Skip verify - it's mandatory after each phase
- Skip reconciliation - validate next plan before executing it
- Reuse a session after it completes - ALWAYS start a fresh session

ALL work happens in harness sessions. If you find yourself about to edit a source file or run a build command, STOP and start a harness session instead.

<step name="check_harness_available">
Verify harness MCP tools are accessible:

**IMPORTANT: Don't check .mcp.json files or look at tool lists. Just CALL the tool directly:**

Use the MCP tool `mcp__gsd-harness__gsd_list_sessions` with no arguments.

**If successful:** Response contains `sessions` array and `availableSlots` count. Proceed with orchestration.

**If error:** The harness is not running. Tell the user to start it:

```
The GSD Harness must be running before orchestration.

Start it with:
  cd ~/.gsd-harness && pnpm start

Then retry /gsd:orchestrate
```

**DO NOT:**

- Read .mcp.json files to check configuration
- Assume tools are unavailable based on file inspection
- Fall back to "manual orchestration" or "direct execution"

**JUST TRY THE TOOL.** If it works, proceed. If it errors, ask user to start the harness.
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

**IGNORE previous session history when loading harness state.**
The `gsd_list_sessions` response may show previous failed sessions - these are IRRELEVANT.
What matters is: Are slots available? Start fresh sessions regardless of failure history.
</step>

<step name="build_work_queues">
**Build separate queues for each slot (slots are LOCKED to their purpose):**

**Planning Queue (Slot 1 ONLY):**

```
[0] /gsd:plan-phase 1
[1] /gsd:plan-phase 2
[2] /gsd:plan-phase 3
...
```

**Execution Queue (Slot 2 ONLY):**

```
[0] /gsd:execute-plan .planning/phases/01-xxx/01-01-PLAN.md
[1] /gsd:execute-plan .planning/phases/01-xxx/01-02-PLAN.md
[2] /gsd:execute-plan .planning/phases/02-xxx/02-01-PLAN.md
...
```

**Verification Queue (Slot 3 ONLY):**

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
║  Slot 1: [state]  [task type] - [description]                         ║
║  Slot 2: [state]  [task type] - [description]                         ║
║  Slot 3: [state]  [task type] - [description]                         ║
║  Slot 4: [state]  [task type] - [description]                         ║
║                                                                        ║
║  Verified Phases: [1, 2]  |  Current: Phase 3                         ║
║  Pipeline: Execute → Reconcile → Verify → Unlock next                 ║
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
  active_sessions: Map<slot_number, { session_id, task_type, command, started_at }>,
  pending_start: Set<slot_number>,  // Slots where start was just called
  verified_phases: Set<number>,     // Phases that passed verify (unlocks next phase)
  last_execution: { plan_path, summary_path } | null,  // For reconciliation
  reconciliation_done: boolean,     // Must be true before next execution
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
- NEVER poll repeatedly - use `gsd_wait_for_state_change` instead

**EFFICIENT MONITORING (CRITICAL - saves context!):**

Instead of polling every 5-10 seconds (burns context!), use:

```
gsd_wait_for_state_change(timeout=60000)
```

This tool BLOCKS until a session completes/fails, then returns immediately.
One tool call replaces dozens of polling calls. Much more efficient!

**Loop structure:**

1. **Assign work to idle slots (PRIORITY ORDER):**

   **Before assigning ANY work:**
   - Check slot is not in orchestrator_state.pending_start
   - Check slot is not in orchestrator_state.active_sessions
   - Call `gsd_list_sessions` to confirm slot is idle

   **⚠️ PRIORITY ORDER - For each free slot, assign highest priority task:**

   **PRIORITY 1: VERIFY (highest)**
   If there's unverified completed phase work:
   - `gsd_start_session(workingDir, "/gsd:verify-work [phase]")`
   - **Verify MUST pass before unlocking next phase planning**

   **PRIORITY 2: RECONCILE**
   If execution just completed AND there's a next plan to execute:
   - `gsd_start_session(workingDir, "Review [NEXT-PLAN.md] against [LAST-SUMMARY.md]. Update if APIs/paths/patterns changed.")`
   - **Must complete before starting next execution**

   **PRIORITY 3: EXECUTE**
   If execution queue has work AND reconciliation done (or first execution):
   - `gsd_start_session(workingDir, "/gsd:execute-plan [path]")`

   **PRIORITY 4: PLAN**
   If planning queue has work:
   - **CHECK VERIFY GATE:** Is previous phase verified?
   - If NOT verified: DO NOT START PLANNING - wait for verify
   - If verified (or first phase): `gsd_start_session(workingDir, "/gsd:plan-phase X")`

   **PRIORITY 5: ADMIN (lowest)**
   If no higher priority work and admin tasks needed:
   - `gsd_start_session(workingDir, "npm test")` etc.

   **WHY THIS ORDER:**
   - Verify first ensures quality gates are enforced
   - Reconcile second keeps plans aligned with reality
   - Execute third builds the code
   - Plan fourth respects verify gates (won't race ahead)
   - Admin fills remaining time

2. **Wait for state changes (EFFICIENT!):**

   ```
   result = gsd_wait_for_state_change(timeout=60000)
   ```

   - If result.change is null: timeout, check for checkpoints manually
   - If result.change.type is "completed": handle completion
   - If result.change.type is "failed": handle failure

3. **Handle completed sessions:**
   When a session completes:
   - **Slot 1 (Plan)**: Refresh execution queue (new PLAN.md files available)
   - **Slot 2 (Execute)**:
     - Check if ALL plans in current phase are executed
     - If YES: **IMMEDIATELY queue verify for this phase** (high priority!)
     - Add verify to front of queue, not back
   - **Slot 3 (Verify)**:
     - Mark phase as verified in orchestrator_state.verified_phases
     - **This unlocks planning for next phase**
     - Log: "Phase N verified - unlocking Phase N+1 planning"
   - **Slot 4 (Admin)**: Log result, continue
   - Clear from orchestrator_state.active_sessions
   - **NEVER reuse the session** - slot is now free for NEW work

   **After execution completes, verify takes priority:**
   If phase execution is complete and verify hasn't run → verify is NEXT, before more planning

   **PLAN RECONCILIATION (Slot 4) - After each execution:**
   Before starting the next execution, use Slot 4 to validate the next plan:

   ```
   gsd_start_session(workingDir, "Review [NEXT-PLAN.md] against [JUST-COMPLETED-SUMMARY.md].
     Check if APIs, file paths, patterns, or assumptions in the plan still match reality.
     Update the plan if anything changed. Be concise - only fix what's wrong.")
   ```

   This catches drift between plans and reality before it causes execution failures.

4. **Handle failed sessions:**
   - Get output via `gsd_get_output(sessionId, lines=100)`
   - Clear from orchestrator_state.active_sessions
   - Offer: Retry (start fresh session), Skip, or Investigate
   - See error_handling step

5. **Handle checkpoints (check every ~60 seconds):**
   For each running session:
   - Call `gsd_get_output(sessionId, lines=20)`
   - Look for prompt patterns (see detect_user_prompt)
   - If waiting for input: respond via `gsd_respond_checkpoint`

6. **Refresh queues after completions:**
   - After planning: Scan for new PLAN.md files → add to execution queue
   - After execution: Scan for new SUMMARY.md files → add to verify queue
   - Update queues accordingly

7. **Check if done:**
   - All queues empty AND all slots idle: Complete
   - Otherwise: Go to step 1

**NEVER reuse sessions:**
When a session completes, that session is DONE. The slot becomes available for a NEW session with a NEW command. Do not type into a completed session's prompt.

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

<step name="verify_gates">
**CRITICAL: Verify is MANDATORY - Not Optional**

The orchestrator MUST run verify after each phase's execution completes. Verify serves as:

1. **Quality gate** - Catches bugs before they compound
2. **Parallel safety net** - Catches issues from concurrent plan/execute
3. **Synchronization point** - Ensures work is solid before advancing

**VERIFY GATE RULES:**

```
PHASE LIFECYCLE (must follow this order):
  Plan Phase N → Execute Phase N (all plans) → VERIFY Phase N → Plan Phase N+1

VERIFY GATES:
  ✗ Cannot start Plan Phase N+1 until Phase N is VERIFIED
  ✗ Cannot skip verify - it's mandatory for each phase
  ✓ Can plan Phase N while executing Phase N-1 (before verify)
  ✓ Can execute Phase N plans in parallel with verify Phase N-1
```

**Track verified phases:**

```
orchestrator_state = {
  ...existing fields...
  verified_phases: Set<number>,  // Phases that passed verify
  current_phase: number,         // Highest phase we can plan
}
```

**Before planning Phase N+1:**

1. Check: Is Phase N in verified_phases?
2. If NO: Do not start planning N+1 - wait for verify
3. If YES: Proceed with planning N+1

**After phase execution completes:**

1. All plans in phase executed? → IMMEDIATELY queue verify
2. Verify takes priority over planning next phase
3. Only after verify passes → unlock next phase planning

**WHY THIS MATTERS:**
Without verify gates, the orchestrator races ahead planning/executing while errors accumulate.
By the time issues are discovered, there's a mountain of broken code to fix.
Verify gates create checkpoints where we confirm "everything up to here works."
</step>

<step name="parallel_coordination">
**Maximize parallelism while respecting dependencies AND verify gates:**

```
VALID PARALLEL STATES:
✓ Plan Phase N + Execute Phase N-1 + Verify Phase N-2
✓ Execute Phase N + Verify Phase N-1 (while waiting for N verify)
✓ Admin tasks run independently anytime

INVALID (must wait):
✗ Execute Plan X before Plan X is created
✗ Verify Plan X before Plan X execution completes
✗ Plan Phase N+1 before Phase N is VERIFIED ← NEW GATE
✗ Skip verify entirely ← NEVER ALLOWED
```

**Phase advancement requires verify:**

```
Phase 1: Plan → Execute all → VERIFY ✓ → unlock Phase 2
Phase 2: Plan → Execute all → VERIFY ✓ → unlock Phase 3
...
```

**Keep slots busy (respecting priority order):**

For each free slot, check task priority:

1. Is there unverified phase work? → VERIFY
2. Did execution just complete? → RECONCILE next plan
3. Is reconciliation done and execution queued? → EXECUTE
4. Is verify gate open for next phase? → PLAN
5. Any admin tasks? → ADMIN

**Verify is NOT optional:**
If any slot is idle and there's unverified completed work, that slot runs VERIFY.
Verify has highest priority because it's the quality gate.
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

**IMPORTANT: Failures are expected during harness development. ALWAYS retry through the harness, NEVER fall back to direct execution.**

1. Identify which slot/type failed (planning, execution, or verify)
2. Get error context: `gsd_get_output(sessionId, lines=100)`
3. **Default action: RETRY through the harness**
   - Start a fresh session with the same command
   - Do NOT offer to "execute directly" - that defeats the purpose
4. If retry fails 3 times, THEN offer options:

```
[PLANNING/EXECUTION/VERIFY] FAILED (3 attempts)

Slot: [1/2/3]
Task: [what was being done]
Error: [summary]

Options:
1. Retry again - Start the task again
2. Skip - Mark as failed, continue pipeline
3. Investigate - Show full output and report issue
```

5. Continue pipeline with other slots

**NEVER offer "execute directly in this session" as an option. The user chose /gsd:orchestrate specifically to use the harness.**
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

- Purpose: Get status of all 4 session slots
- Returns: `{ sessions: [{ id, slot, status, workingDir, command }], availableSlots }`
- States: `idle`, `running`, `waiting_checkpoint`, `completed`, `failed`

**gsd_start_session**

- Purpose: Start work in an available slot
- Args: `workingDir`, `command`
- Task types (any slot):
  - Verify: `/gsd:verify-work [phase]`
  - Reconcile: `"Review [PLAN.md] against [SUMMARY.md]..."`
  - Execute: `/gsd:execute-plan [path]`
  - Plan: `/gsd:plan-phase X`
  - Admin: `npm test`, `npm build`, etc.

**gsd_end_session**

- Purpose: Terminate a session
- Args: `sessionId`

**gsd_wait_for_state_change** ⭐ NEW - USE THIS FOR MONITORING

- Purpose: Wait efficiently for session state changes (replaces polling!)
- Args: `timeout` (ms, default 30000), `sessionIds` (optional filter)
- Returns: `{ change: { type, sessionId, slot }, session }` or `{ change: null }` on timeout
- **Use this instead of polling gsd_get_output repeatedly!**

**gsd_get_output**

- Purpose: Get session output (for checkpoint detection)
- Args: `sessionId`, `lines`
- Use: Check for prompts/checkpoints AFTER wait_for_state_change times out

**gsd_get_checkpoint**

- Purpose: Get checkpoint details
- Args: `sessionId`
- Returns: `{ type, content, options }`

**gsd_respond_checkpoint**

- Purpose: Respond to checkpoint or prompt
- Args: `sessionId`, `response`
- **For selection prompts:** Send "1", "2", etc. or "\r" (Enter) to select
- Use: Answer prompts, approve checkpoints, make decisions

**gsd_sync_project_state** ⭐ CRITICAL - CALL AT STARTUP

- Purpose: Sync project's `.planning/` state to harness database
- Args: `projectPath` (absolute path)
- Returns: `{ state, limits, plans }` - current execution state and limits
- **MUST call at orchestration start** - initializes database from filesystem
- Updates: `highestExecutedPhase`, `pendingVerifyPhase`, discovered plans
- Harness uses this to enforce physical barriers

</mcp_tool_reference>

<physical_barriers>
**HARNESS-ENFORCED LIMITS (Cannot be bypassed)**

The harness physically blocks commands that violate these rules:

1. **EXECUTION LIMIT**: Only 1 execute at a time
   - Second execute request → BLOCKED with error
   - Prevents: Codebase conflicts from parallel code changes

2. **PLANNING LIMIT**: Max 2 phases ahead of execution
   - `plan_phase > highest_executed + 2` → BLOCKED
   - Prevents: Racing ahead without verification

3. **VERIFY GATE**: No executes until pending verify completes
   - If phase complete but not verified → executes BLOCKED
   - Clears: When verify runs for the pending phase

**Sync state at startup:**

```
gsd_sync_project_state(projectPath)
→ Returns current limits and what's allowed
```

</physical_barriers>

<usage_examples>

**Start orchestration on a new project:**

```
/gsd:orchestrate

# Orchestrator:
# 1. Checks harness - 4 slots available
# 2. Builds queues - Phase 1 needs planning
# 3. Assigns free slot: /gsd:plan-phase 1
# 4. Uses gsd_wait_for_state_change to wait efficiently
# 5. When planning done: Assigns execution to a free slot
# 6. After execution: Reconciles next plan, then executes
# 7. After phase complete: Runs verify (must pass to unlock next phase)
# 8. Pipeline runs until complete - priority order enforced
```

**Pipeline with verify gates and reconciliation:**

```
Slot 1: [Plan P1] → [Execute 01-01] → [Reconcile 01-02] → [Execute 01-02] → [Verify P1]
Slot 2: [Plan P2] → [Execute 02-01] → [Reconcile 02-02] → idle
Slot 3: [Admin] → [Execute 02-02] → [Verify P2] → idle
Slot 4: [Admin] → [Admin] → [Admin]
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

- [ ] All phases planned
- [ ] All plans reconciled (validated against reality before execution)
- [ ] All plans executed
- [ ] All phases verified (quality gates passed)
- [ ] All checkpoints/prompts handled
- [ ] No failed sessions (or failures acknowledged)
- [ ] STATE.md updated with completion
      </success_criteria>

<guidelines>

**CRITICAL - ALWAYS USE THE HARNESS:**

The ENTIRE PURPOSE of /gsd:orchestrate is to use the parallel harness slots.
You MUST NEVER "fall back" to direct execution in this session.

- Previous failed sessions are IRRELEVANT - ignore them completely
- Start fresh sessions regardless of failure history
- If a session fails, RETRY it through the harness, don't do the work yourself
- If sessions keep failing repeatedly, REPORT THE ISSUE to the user
- NEVER say "Given harness instability, I'll execute directly" - that defeats the purpose

The user invoked /gsd:orchestrate specifically to use parallel slot execution.
If they wanted direct execution, they would use /gsd:execute-plan directly.

**SESSION LIFECYCLE - END AND RESTART, DON'T REUSE:**

When a session completes its work:

1. **Call `gsd_end_session(sessionId)`** to terminate the completed session
2. **Call `gsd_start_session(workingDir, newCommand)`** to start fresh work

**NEVER:**

- Type into a completed session's prompt (creates context bleed)
- Send /clear to reuse an existing session (inconsistent behavior)
- Assume the old session is ready for new work

**Ending + restarting is more consistent because:**

- Fresh context window for each task
- No state from previous work bleeding over
- Predictable behavior - each session does exactly one task
- Harness properly tracks session lifecycle

**CHECKPOINT/PROMPT RESPONSE FORMAT:**

When a session shows a selection prompt like:

```
❯ 1. Yes, proceed
  2. Adjust tasks
  3. Start over
Enter to select · ↑/↓ to navigate
```

Respond with:

- `gsd_respond_checkpoint(sessionId, "1")` - Select option 1
- `gsd_respond_checkpoint(sessionId, "\r")` - Press Enter (select highlighted)
- `gsd_respond_checkpoint(sessionId, "y")` - For yes/no prompts

**DO NOT** send the full option text. Just send the number or key.

**DO:**

- Follow task priority: Verify → Reconcile → Execute → Plan → Admin
- Use `gsd_wait_for_state_change` for efficient monitoring (not polling!)
- END sessions when complete, START fresh sessions for new work
- Run VERIFY after each phase completes (mandatory!)
- Run RECONCILE before each execution (validate plan against reality)
- Respond to prompts with simple inputs ("1", "y", "\r")
- ALWAYS start new sessions through the harness, regardless of previous failures

**DON'T:**

- Skip verify - it's the quality gate between phases
- Skip reconciliation - plans must match reality before execution
- Reuse completed sessions - always end and start fresh
- Poll repeatedly with gsd_get_output - use gsd_wait_for_state_change
- Type commands into existing session prompts
- Start planning Phase N+1 before Phase N is verified
- Ignore sessions waiting for input
- Let slots sit idle when there's queued work
- NEVER execute work directly in the orchestrator session

**Parallel is the goal (with quality gates):**

- All 4 slots can be busy simultaneously with any task type
- Priority order ensures verify and reconcile run when needed
- Pipeline: Execute → Reconcile → Execute → ... → Verify → Unlock next phase
  </guidelines>

<orphan_prevention>
**Session Lifecycle and Orphan Prevention**

The harness includes automatic orphan prevention mechanisms:

**Automatic Cleanup:**

1. **On Harness Restart**: Orphaned sessions from previous runs are detected and their processes are killed
2. **Session Timeout**: Sessions not polled for 10 minutes are automatically terminated
3. **Graceful Shutdown**: When harness stops, all running sessions are terminated

**Orchestrator Responsibilities:**

1. **Use efficient monitoring**: Call `gsd_wait_for_state_change` instead of polling (keeps sessions alive via timeout)
2. **End sessions properly**: Call `gsd_end_session` when a session completes, before starting new work
3. **Clean exit**: Before stopping orchestration, call `gsd_end_session` for each running session
4. **Handle errors**: If orchestrator crashes, harness will clean up on next restart

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
