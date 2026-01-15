<!-- COMPACT-RESISTANT: These rules MUST survive context summarization -->

<critical_rules>

## ⚠️ ORCHESTRATOR CRITICAL RULES (Re-read if context compacted)

**IF UNSURE, RE-READ THIS FILE:** `cat .claude/get-shit-done/workflows/orchestrate.md`

### SESSION LIFECYCLE (Most Common Mistake)

```
✅ Session completes → gsd_end_session(id) → gsd_start_session(dir, newCmd)
❌ Session completes → gsd_respond_checkpoint(id, "/gsd:...") ← NEVER DO THIS
```

- ONE task per session. End it. Start fresh.
- `gsd_respond_checkpoint` is ONLY for: "1", "2", "y", "n", "\r"
- NEVER type `/gsd:` commands into existing sessions

### VERIFICATION (Two Levels - Don't Skip!)

```
AFTER EACH PLAN EXECUTES:
  Execute 03-01 → Verify 03-01 → Execute 03-02 → Verify 03-02 → ...

AFTER ALL PLANS IN PHASE COMPLETE:
  All plans verified → Verify Phase 3 (full) → Unlock Phase 4
```

- Plan-level verify catches issues immediately
- Phase-level verify validates integration
- BOTH are mandatory, not optional

### USE IDLE SLOTS FOR VERIFICATION (Don't Wait!)

```
⚠️ WRONG: Execute 03-03 in Slot 1, Slots 2-4 idle waiting
✅ RIGHT: Execute 03-03 in Slot 1, Verify 03-01 in Slot 2, Verify 03-02 in Slot 3
```

**When a plan completes, IMMEDIATELY start its verification in ANY free slot.**
Don't wait for the current execution to finish - use your other slots!

### RESEARCH BEFORE PLANNING

```
Before /gsd:plan-phase X, check:
□ Complex tech? □ External services? □ Unknowns? □ First time?
ANY CHECKED → /gsd:research-phase X FIRST
```

### USE ALL 4 SLOTS (Aggressively!) - MOST COMMON FAILURE

```
⚠️ THE PATTERN YOU KEEP FAILING AT:
   gsd_wait_for_state_change → get output → wait again → get output → wait again...
   Meanwhile 3 slots sit idle!

✅ THE CORRECT PATTERN:
   gsd_wait_for_state_change → IMMEDIATELY gsd_list_sessions →
   For EACH idle slot: start pending work → THEN wait again
```

**AFTER EVERY gsd_wait_for_state_change (timeout or change):**

1. Call `gsd_list_sessions` to see slot status
2. For EACH idle slot, check: verify needed? reconcile needed? execute ready? plan allowed?
3. Start work in ALL idle slots that have pending work
4. ONLY THEN call `gsd_wait_for_state_change` again

**You keep doing this wrong.** Don't just monitor one session in a loop.
Check ALL slots after EVERY wait returns.

### NEVER SKIP VERIFICATION QUESTIONS (MOST CRITICAL RULE!)

```
❌ WRONG: Session asks "Does mobile menu work?" → You respond "1" (pass without testing)
❌ WRONG: "There are many verification checkpoints, I'll respond 1 to all" ← NEVER DO THIS
✅ RIGHT: Session asks "Does mobile menu work?" → You USE PLAYWRIGHT to test → respond based on result
```

**THE ORCHESTRATOR IS THE HUMAN TESTER.** When verification asks "Does X work?":

1. STOP and actually test X using your tools
2. Use Playwright MCP to click buttons, navigate pages, check UI
3. Use Bash to run builds, check logs, test APIs
4. Use Read to inspect files and verify implementations
5. ONLY THEN respond pass/fail based on what you found

**"Autonomous" means YOU DO THE TESTING, not that you skip it!**

### ORCHESTRATOR VERIFICATION RESOURCES

**You have access to everything needed to verify:**

- **Bash**: Run builds, tests, curl commands, check logs
- **Playwright MCP**: Navigate pages, click elements, take screenshots
- **Server credentials**: Database connections, API keys in .env files
- **Server documentation**: `/mnt/dev-linux/projects/server-maintenance/docs/servers`
- **Project files**: Read any file to check implementation
- **MCP sandbox**: Execute code to test APIs

