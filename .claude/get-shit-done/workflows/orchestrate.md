<trigger>
Use this workflow when:
- User invokes /gsd:orchestrate
- Harness MCP tools are available (gsd_* tools visible)
- Parallel GSD session execution is desired
- Managing multiple phases/plans across session slots
</trigger>

<purpose>
Orchestrate multiple GSD sessions in parallel using the harness MCP tools.
Claude becomes the session coordinator—assigning work to slots, monitoring progress, handling checkpoints, and driving execution to completion.

"Claude as the conductor of a parallel GSD symphony."
</purpose>

<required_reading>
Before orchestrating, ensure context:

- ROADMAP.md: Know which phases/plans exist
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
Ensure the harness is running and configured in your MCP settings.

Start with: pnpm harness:start (in the harness repo)
```

Proceed only if harness is accessible.
</step>

<step name="load_project_context">
Load project state to understand what work needs orchestration:

```bash
cat .planning/ROADMAP.md
cat .planning/STATE.md
```

Extract:

- Current phase position
- Phases/plans that need execution
- Any incomplete work from previous sessions

Build a work queue of plans to execute.
</step>

<step name="display_session_status">
Present current harness state:

```
╔══════════════════════════════════════════════════════════════════════╗
║  GSD ORCHESTRATION HARNESS                                            ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  Slot 0: [state]  [current work if any]                               ║
║  Slot 1: [state]  [current work if any]                               ║
║  Slot 2: [state]  [current work if any]                               ║
║                                                                        ║
║  Project: [project name from STATE.md]                                ║
║  Progress: [progress bar] XX%                                          ║
║                                                                        ║
╚══════════════════════════════════════════════════════════════════════╝
```

State indicators:

- `idle`: Available for work assignment
- `running`: Executing a plan
- `waiting_checkpoint`: Needs attention
- `completed`: Finished, slot available
- `failed`: Error occurred

</step>

<step name="orchestration_loop">
**Main orchestration loop - repeat until all work complete:**

1. **Check slot statuses:**
   Call `gsd_list_sessions` to get current state of all slots.

2. **Handle completed/failed slots:**
   - Completed: Log success, mark slot as available
   - Failed: Log error, decide whether to retry or skip

3. **Handle waiting_checkpoint slots:**
   For each slot in `waiting_checkpoint` state:
   - Call `gsd_get_checkpoint(sessionId)` to get checkpoint details
   - Route to checkpoint_handling step
   - After handling, continue monitoring

4. **Assign work to idle slots:**
   For each idle slot:
   - If work queue has items, assign next plan
   - Call `gsd_start_session(workingDir, command)`
   - Command format: `/gsd:execute-plan .planning/phases/XX-name/XX-NN-PLAN.md`

5. **Monitor running slots:**
   For running slots, periodically:
   - Call `gsd_get_output(sessionId, lines=50)` to check progress
   - Look for completion indicators or errors
   - Update display

6. **Check if done:**
   - If no running slots and work queue empty: Complete
   - Otherwise: Continue loop

**Polling interval:** Every 10-30 seconds for running slots.
</step>

<step name="checkpoint_handling">
When a checkpoint is detected, handle based on type:

**For checkpoint:human-verify (90%):**

1. Call `gsd_get_checkpoint(sessionId)` to get details
2. Review what was built and verification steps
3. If verification can be automated (file checks, curl, etc.):
   - Perform verification
   - If passes: `gsd_respond_checkpoint(sessionId, "approved")`
   - If fails: `gsd_respond_checkpoint(sessionId, "Issue: [description]")`
4. If verification requires human judgment (visual UI):
   - Surface to user with instructions
   - Wait for user response
   - Relay response via `gsd_respond_checkpoint`

**For checkpoint:decision (9%):**

1. Call `gsd_get_checkpoint(sessionId)` to get options
2. Present decision to user:
   ```
   ╔══════════════════════════════════════════════════════════════════════╗
   ║  CHECKPOINT: Decision Required                                        ║
   ╠══════════════════════════════════════════════════════════════════════╣
   ║  Session: [slot] - [current plan]                                     ║
   ║                                                                        ║
   ║  Decision: [what needs to be decided]                                 ║
   ║                                                                        ║
   ║  Options:                                                              ║
   ║  1. [option-a]: [description]                                         ║
   ║  2. [option-b]: [description]                                         ║
   ╚══════════════════════════════════════════════════════════════════════╝
   ```
3. Wait for user to select option
4. Call `gsd_respond_checkpoint(sessionId, "option-id")` with choice

**For checkpoint:human-action (1%):**

1. Call `gsd_get_checkpoint(sessionId)` to get action needed
2. Alert user:
   ```
   ╔══════════════════════════════════════════════════════════════════════╗
   ║  CHECKPOINT: Manual Action Required                                   ║
   ╠══════════════════════════════════════════════════════════════════════╣
   ║  Session: [slot] - [current plan]                                     ║
   ║                                                                        ║
   ║  Action needed: [description]                                         ║
   ║  Instructions: [step-by-step]                                         ║
   ║                                                                        ║
   ║  Type "done" when complete                                            ║
   ╚══════════════════════════════════════════════════════════════════════╝
   ```
3. Wait for user to type "done"
4. Call `gsd_respond_checkpoint(sessionId, "done")`

After any checkpoint is handled, return to orchestration_loop.
</step>

<step name="progress_reporting">
Periodically display overall progress:

```
═══════════════════════════════════════════════════════════════════════
ORCHESTRATION PROGRESS
═══════════════════════════════════════════════════════════════════════

