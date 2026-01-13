# GSD Harness Architecture

**Last Updated**: 2026-01-13
**Domain**: Architecture
**Status**: Active

## Overview

The GSD Orchestration Harness manages parallel Claude Code sessions for automated project execution. It coordinates planning, execution, verification, and reconciliation across multiple PTY sessions.

## Core Components

### Session Manager

- **Location**: `packages/session-manager/`
- Spawns and manages Claude Code PTY sessions
- Detects wait states (prompts, checkpoints)
- Handles session lifecycle (start, monitor, complete)

### MCP Server

- **Location**: `packages/mcp-server/`
- HTTP transport at `http://localhost:3333/mcp`
- Tools: `gsd_start_session`, `gsd_list_sessions`, `gsd_get_output`, `gsd_respond_checkpoint`, `gsd_wait_for_state_change`, `gsd_sync_project_state`

### Web Dashboard

- **Location**: `packages/dashboard/`
- Real-time session monitoring via WebSocket
- 4 slot display with terminal output

### Database (SQLite)

- **Location**: `~/.gsd-harness/data/sessions.db`
- Tables: `sessions`, `orchestration_state`
- Persists session state and orchestration tracking

## Slot Architecture

**4 parallel slots** - any slot can run any task type:

| Slot     | Purpose                                           |
| -------- | ------------------------------------------------- |
| Slot 1-4 | Any task: Verify, Reconcile, Execute, Plan, Admin |

**Priority Order** (when assigning work):

1. **VERIFY** - Quality gate, must pass before next phase
2. **RECONCILE** - Review plans against last execution
3. **EXECUTE** - Build the code
4. **PLAN** - Create PLAN.md files (with optional research)
5. **ADMIN** - Tests, builds, misc tasks

## Phase Execution & Verify Gates

### maxExecutePhase Logic

When Phase N is pending verification:

- `pendingVerifyPhase = N`
- `maxExecutePhase = N + 1`
- Execute allowed for phases ≤ maxExecutePhase
- Phase N+2 blocked until verify completes

**Example**: Phase 4 pending verify

- ✅ Phase 5 execute allowed (5 ≤ maxExecutePhase 5)
- ❌ Phase 6 blocked (6 > maxExecutePhase 5)

### Parallel Execution

Verify and Execute can run simultaneously:

- Slot 1: `/gsd:verify-work 4` (verifying Phase 4)
- Slot 2: `/gsd:execute-plan 05-01-PLAN.md` (executing Phase 5)

## PTY Wait State Detection

Detects when Claude CLI is waiting for input:

**Detection Method**:

- Monitor PTY output for `❯` prompt character
- Check for spinner absence (not still processing)
- Identify checkpoint menus vs user prompts

**Wait States**:

- `running` - Active processing
- `waiting_checkpoint` - At menu/prompt, needs response
- `completed` - Session finished
- `failed` - Error occurred

## Startup Reconciliation

At orchestration start, check for plans needing reconciliation:

```
For each pending PLAN.md (no SUMMARY.md):
  - Find previous plan in sequence
  - If previous has SUMMARY.md → needs reconcile
```

**Example**:

- `05-01-SUMMARY.md` exists ✓
- `05-02-PLAN.md` pending → reconcile against `05-01-SUMMARY.md`

## Research Phase Support

When checkpoint suggests research before planning:

1. Run `/gsd:research-phase X`
2. Wait for research completion
3. Then run `/gsd:plan-phase X`

## Key Files

| File                                                         | Purpose                                 |
| ------------------------------------------------------------ | --------------------------------------- |
| `packages/session-manager/src/persistent-session-manager.ts` | PTY session management                  |
| `packages/session-manager/src/db/orchestration-store.ts`     | Verify gate logic                       |
| `packages/mcp-server/src/tools/start-session.ts`             | Session start with phase extraction     |
| `packages/mcp-server/src/tools/sync-project-state.ts`        | State sync, maxExecutePhase calculation |
| `.claude/get-shit-done/workflows/orchestrate.md`             | Orchestrator workflow                   |

## Related Context

- [/context/operations/CLAUDE.md](/context/operations/CLAUDE.md) - Deployment, harness setup

---

_For updates, use `/context.update` command_