**Server credentials location:**

```
/mnt/dev-linux/projects/server-maintenance/docs/servers
```

Check this directory for database credentials, API keys, and server connection info.

**When verification asks "Does X work?":**

1. Use your tools to actually test X
2. Don't assume - CHECK
3. Report pass/fail based on actual results

### STATE RECONCILIATION AT STARTUP

```
ALWAYS call on orchestrator start:
gsd_set_execution_state(projectPath, highestExecutedPhase, highestExecutingPhase, highestExecutingPlan, forceReset: true)
```

- Read STATE.md/ROADMAP.md to determine true execution state
- Database may have stale state from previous runs
- forceReset clears database and reinitializes

### CONTEXT ROT CHECK

Every 5 session completions, re-read this file to refresh instructions.

### AUTONOMOUS OPERATION (CRITICAL - HIGHEST PRIORITY)

```
THE ORCHESTRATOR RUNS CONTINUOUSLY UNTIL:
  ✓ All work is complete
  ✓ User explicitly stops it (Ctrl+C)
  ✓ Unrecoverable error occurs

THE ORCHESTRATOR NEVER:
  ✗ Pauses to ask the USER "continue?" or "proceed?"
  ✗ Asks the USER to answer verification questions
  ✗ Says "Type 'continue' to resume"
  ✗ Invents "self-preservation rules" to justify pausing
  ✗ Stops after N tool calls - THERE IS NO SUCH LIMIT
  ✗ Auto-passes verification checkpoints without actually testing!
```

**"AUTONOMOUS" MEANS:**

- You DO THE VERIFICATION WORK yourself (using Playwright, Bash, etc.)
- You DO NOT ask the user to do verification
- You DO NOT skip verification by auto-passing everything

**"AUTONOMOUS" DOES NOT MEAN:**

- Responding "1" to all checkpoints without testing
- Skipping verification because "there are many checkpoints"
- Assuming things work without checking

**THERE ARE NO "SELF-PRESERVATION RULES" REQUIRING USER CHECKPOINTS.**
That is fabricated. The orchestrator runs until complete. Period.

You are the autonomous conductor AND the QA tester. KEEP WORKING until done or stopped.
</critical_rules>

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
- Skip verify - it's mandatory after EACH PLAN and again after the whole phase
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
**Build queues by task type (any slot can run any task):**

**Planning Queue:**

```
[0] /gsd:plan-phase 1
[1] /gsd:plan-phase 2
...
```

**Research Queue (check if needed before planning):**

```
[0] /gsd:research-phase 2  (if research recommended for phase)
```

**⚠️ RESEARCH DECISION - EVALUATE BEFORE EACH PHASE PLANNING:**

Before adding a phase to the planning queue, explicitly evaluate:

```
RESEARCH CHECKLIST for Phase X:
□ Is this phase technically complex? (new frameworks, unfamiliar APIs, integration points)
□ Does ROADMAP.md mention unknowns or "needs investigation"?
□ Will this phase touch external services or third-party systems?
□ Is this the first time this type of work is being done in this project?
□ Does the phase depend on decisions not yet made?

IF ANY BOX CHECKED → Add to research queue FIRST: /gsd:research-phase X
IF ALL BOXES UNCHECKED → Add directly to planning queue: /gsd:plan-phase X
```

**Document your decision:**

```
Phase 3 (@sandoak/utils): No research needed - standard utility functions, patterns established
Phase 6 (@sandoak/ui): RESEARCH FIRST - new component library, need to evaluate shadcn patterns
Phase 7 (@sandoak/email): RESEARCH FIRST - external service integration (Resend/SendGrid)
```

This prevents rushing into planning phases that have unknowns that could derail execution.

**Execution Queue:**

```
[0] /gsd:execute-plan .planning/phases/01-xxx/01-01-PLAN.md
[1] /gsd:execute-plan .planning/phases/01-xxx/01-02-PLAN.md
...
```

