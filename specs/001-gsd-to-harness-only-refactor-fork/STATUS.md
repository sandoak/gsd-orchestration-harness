# SPC-001: GSD to Harness Refactor - Status

## Checkpoint: Implementation Complete

**Date:** 2026-01-16
**Status:** All Phases Complete
**Final Commit:** 46420a1

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
| 3     | Project State Documents            | Complete | 0b09560 |
| 4     | Verification System                | Complete | 5b859e7 |
| 5     | Worker Instructions Template       | Complete | a5e21f4 |
| 6     | Migration and Cleanup              | Complete | 46420a1 |

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

**Commit:** 0b09560
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

## Phase 4 Complete

**Commit:** 5b859e7
**Date:** 2026-01-16

**Goal:** Add structured verification system with typed specs and execution engine

**What was done:**

### Verification Types (`packages/core/src/types/verification.ts`)

- `VerificationType` union - All verification types:
  - **Auto:** file_exists, file_contains, command_succeeds, api_response, tests_pass, build_succeeds, type_check, lint_clean, json_valid, env_var_set, port_available, process_running
  - **Playwright:** ui_element_exists, ui_element_text, ui_navigation, ui_form_submit, ui_screenshot_match, ui_no_console_errors, ui_accessibility
  - **Human:** visual_quality, ux_flow, content_review, security_review
- Typed interfaces for each verification spec type
- `VerificationResult` - Result of running a verification
- `PlanVerificationManifest` - Manifest from PLAN.md frontmatter (must_pass, should_pass)
- `VerificationReport` - Complete report for plan or phase
- Helper functions: `getVerificationCategory()`, `requiresPlaywright()`, `requiresHuman()`, `filterByCategory()`, `getDefaultTimeout()`

### Verification Engine (`packages/session-manager/src/verification-engine.ts`)

- `VerificationEngine` class - Runs verification specs and produces reports
- `verify(manifest)` - Run all verifications in a manifest
- Auto verification implementations for all auto types
- Playwright and human verification callbacks (provided by orchestrator)
- `parseVerificationManifest()` - Parse manifest from PLAN.md frontmatter

### Updated harness-planner Agent

- Added `must_pass`, `should_pass`, `api_base_url`, `ui_base_url` frontmatter fields
- Added verification manifest documentation with examples
- Added verification types table by category

**Verification Categories:**

| Category   | When to Use                   | Execution                        |
| ---------- | ----------------------------- | -------------------------------- |
| Auto       | Fully automatable checks      | Runs immediately via Node.js     |
| Playwright | Browser-based UI verification | Runs via Playwright MCP/API      |
| Human      | Requires human judgment       | Queues for user via orchestrator |

**Files created:** 2 new TypeScript files
**Files modified:** 2 existing files

---

## Phase 5 Complete

**Commit:** a5e21f4
**Date:** 2026-01-16

**Goal:** Create worker prompt template that teaches the protocol and orchestrator context

**What was done:**

### Worker Instructions Template (`packages/harness-skills/src/templates/worker-prompt.md`)

- Complete lifecycle documentation: startup → task execution → completion
- Protocol usage examples for all message types:
  - `session_ready` - Worker initialization
  - `task_started` - Begin work on task
  - `progress_update` - Report progress (percentage)
  - `verification_needed` - Request verification
  - `decision_needed` - Request user decision
  - `action_needed` - Request human action
  - `task_completed` - Report completion with artifacts
  - `task_failed` - Report failure with recovery info
- Key rules: DO NOT print "waiting", DO use MCP tools for all communication
- Sub-agents and skills documentation: Workers retain full Claude Code capabilities
- Context management guidelines: Stay under 50% context

### Orchestrator Context Template (`packages/harness-skills/src/templates/orchestrator-context.md`)

- Session lifecycle documentation
- Parallel execution with dependency graph
- Verification workflow steps
- State tracking files to monitor
- Available MCP tools reference table
- Error handling patterns

**Files created:** 2 new markdown files

---

## Phase 6 Complete

**Commit:** 46420a1
**Date:** 2026-01-16

**Goal:** Add programmatic credential access for workers and complete message protocol

**What was done:**

### Credential Message Types

- Added `credentials_needed` to `WorkerMessageType` in `packages/core/src/types/worker-messages.ts`
  - Workers request credentials by service name and env vars
  - Includes phase, plan, service, envVars[], reason, context
- Added `credentials_provided` to `OrchestratorMessageType` in `packages/core/src/types/orchestrator-messages.ts`
  - Orchestrator responds with credentials or error
  - Includes credentials map, found status, error, instructions

### Credential Provider (`packages/session-manager/src/credential-provider.ts`)

- `CredentialProvider` class - Programmatic credential lookup
- Default directory: `/mnt/dev-linux/projects/server-maintenance/docs/servers/`
- Override via `HARNESS_CREDENTIALS_DIR` environment variable
- `KNOWN_SERVICES` configuration for 12 common services:
  - postgres, redis, supabase, stripe, openai, anthropic
  - aws, github, sendgrid, twilio, vercel, cloudflare
- `.env` file format parsing with quote handling
- Context-aware file matching (e.g., `postgres-production.env`)
- `lookupCredentials()` convenience function

### Updated Worker Template

- Added `credentials_needed` message type documentation
- Known services table with default env vars
- Usage example for credential requests

### Updated Orchestrator Context

- Added `CredentialProvider` usage example
- Known services table
- Credential file format documentation
- Security guidelines for credential handling

### Database Schema Updates

- Added `credentials_needed` to worker_messages CHECK constraint
- Added `credentials_provided` to orchestrator_messages CHECK constraint

### MCP Tool Updates

- Updated `harness_get_pending` to include `credentials_needed` in schema
- Updated `requiresResponse` array to include `credentials_needed`

**Files created:** 1 new TypeScript file
**Files modified:** 6 existing files

---

## Implementation Complete

**All 6 phases of SPC-001 have been successfully implemented.**

**Summary of what was built:**

1. **Forked GSD Skills** - Complete `packages/harness-skills/` with renamed workflows, agents, templates
2. **Worker Message Protocol** - Structured MCP tools for worker ↔ orchestrator communication
3. **File-Based Protocol** - `.orchestration/` directory for crash recovery
4. **YAML Frontmatter** - Quick state reading from ROADMAP.md
5. **Verification System** - Auto/Playwright/Human verification categories with engine
6. **Worker Instructions** - Complete protocol documentation for workers
7. **Credential System** - Programmatic credential lookup for orchestrator

**Key benefits achieved:**

- Replaces fragile output parsing with explicit structured messaging
- Workers signal state via `harness_worker_report` MCP tool
- Orchestrator responds via structured messages
- Session state survives harness restart via `.orchestration/` files
- Programmatic credential access without manual lookup

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

All implementation phases are complete. To use the refactored harness:

1. **Test the protocol** - Spawn a worker session and verify message flow
2. **Test credential lookup** - Request credentials via `credentials_needed` message
3. **Test verification** - Run auto verifications via the VerificationEngine
4. **Integration test** - Full plan execution with structured protocol

## Key Decisions Made

- **Dependency-graph over wave-based** - More flexible parallelization
- **Git submodule distribution** - Projects include harness as `.harness/` submodule
- **Workers retain full capabilities** - Not restricted, can use sub-agents/skills
- **Spec-centric organization** - All docs for a feature in one spec directory

---

_Checkpoint created: 2026-01-16_
