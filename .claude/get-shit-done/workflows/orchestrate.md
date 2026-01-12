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

- **Slot 0 (Planning)**: Runs `/gsd:plan-phase X` - creates PLAN.md files
- **Slot 1 (Execution)**: Runs `/gsd:execute-plan [path]` - builds the code
- **Slot 2 (Verify)**: Runs verification tasks - tests, UAT, quality checks

Claude becomes the session coordinator—monitoring when sessions reach user prompts/hooks, responding to checkpoints, and keeping all slots productively busy.

"Claude as the conductor of a parallel GSD symphony."
</purpose>

<slot_architecture>

```
┌─────────────────────────────────────────────────────────────────────┐
│  GSD ORCHESTRATION HARNESS - Parallel Slot Architecture            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  SLOT 0: PLANNING          SLOT 1: EXECUTION        SLOT 2: VERIFY  │
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
Slot 0 (Plan):    [Plan P1]──────[Plan P2]──────[Plan P3]──────
Slot 1 (Execute):        [Exec P1-01]──[Exec P1-02]──[Exec P2-01]──
Slot 2 (Verify):                [Verify P1-01]──[Verify P1-02]──────
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

**Planning Queue (Slot 0):**

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
║  PLANNING (Slot 0):   [state]  Phase 2 planning                       ║
║  EXECUTION (Slot 1):  [state]  Phase 1 Plan 2 executing               ║
║  VERIFY (Slot 2):     [state]  Phase 1 Plan 1 verifying               ║
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

<step name="orchestration_loop">
**Main orchestration loop - repeat until all work complete:**

1. **Check all slot statuses:**
   Call `gsd_list_sessions` to get current state of all 3 slots.

2. **Check for sessions waiting for input:**
   For each slot, check if it's at a user prompt:
   - Call `gsd_get_output(sessionId, lines=20)`
   - Look for prompt patterns (see detect_user_prompt)
   - If waiting: Route to appropriate handler

3. **Handle checkpoints:**
   For slots in `waiting_checkpoint` state:
   - Call `gsd_get_checkpoint(sessionId)`
   - Route to checkpoint_handling step
   - Respond and continue

4. **Handle completed slots:**
   When a slot completes:
   - **Planning slot**: Refresh execution queue (new PLAN.md files)
   - **Execution slot**: Refresh verification queue, add to verify queue
   - **Verify slot**: Mark phase/plan as fully complete
   - Assign next work from appropriate queue

5. **Handle failed slots:**
   - Get output, analyze error
   - Offer: Retry, Skip, or Investigate
   - See error_handling step

6. **Assign work to idle slots:**

   **Slot 0 (Planning) idle:**
   - Check planning queue
   - Assign next phase that needs planning
   - `gsd_start_session(workingDir, "/gsd:plan-phase X")`

   **Slot 1 (Execution) idle:**
   - Check execution queue
   - Assign next PLAN.md that needs execution
   - `gsd_start_session(workingDir, "/gsd:execute-plan [path]")`

   **Slot 2 (Verify) idle:**
   - Check verification queue
   - Assign next completed execution that needs verification
   - `gsd_start_session(workingDir, "/gsd:verify-work")`

7. **Refresh queues after completions:**
   - After planning: Scan for new PLAN.md files
   - After execution: Scan for new SUMMARY.md files
   - Update queues accordingly

8. **Check if done:**
   - All queues empty AND all slots idle: Complete
   - Otherwise: Continue loop

**Polling interval:** Every 5-10 seconds to catch prompts quickly.
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
  Slot 0 (Plan):    Planning Phase 3
  Slot 1 (Execute): Executing 02-02-PLAN.md
  Slot 2 (Verify):  Verifying 01-03 execution

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

Slot: [0/1/2]
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
# 3. Assigns Slot 0: /gsd:plan-phase 1
# 4. Monitors for completion
# 5. When planning done: Assigns Slot 1 execution, Slot 0 next planning
# 6. Pipeline runs until complete
```

**Parallel pipeline in action:**

```
Slot 0: Plan Phase 1 → Plan Phase 2 → Plan Phase 3 → idle
Slot 1: wait → Execute 01-01 → Execute 01-02 → Execute 02-01
Slot 2: wait → wait → Verify 01-01 → Verify 01-02
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

- [ ] All phases planned (Slot 0 completed all planning)
- [ ] All plans executed (Slot 1 completed all execution)
- [ ] All work verified (Slot 2 completed all verification)
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