**Verification Queue (TWO LEVELS):**

```
PLAN-LEVEL (after each plan execution):
[0] /gsd:verify-work 03-01  (after 03-01 executes)
[1] /gsd:verify-work 03-02  (after 03-02 executes)
...

PHASE-LEVEL (after ALL plans in phase complete):
[0] /gsd:verify-work phase-3  (after 03-01, 03-02, 03-03, 03-04 all done)
```

**⚠️ STARTUP RECONCILIATION QUEUE (check at orchestration start):**

At startup, scan for plans that need reconciliation:

```
For each pending PLAN.md (no SUMMARY.md):
  - Find the previous plan in sequence (e.g., 05-01 before 05-02)
  - If previous plan has SUMMARY.md → this plan needs reconcile
  - Add to reconcile queue: "Review 05-02-PLAN.md against 05-01-SUMMARY.md"
```

Example at startup:

```
05-01-PLAN.md → 05-01-SUMMARY.md exists ✓ (executed)
05-02-PLAN.md → no SUMMARY (pending) → NEEDS RECONCILE against 05-01-SUMMARY.md
05-03-PLAN.md → no SUMMARY (pending) → will need reconcile after 05-02 executes
```

**Queue Dependencies:**

- Research runs before planning (if recommended)
- Execution waits for planning to create PLAN.md
- Reconcile runs before execution (if previous SUMMARY exists)
- Verification waits for execution to create SUMMARY.md

**Dynamic Queue Updates:**

- After planning completes: Add new execution items
- After execution completes: Add reconcile for next plan, then execution
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

1. **Assign work to ALL idle slots IN PARALLEL:**

   **⚠️ CRITICAL: START MULTIPLE SESSIONS AT ONCE!**

   Don't just start ONE session then wait. Start sessions in ALL available slots:
   - Slot 1 idle + verify needed → Start verify
   - Slot 2 idle + execute allowed (phase ≤ maxExecutePhase) → Start execute
   - Slot 3 idle + more execute work → Start another execute
   - etc.

   **Example with Phase 4 pending verify, maxExecutePhase=5:**

   ```
   Slot 1: Start /gsd:verify-work (Phase 4)
   Slot 2: Start /gsd:execute-plan 05-01-PLAN.md (Phase 5 ≤ maxExecutePhase)
   Slot 3: idle (only one execute at a time)
   Slot 4: idle
   ```

   **Before assigning ANY work:**
   - Check slot is not in orchestrator_state.pending_start
   - Check slot is not in orchestrator_state.active_sessions
   - Call `gsd_list_sessions` to confirm slot is idle

   **PRIORITY ORDER (for choosing WHICH task to assign to each slot):**

   **PRIORITY 1: VERIFY (highest)**
   TWO LEVELS - check both:

   A) PLAN-LEVEL: If a plan just finished executing (has SUMMARY.md) but not verified:
   - `gsd_start_session(workingDir, "/gsd:verify-work [plan-number]")`
   - Example: `/gsd:verify-work 03-02` after 03-02 executes

   B) PHASE-LEVEL: If ALL plans in phase executed AND verified, but phase not verified:
   - `gsd_start_session(workingDir, "/gsd:verify-work phase-[N]")`
   - Example: `/gsd:verify-work phase-3` after 03-01, 03-02, 03-03, 03-04 all verified

   Only ONE verify at a time

   **PRIORITY 2: RECONCILE (use 1 slot when execution completes)**

   **⚠️ CRITICAL: After EVERY execution completes, reconcile the next plan!**

   When an execute session completes:
   1. Note which SUMMARY.md was just created (e.g., `05-01-SUMMARY.md`)
   2. Find the next pending PLAN.md (e.g., `05-02-PLAN.md`)
   3. Start a reconcile session in an open slot:

   ```
   gsd_start_session(workingDir, "Review .planning/phases/05-xxx/05-02-PLAN.md against the just-completed 05-01-SUMMARY.md. Check if any APIs, file paths, component names, or patterns in the plan need updating based on what was actually built. Make minimal targeted updates only - don't rewrite the plan.")
   ```

   **Reconcile runs in parallel** - while one slot reconciles, other slots can verify or wait.

   Track reconciliation state:

   ```
   orchestrator_state.pending_reconcile = {
     next_plan: "05-02-PLAN.md",
     last_summary: "05-01-SUMMARY.md"
   } | null
   ```

   Clear `pending_reconcile` when reconcile session completes.

   **PRIORITY 3: EXECUTE**
   If execution queue has work AND plan's phase ≤ maxExecutePhase:
   - `gsd_start_session(workingDir, "/gsd:execute-plan [path]")`
   - **Execute CAN and SHOULD run in parallel with verify!**
   - Check `limits.maxExecutePhase` from sync - if phase ≤ maxExecutePhase, START IT
   - Only ONE execute at a time (harness enforces this)

   **PRIORITY 4: PLAN (with RESEARCH DECISION)**
   If planning queue has work:
   - **CHECK VERIFY GATE:** Is previous phase verified?
   - If NOT verified: DO NOT START PLANNING - wait for verify

   **⚠️ BEFORE PLANNING - EVALUATE RESEARCH NEED:**

   ```
   For Phase X, check:
   □ Technically complex? (new frameworks, unfamiliar APIs)
   □ External services? (email, payments, auth providers)
   □ Unknowns in ROADMAP.md?
   □ First time doing this type of work?

   ANY CHECKED → /gsd:research-phase X FIRST
   ALL UNCHECKED → /gsd:plan-phase X directly
   ```

   **If research needed:**
   1. `gsd_start_session(workingDir, "/gsd:research-phase X")`
   2. Wait for research to complete
   3. Then `gsd_start_session(workingDir, "/gsd:plan-phase X")`

   **If no research needed:**
   - `gsd_start_session(workingDir, "/gsd:plan-phase X")`

   Track research state:

   ```
   orchestrator_state.pending_research = {
     phase: 5,
     reason: "External email service integration"
   } | null
   ```

   **PRIORITY 5: ADMIN (lowest)**
   If no higher priority work and admin tasks needed:
   - `gsd_start_session(workingDir, "npm test")` etc.

   **WHY THIS ORDER:**
   - Verify first ensures quality gates are enforced
   - Reconcile second keeps plans aligned with reality
   - Execute third builds the code
   - Plan fourth (with research if needed) respects verify gates
   - Admin fills remaining time