Phases: [completed]/[total]
Plans:  [completed]/[total]

Active Sessions:
  Slot 0: [state] - Phase X Plan Y
  Slot 1: [state] - Phase X Plan Y
  Slot 2: [state] - idle

Completed This Session:
  ✓ 02-01: Foundation setup
  ✓ 02-02: Core types
  → 02-03: Integration (running)

Queue Remaining:
  - 03-01: API implementation
  - 03-02: Testing

═══════════════════════════════════════════════════════════════════════
```

</step>

<step name="work_assignment_strategy">
When assigning work to slots, consider:

**Sequential dependencies:**

- Check ROADMAP.md for phase dependencies
- Don't start Phase N until Phase N-1 is complete
- Plans within a phase can sometimes run in parallel

**Parallel-safe work:**

- Different phases working on different subsystems
- Documentation tasks (can run alongside any phase)
- Test-only plans (independent of feature work)

**Assignment priority:**

1. Resume incomplete work (PLAN without SUMMARY)
2. Next sequential plan in current phase
3. Start next phase if current is complete

**Example assignment:**

```
Work Queue:
  [0] 02-03-PLAN.md (current phase, next in sequence)
  [1] 03-01-PLAN.md (next phase, first plan)
  [2] docs-update.md (parallel-safe)

Slot 0 idle → Assign 02-03
Slot 1 idle → Assign 03-01 (if Phase 2 deps met)
Slot 2 idle → Assign docs-update
```

</step>

<step name="error_handling">
When a session fails:

1. Call `gsd_get_output(sessionId, lines=100)` to see error context
2. Analyze error:
   - Build failure: May be fixable
   - Test failure: May need investigation
   - Unrecoverable: Skip and continue

3. Options:

   ```
   Session [slot] failed during [plan]:

   [error summary from output]

   Options:
   1. Retry - Start the plan again
   2. Skip - Mark as failed, continue with next work
   3. Investigate - Show full output for debugging
   ```

4. If retry: Call `gsd_end_session(sessionId)` then `gsd_start_session` with same plan
5. If skip: Call `gsd_end_session(sessionId)`, remove from queue, continue
6. If investigate: Present output, wait for user guidance
   </step>

<step name="completion">
When all work is complete:

```
╔══════════════════════════════════════════════════════════════════════╗
║  ORCHESTRATION COMPLETE                                               ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  ✓ All phases complete                                                ║
║  ✓ All plans executed                                                 ║
║                                                                        ║
║  Sessions Summary:                                                     ║
║    Completed: [N] plans                                               ║
║    Failed: [N] plans                                                  ║
║    Checkpoints handled: [N]                                           ║
║                                                                        ║
║  Project state updated in STATE.md                                    ║
║                                                                        ║
╚══════════════════════════════════════════════════════════════════════╝
```

Update STATE.md with orchestration completion.
</step>

</process>

<mcp_tool_reference>
Quick reference for harness MCP tools:

**gsd_list_sessions**

- Purpose: Get status of all session slots
- Args: none
- Returns: `{ slots: [{ id, slot, state, projectPath, command }] }`
- Use: Check available slots, find waiting checkpoints

**gsd_start_session**

- Purpose: Start a new GSD session in an available slot
- Args: `workingDir` (project path), `command` (e.g., "/gsd:execute-plan ...")
- Returns: `{ sessionId, slot }`
- Use: Assign work to an idle slot

**gsd_end_session**

- Purpose: Terminate a running session
- Args: `sessionId`
- Returns: `{ success: true }`
- Use: Clean up failed sessions, stop runaway processes

**gsd_get_output**

- Purpose: Get recent output from a session
- Args: `sessionId`, `lines` (optional, default 50)
- Returns: `{ output: "..." }`
- Use: Monitor progress, debug failures

**gsd_get_state**

- Purpose: Parse .planning/ directory and return GSD state
- Args: `sessionId`
- Returns: Parsed STATE.md, ROADMAP.md content
- Use: Check session's project state

**gsd_get_checkpoint**

- Purpose: Get checkpoint info if session is waiting
- Args: `sessionId`
- Returns: `{ type, taskNumber, totalTasks, content, rawContent }`
- Use: Inspect checkpoint before responding

**gsd_respond_checkpoint**

- Purpose: Send response to a waiting checkpoint
- Args: `sessionId`, `response` (e.g., "approved", "option-a", "done")
- Returns: `{ success: true }`
- Use: Continue execution after checkpoint
  </mcp_tool_reference>

<usage_examples>

**Start orchestration on a project:**

```
cd /path/to/my-project
/gsd:orchestrate
```

**Typical orchestration flow:**

1. Orchestrator checks harness availability
2. Loads ROADMAP.md to build work queue
3. Assigns plans to available slots
4. Monitors execution, handles checkpoints
5. Assigns next work as slots complete
6. Reports final status

**Handling a decision checkpoint:**

```
Checkpoint detected on Slot 1...

