# SPC-001: GSD to Harness Refactor - Status

## Checkpoint: Planning Complete

**Date:** 2026-01-16
**Status:** Ready for Implementation
**Commit:** ad97d70

## Planning Phase Complete

The comprehensive SPEC.md has been finalized with:

1. **Spec-centric organization** - Each spec directory contains all planning docs
2. **Dependency-graph parallelization** - Plans declare dependencies; harness calculates what runs in parallel
3. **Worker capabilities preserved** - Sub-agents, skills, explore agents work normally
4. **Structured communication** - MCP tools for worker-orchestrator messaging
5. **Research system** - Full gsd-researcher methodology forked as harness-researcher
6. **Two-level verification** - Plan + phase level, neither skippable

## Implementation Phases

From SPEC.md:

| Phase | Goal                               | Status   | Commit  |
| ----- | ---------------------------------- | -------- | ------- |
| 0     | Fork GSD Skills → Harness Commands | Complete | d1aa4f8 |
| 1     | Worker Message Protocol            | Complete | c88106b |
| 2     | File-Based Protocol Directory      | Complete | ce5d87e |
| 3     | Project State Documents            | Complete | (tbd)   |
| 4     | Verification System                | Pending  |         |
| 5     | Worker Instructions Template       | Pending  |         |
| 6     | Migration and Cleanup              | Pending  |         |

## Phase 0 Complete

**Commit:** d1aa4f8
**Date:** 2026-01-16

**What was done:**

- Created `packages/harness-skills/` package
- Forked `gsd-planner.md` → `harness-planner.md` (1320 lines)
- Forked `gsd-researcher.md` → `harness-researcher.md` (916 lines)
- Forked 21 workflow files with `/gsd:*` → `/harness:*` renames
- Forked templates and references
- Renamed all MCP tools from `gsd_*` to `harness_*`
- Renamed `GsdMcpServer` to `HarnessMcpServer`
- Updated server name from `gsd-harness` to `harness`

**Files created:** 73 new files in `packages/harness-skills/`
**Files modified:** 20 TypeScript files in existing packages

---

## Phase 1 Complete

**Commit:** c88106b
**Date:** 2026-01-16

**Goal:** Add explicit worker-to-orchestrator messaging via MCP tools

**What was done:**

### Core Types

- Created `packages/core/src/types/worker-messages.ts` - Worker message type definitions
  - `WorkerMessageType`: session_ready, task_started, progress_update, verification_needed, decision_needed, action_needed, task_completed, task_failed
  - Typed interfaces for each message type with appropriate payloads
- Created `packages/core/src/types/orchestrator-messages.ts` - Orchestrator response types
  - `OrchestratorMessageType`: assign_task, verification_result, decision_made, action_completed, abort_task
  - Typed interfaces for each response type

### Database Layer

- Updated `packages/session-manager/src/db/database.ts` - Added worker_messages and orchestrator_messages tables
- Created `packages/session-manager/src/db/message-store.ts` - SQLite message persistence
  - CRUD operations for worker messages
  - CRUD operations for orchestrator messages
  - Checkpoint response convenience methods

### MCP Tools (Worker-Orchestrator Protocol)

- `harness_worker_report` - Worker reports status/checkpoints to orchestrator
- `harness_worker_await` - Worker waits for orchestrator response after checkpoint
- `harness_respond` - Orchestrator responds to worker messages
- `harness_get_pending` - Orchestrator polls for pending worker messages

### Integration

- Added MessageStore to PersistentSessionManager
- Registered all new tools in server.ts and index.ts

**Files created:** 6 new TypeScript files
**Files modified:** 6 existing TypeScript files

---

## Phase 2 Complete

**Commit:** ce5d87e
**Date:** 2026-01-16

**Goal:** Add `.orchestration/` protocol directory for crash recovery and state persistence

**What was done:**

### Protocol Types (`packages/core/src/types/protocol.ts`)

- `WorkerStatus` - Worker state for status.json
- `PersistedCheckpoint` - Checkpoint data for checkpoint.json
- `PersistedCheckpointResponse` - Response data for checkpoint_response.json
- `ExecutionResult` - Execution results for result.json
- `PlanDependency` - Plan dependency information
- `DependencyGraphState` - Current state of dependency graph
- `ActiveFilesState` - Active file tracking for conflict detection
- `OrchestrationConfig` - Orchestration settings

### Protocol Directory Manager (`packages/session-manager/src/protocol-directory.ts`)