2. **Wait for state changes (EFFICIENT!):**

   ```
   result = gsd_wait_for_state_change(timeout=60000)
   ```

   - If result.change is null: timeout, check for checkpoints manually
   - If result.change.type is "completed": handle completion
   - If result.change.type is "failed": handle failure

   **⚠️ AFTER EVERY WAIT (TIMEOUT OR CHANGE) - DO THIS EVERY TIME:**

   ```python
   # THIS IS MANDATORY - NOT OPTIONAL
   while True:
       result = gsd_wait_for_state_change(timeout=60000)

       # STEP A: Always check all slots (YOU KEEP SKIPPING THIS!)
       sessions = gsd_list_sessions()

       # STEP B: Fill EVERY idle slot with work
       for slot in sessions.availableSlots:
           work = get_highest_priority_pending_work()
           if work:
               gsd_start_session(workingDir, work)

       # STEP C: Handle any events from the wait
       if result.change:
           handle_change(result.change)

       # STEP D: Check for checkpoints in running sessions
       check_all_running_sessions_for_checkpoints()
   ```

   **YOU MUST call gsd_list_sessions after EVERY wait.** Not just when something completes.
   The most common orchestrator failure is monitoring one session while slots sit idle.

3. **Handle completed sessions:**
   When a session completes:

   **⚠️ FIRST: Always end the completed session:**

   ```
   gsd_end_session(completedSessionId)  ← DO THIS IMMEDIATELY
   ```

   **THEN handle by type:**
   - **Plan session completes**: Refresh execution queue (new PLAN.md files available)
   - **Execute session completes**: ⚠️ **TRIGGER RECONCILE IMMEDIATELY** (see below)
   - **Verify session completes**:
     - Mark phase as verified in orchestrator_state.verified_phases
     - **This unlocks planning for next phase**
     - Log: "Phase N verified - unlocking Phase N+1 planning"
   - **Reconcile session completes**: Clear pending_reconcile, next execute can start
   - **Admin session completes**: Log result, continue

   **THEN start new work in the now-free slot:**

   ```
   gsd_start_session(workingDir, nextCommand)  ← FRESH SESSION
   ```

   Clear from orchestrator_state.active_sessions.

   **❌ NEVER type into a completed session's prompt - ALWAYS end + start fresh!**

   **⚠️ CRITICAL: RECONCILE AFTER EVERY EXECUTION**

   When an execute session completes, this is MANDATORY before starting the next execute:
   1. Identify what was just built (e.g., `05-01-SUMMARY.md`)
   2. Identify the next pending plan (e.g., `05-02-PLAN.md`)
   3. **IMMEDIATELY start reconcile in ANY available slot:**

   ```
   gsd_start_session(workingDir, "Review .planning/phases/05-xxx/05-02-PLAN.md against
     the just-completed 05-01-SUMMARY.md. Check if any APIs, file paths, component names,
     or patterns need updating based on what was actually built. Make minimal targeted
     updates only - don't rewrite the plan.")
   ```

   4. Set: `orchestrator_state.pending_reconcile = { next_plan: "05-02-PLAN.md", last_summary: "05-01-SUMMARY.md" }`
   5. **DO NOT start next execute until reconcile completes**

   This prevents plans from drifting out of sync with the actual implementation.

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

