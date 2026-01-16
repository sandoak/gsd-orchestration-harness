# Harness Fixes - 2026-01-16

## Issues Addressed

### 1. Planning Blocked After Milestone Transition

**Problem**: When starting a new milestone (e.g., v1.1 with phases 9-12), the harness blocked planning because it didn't recognize that previous milestone phases (1-8) were already executed.

**Root Cause**: In `orchestration-store.ts`, the `canStartPlan` method only checked `highestExecutingPhase === 0` to determine if a project was "fresh". It didn't account for `highestExecutedPhase` being > 0 from a previous milestone.

**Fix**: Added a second case in `canStartPlan` that checks for `highestExecutingPhase === 0 && highestExecutedPhase > 0` to allow planning N+2 phases ahead of the highest executed phase.

```typescript
// Case 2: Nothing currently executing but phases were previously executed
// (e.g., new milestone starting, or resuming after pause)
if (state.highestExecutingPhase === 0 && state.highestExecutedPhase > 0) {
  const maxPhase = state.highestExecutedPhase + 2;
  if (phaseNumber <= maxPhase) {
    return { allowed: true };
  }
  // ... error message
}
```

**File**: `packages/session-manager/src/db/orchestration-store.ts:406-446`

---

### 2. VERIFICATION.md Files Not Detected During Sync

**Problem**: When syncing project state, the harness didn't detect `VERIFICATION.md` files at the phase level. This meant completed phases from a previous milestone weren't automatically marked as verified.

**Root Cause**: `sync-project-state.ts` only checked for `SUMMARY.md` files to determine execution status, not `VERIFICATION.md` files.

**Fix**: Updated `scanPlanningDirectory` to:

1. Detect `VERIFICATION.md` files in phase directories
2. Return a `verifiedPhases` Set alongside discovered plans
3. Automatically mark executed plans as verified if their phase has `VERIFICATION.md`
4. Call `orchestrationStore.markPhaseVerified()` for phases with verification files

**File**: `packages/mcp-server/src/tools/sync-project-state.ts:42-122`

---

## How to Apply These Fixes

1. **Stop orchestrator sessions** before restarting the harness
2. **Rebuild the harness**: `pnpm build`
3. **Restart Claude Code** to reload the MCP server
4. **For existing milestone transitions**, run `gsd_sync_project_state` or manually call:
   - `gsd_mark_phase_verified` for completed phases
   - `gsd_set_execution_state` with correct `highestExecutedPhase`

---

## Testing the Fixes

After applying:

1. **Test milestone transition**:
   - Project with phases 1-8 complete (v1.0)
   - Start new milestone with phases 9-12 (v1.1)
   - Run `gsd_sync_project_state`
   - Verify: `gsd_start_session` with `/gsd:plan-phase 9` should work

2. **Test VERIFICATION.md detection**:
   - Create `VERIFICATION.md` in a phase directory
   - Run `gsd_sync_project_state`
   - Verify: phase should be marked as verified in database