Calling gsd_get_checkpoint("session-abc")...

Decision: Select authentication provider

Options:
1. supabase: Built-in with DB
2. clerk: Best DX, paid at scale
3. nextauth: Free, self-hosted

[User selects: supabase]

Calling gsd_respond_checkpoint("session-abc", "supabase")...

Session continuing...
```

**Assigning parallel work:**

```
Slot 0: idle
Slot 1: idle
Slot 2: running (02-03)

Work queue:
  - 03-01-PLAN.md (Phase 3, can start after Phase 2 complete)
  - 03-02-PLAN.md (Phase 3, depends on 03-01)

Checking dependencies...
02-03 still running, Phase 2 not complete.
Cannot start Phase 3 yet.

Slots 0,1 remain idle - waiting for 02-03.
```

</usage_examples>

<success_criteria>
Orchestration succeeds when:

- [ ] All plans in work queue executed
- [ ] No sessions in failed state (or failures acknowledged)
- [ ] All checkpoints handled appropriately
- [ ] STATE.md reflects current project position
- [ ] User informed of completion status
      </success_criteria>

<guidelines>

**DO:**

- Check harness availability before proceeding
- Monitor all slots, not just the one you just assigned
- Handle checkpoints promptly to avoid blocking
- Log progress for visibility
- Gracefully handle failures with retry/skip options

**DON'T:**

- Start work without understanding project state
- Ignore waiting_checkpoint states
- Assign dependent work before dependencies complete
- Leave sessions running indefinitely without monitoring
- Assume success without checking session completion

**When to use orchestration mode:**

- Large projects with many phases
- When you want Claude to manage multiple parallel sessions
- When human wants to step back from manual plan execution
- When checkpoints can be largely automated

**When NOT to use orchestration:**

- Single-plan work (just run /gsd:execute-plan directly)
- When every checkpoint needs human judgment
- When dependencies are complex and need careful sequencing
  </guidelines>