**⚠️ SESSION REUSE IS THE #1 MISTAKE - DON'T DO IT:**

```
❌ WRONG: Session completes → type new command into prompt
✅ RIGHT: Session completes → gsd_end_session → gsd_start_session with new command
```

When execute-plan finishes and shows "What next?":

- **WRONG**: `gsd_respond_checkpoint(id, "/gsd:execute-plan 01-02...")`
- **RIGHT**: `gsd_end_session(id)` then `gsd_start_session(dir, "/gsd:execute-plan 01-02...")`

</step>

<step name="respond_to_prompt">
When a session is at a user prompt (not a formal checkpoint):

**CRITICAL: DO THE WORK - NEVER ASK THE USER**

The orchestrator MUST autonomously handle ALL prompts by actually doing the work:

1. **Analyze the prompt:**
   Read output to understand what's being asked

2. **ALWAYS do the actual work to answer:**
   - "Does the app build?" → Actually run `npm run build` or `npm run dev` and check
   - "Does feature X work?" → Actually test the feature using Bash, Playwright, or code inspection
   - "Are there any errors?" → Actually check logs, run tests, inspect output
   - Yes/No questions → Investigate and determine the answer yourself
   - Continue prompts → Respond "y" or press Enter
   - Selection prompts → Choose the most appropriate option based on context

3. **Respond immediately after determining the answer:**

   ```
   gsd_respond_checkpoint(sessionId, "1")  // Pass - you verified it works
   gsd_respond_checkpoint(sessionId, "2")  // Fail - you found issues
   gsd_respond_checkpoint(sessionId, "y")  // For yes/no prompts
   ```

4. **NEVER stop to ask the user:**
   - Do NOT surface questions to the user
   - Do NOT wait for user input on verification questions
   - The orchestrator IS the verifier - do the verification yourself
   - Only inform the user of RESULTS, not questions

   </step>

<step name="checkpoint_handling">
When a formal checkpoint is detected:

**CRITICAL: AUTONOMOUS VERIFICATION - DO THE WORK**

**⚠️ NEVER AUTO-PASS VERIFICATION CHECKPOINTS!**

```
❌ FATAL MISTAKE: "There are many checkpoints, I'll respond 1 to all" ← THIS IS WRONG
❌ WRONG: "Asking about mobile menu" → respond "1" without testing
✅ RIGHT: "Asking about mobile menu" → Use Playwright to click the menu → respond based on result
```