- Manages `.orchestration/` directory structure
- CRUD operations for all protocol files (status, checkpoint, result)
- Dependency graph state management
- Active file tracking for conflict detection
- Recovery methods for crash recovery

### Integration with PersistentSessionManager

- Auto-initialize protocol directory on session spawn
- Create session directories automatically
- Write initial status on spawn
- Clean up active files on terminate
- `getProtocolDirectory()` method for access

**Directory Structure:**

```
.orchestration/
  config.yaml              # Orchestration settings
  dependency-graph.json    # Current dependency graph state
  active-files.json        # Files being modified (conflict detection)
  sessions/
    {session-id}/
      status.json          # Current worker status
      checkpoint.json      # Active checkpoint (if any)
      checkpoint_response.json  # Orchestrator response
      result.json          # Final execution result
```

**Files created:** 2 new TypeScript files
**Files modified:** 3 existing TypeScript files

---

## Phase 3 Complete

**Commit:** (tbd)
**Date:** 2026-01-16

**Goal:** Consolidate STATE.md into ROADMAP.md with YAML frontmatter for quick state reading

**What was done:**

### Roadmap Frontmatter Types (`packages/core/src/types/roadmap-frontmatter.ts`)

- `ProjectStatus` - Status enum: planning, executing, verifying, blocked, complete
- `VelocityMetrics` - Execution speed tracking
- `RoadmapFrontmatter` - Full YAML schema for ROADMAP.md frontmatter
  - Version, project, milestone
  - Current phase/plan position
  - Progress tracking (total/completed phases and plans)
  - Optional velocity metrics
  - Spec-centric fields (spec_dir, spec_id)
- `DEFAULT_ROADMAP_FRONTMATTER` - Default values for new projects
- Helper functions: `calculateProgress()`, `isProjectComplete()`

### YAML Frontmatter Parser (`packages/core/src/frontmatter-parser.ts`)

- `parseFrontmatter<T>()` - Generic frontmatter extraction
- `extractContentAfterFrontmatter()` - Get markdown without frontmatter
- `createFrontmatter()` - Serialize object to YAML frontmatter
- `updateFrontmatter<T>()` - Update existing frontmatter
- `parseRoadmapFrontmatter()` - Typed ROADMAP.md parsing with validation
- Internal `parseYaml<T>()` - Simple YAML parser for frontmatter
- Internal `serializeYaml()` - Object to YAML serialization

### Updated GSD State Parser (`packages/core/src/gsd-state-parser.ts`)

- Added `fromFrontmatter` field to `ParsedGsdState`
- `parseRoadmapFile()` now checks YAML frontmatter first (faster path)
- Falls back to content parsing if no frontmatter present
- Added `mapProjectStatus()` helper for status display

### Updated State Types (`packages/core/src/types/gsd-state.ts`)

- Added `frontmatter?: RoadmapFrontmatter` field to `GsdState`
- Re-exports frontmatter types for convenience

**ROADMAP.md Frontmatter Schema:**

```yaml
---
version: 1
project: my-project
milestone: v1.0

current_phase: 3
current_plan: 2
status: executing

total_phases: 7
completed_phases: 2
total_plans: 18
completed_plans: 8

velocity:
  total_plans_completed: 8
  total_execution_minutes: 45
  average_minutes_per_plan: 6
---
```

**Migration:** STATE.md position/progress → ROADMAP.md frontmatter

**Files created:** 2 new TypeScript files
**Files modified:** 3 existing TypeScript files

---

## Source Files for Fork

Local GSD installation (v1.5.18):

```
/mnt/dev-linux/projects/general-reference/claude-shared-commands-agents-skills/
├── get-shit-done/
│   ├── workflows/          # 21 workflow files
│   ├── templates/          # Document templates
│   └── references/         # Reference docs
└── agents/
    ├── gsd-planner.md      # Core planning methodology (1320 lines)
    └── gsd-researcher.md   # Research methodology (916 lines)
```

## Next Steps

1. **Create `packages/harness-skills/` package** - New monorepo package
2. **Fork agents** - Copy gsd-planner.md, gsd-researcher.md → harness-planner.md, harness-researcher.md
3. **Fork workflows** - Copy and rename gsd:_ → harness:_
4. **Rename MCP tools** - gsd*\* → harness*\*

## Key Decisions Made

- **Dependency-graph over wave-based** - More flexible parallelization
- **Git submodule distribution** - Projects include harness as `.harness/` submodule
- **Workers retain full capabilities** - Not restricted, can use sub-agents/skills
- **Spec-centric organization** - All docs for a feature in one spec directory

---

_Checkpoint created: 2026-01-16_