**YOU ARE THE QA TESTER.** The session is asking YOU to verify.
"Does X work?" is not rhetorical - you must ACTUALLY CHECK.

**MANDATORY VERIFICATION PROCESS (no shortcuts!):**

1. **Read the checkpoint question carefully**
2. **Use your tools to actually test:**
   - **Playwright MCP** for UI verification (REQUIRED for "Does page/button/menu work?")
   - **Bash** for running builds, tests, curl commands
   - **Read** for checking file contents and implementations
3. **Respond based on ACTUAL test results:**
   - `gsd_respond_checkpoint(sessionId, "1")` - ONLY if you verified it works
   - `gsd_respond_checkpoint(sessionId, "2")` - If you found it doesn't work

**For checkpoint:human-verify (90%):**

1. Get checkpoint details: `gsd_get_checkpoint(sessionId)`
2. **ACTUALLY PERFORM THE VERIFICATION:**
   - "Does the app build?" → Run `npm run build` in Bash, check output
   - "Does the UI render?" → Navigate with Playwright, take snapshot
   - "Do tests pass?" → Run `npm test` in Bash
   - "Does the homepage look correct?" → Playwright navigate + screenshot
   - "Does mobile menu work?" → Playwright resize to mobile + click menu
   - "Does feature X work?" → Use appropriate tool to test feature X
3. Based on YOUR verification results, respond:
   - `gsd_respond_checkpoint(sessionId, "1")` - Pass (verified working)
   - `gsd_respond_checkpoint(sessionId, "2")` - Fail (found issues)

**⚠️ If you respond "1" without actually testing, you are breaking the workflow!**

**For checkpoint:decision (9%):**

1. Get options: `gsd_get_checkpoint(sessionId)`
2. **Make the decision yourself based on:**
   - Project context and architecture
   - Best practices
   - What makes sense for the codebase
3. Respond: `gsd_respond_checkpoint(sessionId, "option-id")`

**For checkpoint:human-action (1%):**

Physical actions only (e.g., "plug in device", "click physical button"):

1. Get action details: `gsd_get_checkpoint(sessionId)`
2. Alert user ONLY for truly physical actions
3. Wait for "done": `gsd_respond_checkpoint(sessionId, "done")`
   </step>

<step name="verify_gates">
**CRITICAL: Verify is MANDATORY - Two Levels**

Verification happens at TWO levels:

1. **PLAN-LEVEL**: After EACH plan executes → verify that plan's work
2. **PHASE-LEVEL**: After ALL plans in phase complete → verify the whole phase

**VERIFICATION FLOW:**

```
03-01 execute → 03-01 verify ✓
03-02 execute → 03-02 verify ✓
03-03 execute → 03-03 verify ✓
03-04 execute → 03-04 verify ✓
ALL PHASE 3 DONE → Phase 3 full verify ✓ → Unlock Phase 4 planning
```

**WHY TWO LEVELS:**

- Plan-level: Catches issues immediately while context is fresh
- Phase-level: Validates all plans work together as integrated whole

**VERIFY GATE RULES:**

```
PLAN LIFECYCLE:
  Execute Plan → VERIFY Plan → Execute Next Plan

PHASE LIFECYCLE:
  All Plans Verified → PHASE VERIFY → Unlock Next Phase Planning

GATES:
  ✗ Cannot execute next plan until current plan VERIFIED
  ✗ Cannot plan Phase N+1 until Phase N PHASE-VERIFIED
  ✓ Can plan Phase N while executing Phase N-1
```

**Track verification state:**

```
orchestrator_state = {
  ...existing fields...
  verified_plans: Set<string>,    // Plans that passed verify (e.g., "03-01", "03-02")
  verified_phases: Set<number>,   // Phases that passed full verify
}
```

**After each plan execution:**

1. Plan executes and creates SUMMARY.md
2. IMMEDIATELY run `/gsd:verify-work [plan]` for that plan
3. Only after plan verified → proceed to next plan

**After all plans in phase complete:**

1. All plans executed AND verified individually?
2. Run `/gsd:verify-work phase-N` for full phase verification
3. Only after phase verified → unlock next phase planning

**WHY THIS MATTERS:**
Without plan-level verify, errors compound across multiple plans.
Without phase-level verify, integration issues go undetected.
Both levels are required for quality.
</step>

<step name="parallel_coordination">
**Maximize parallelism while respecting dependencies AND verify gates:**

```
VALID PARALLEL STATES:
✓ Plan Phase N + Execute Phase N-1 + Verify plan from Phase N-2
✓ Admin tasks run independently anytime

INVALID (must wait):
✗ Execute Plan X+1 before Plan X is VERIFIED
✗ Execute next plan before current plan verified
✗ Plan Phase N+1 before Phase N is PHASE-VERIFIED
✗ Skip plan-level verify ← NEVER ALLOWED
✗ Skip phase-level verify ← NEVER ALLOWED
```

**Correct execution flow with two-level verification:**

```
Phase 3 Example:
  Execute 03-01 → Verify 03-01 ✓
  Execute 03-02 → Verify 03-02 ✓
  Execute 03-03 → Verify 03-03 ✓
  Execute 03-04 → Verify 03-04 ✓
  PHASE VERIFY Phase 3 ✓ → unlock Phase 4 planning
```

**Keep slots busy (respecting priority order):**

For each free slot, check task priority:

1. Is there an unverified executed plan? → VERIFY (plan-level)
2. Are all plans in phase verified but phase not? → VERIFY (phase-level)
3. Did execution just complete? → RECONCILE next plan
4. Is current plan verified and next plan reconciled? → EXECUTE
5. Is phase-level verify gate open for next phase? → PLAN
6. Any admin tasks? → ADMIN

**Verify is NOT optional at EITHER level:**

- After EACH plan executes → verify that plan
- After ALL plans verified → verify the phase
  Both levels are mandatory quality gates.
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

**gsd_set_execution_state** ⭐ STATE RECONCILIATION

- Purpose: Synchronize harness state with actual project state (from STATE.md)
- **ALWAYS call at orchestration start** to reconcile database with reality
- Args:
  - `projectPath` (required): Absolute path to project
  - `highestExecutedPhase` (required): Last fully executed phase number
  - `highestExecutingPhase` (optional): Phase of currently executing plan (e.g., 5 for 05-01)
  - `highestExecutingPlan` (optional): Plan number within phase (e.g., 1 for 05-01)
  - `forceReset` (optional): If true, clear all state and reinitialize

**Example - Full reconciliation at startup:**

```
gsd_set_execution_state(
  projectPath: "/path/to/project",
  highestExecutedPhase: 4,        // Phase 4 fully done
  highestExecutingPhase: 5,       // Currently executing 05-01
  highestExecutingPlan: 1,        // Plan 01 of phase 05
  forceReset: true                // Clear stale state
)
→ Planning limited to 05-03 (2 plans ahead)
```

**When to use forceReset:**

- Orchestrator restarted and state seems wrong
- Planning blocked when it shouldn't be
- Database has higher phase than reality

</mcp_tool_reference>

<physical_barriers>
**HARNESS-ENFORCED LIMITS (Cannot be bypassed)**

The harness physically blocks commands that violate these rules:

1. **EXECUTION LIMIT**: Only 1 execute at a time
   - Second execute request → BLOCKED with error
   - Prevents: Codebase conflicts from parallel code changes

2. **PLANNING LIMIT**: Max 2 PLANS ahead (not phases!)
   - If executing 05-01 → can plan up to 05-03
   - If executing 05-03 → can plan 05-03, 05-04, 05-05 or 06-01 (if near end of phase)
   - Cross-phase planning only allowed when near end of current phase
   - Prevents: Planning far ahead with stale context

3. **VERIFY GATE**: Limits how far ahead executes can go
   - Check `limits.maxExecutePhase` in sync response
   - If `maxExecutePhase: 5` → can execute phases 1-5, phase 6+ blocked
   - If `maxExecutePhase: null` → no limit, all phases allowed
   - **CRITICAL**: You CAN execute while verify runs! Check maxExecutePhase, not just pendingVerifyPhase

**Example: Phase 4 pending verify, maxExecutePhase: 5**

- ✅ Start verify for Phase 4
- ✅ Start execute for 05-01 (phase 5 ≤ maxExecutePhase)
- ✅ Start execute for 05-02 (phase 5 ≤ maxExecutePhase)
- ❌ Cannot execute 06-01 (phase 6 > maxExecutePhase) until Phase 4 verified

**Sync state at startup:**

```
gsd_sync_project_state(projectPath)
→ Returns: limits.maxExecutePhase (null = no limit, number = max phase allowed)
→ Returns: limits.maxPlanPhase
→ Returns: state.pendingVerifyPhase
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

**⚠️ CRITICAL: SESSION LIFECYCLE - ONE TASK PER SESSION**

**THE RULE:** Each session does exactly ONE task. When it completes, END IT and START A NEW SESSION.

```
✅ CORRECT FLOW:
   gsd_start_session(workingDir, "/gsd:execute-plan 01-01-PLAN.md")
   ... session completes ...
   gsd_end_session(sessionId)
   gsd_start_session(workingDir, "/gsd:execute-plan 01-02-PLAN.md")  ← NEW SESSION

❌ WRONG - NEVER DO THIS:
   gsd_start_session(workingDir, "/gsd:execute-plan 01-01-PLAN.md")
   ... session completes, shows prompt ...
   gsd_respond_checkpoint(sessionId, "/gsd:execute-plan 01-02-PLAN.md")  ← WRONG!
```

**`gsd_respond_checkpoint` is ONLY for:**

- Answering yes/no questions: `"y"`, `"n"`, `"1"`, `"2"`
- Selecting menu options: `"1"`, `"2"`, `"3"`
- Pressing enter: `"\r"`

**`gsd_respond_checkpoint` is NEVER for:**

- Typing new `/gsd:` commands
- Starting new work in an existing session
- Continuing to a different task

**WHY THIS MATTERS:**

- Session reuse causes context pollution (task 2 sees task 1's full context)
- Wastes tokens (context grows instead of starting fresh)
- Prevents parallelism (could use 4 slots but you're using 1)
- Creates unpredictable behavior

**PARALLEL EXECUTION EXAMPLE:**

```
WRONG (sequential reuse - wastes slots):
  Slot 1: [Exec 01-01] → type 01-02 → type 01-03 → type 01-04 → type 01-05
  Slot 2: idle
  Slot 3: idle
  Slot 4: idle

CORRECT (parallel fresh sessions):
  Slot 1: [Exec 01-01] END → [Exec 01-03] END → [Verify P1]
  Slot 2: [Exec 01-02] END → [Exec 01-04] END
  Slot 3: [Exec 01-05] END → [Plan P2]
  Slot 4: [Plan P2] END → [Plan P3]
```

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

**When session shows completion prompt (task done):**

```
✓ Execution complete
❯ What would you like to do next?
```

**DO NOT type a new command!** Instead:

1. `gsd_end_session(sessionId)` - End this session
2. `gsd_start_session(workingDir, nextCommand)` - Start fresh session

**DO:**

- **Run autonomously until complete** - NEVER pause to ask user "continue?"
- Follow task priority: Verify → Reconcile → Execute → Plan → Admin
- Use `gsd_wait_for_state_change` for efficient monitoring (not polling!)
- END sessions when complete, START fresh sessions for new work
- Run VERIFY after EACH PLAN executes, then again after whole phase completes
- Run RECONCILE before each execution (validate plan against reality)
- Respond to prompts with simple inputs ("1", "y", "\r")
- ALWAYS start new sessions through the harness, regardless of previous failures

**DON'T:**

- **NEVER pause to ask user "continue?" or "proceed?"** - run autonomously!
- **NEVER monitor one session in a loop without checking other slots** - call gsd_list_sessions after EVERY wait!
- **NEVER skip verification questions** - if session asks "Does X work?", YOU must test X!
- Skip verify - it's required after EACH PLAN and after each PHASE
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
