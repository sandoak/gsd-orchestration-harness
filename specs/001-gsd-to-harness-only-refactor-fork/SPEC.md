# Orchestration Methodology Redesign

## Goal

Replace the fragile GSD prompt-parsing approach with a purpose-built orchestration system that uses explicit structured communication, keeping valuable GSD concepts (milestones, phases, plans, verification gates) while eliminating unreliable output parsing.

**Key Decision**: Fork & refactor GSD commands into `harness:*` namespace. This means:

- Copy relevant GSD workflow files into this repo
- Rename all commands from `gsd:*` to `harness:*`
- Modify skills to use new structured protocol
- Update MCP tools from `gsd_*` to `harness_*`

## User's Spec-Driven Workflow (Preserved)

### Spec-Centric Organization (Key Change)

**Instead of** a central `.planning/` directory where documents pile up:

```
.planning/                    # ← Everything mixed together
  PROJECT.md
  ROADMAP.md
  phases/
    01-auth/
    02-profile/
    03-notifications/         # ← From SPC-002, mixed with others
```

**Each spec directory becomes the complete source** for that implemented item:

```
/docs/specs/
  SPC-001-initial-setup/
    SPEC.md                   # Original spec (vision, requirements)
    planning/
      PROJECT.md              # Project context for this spec
      ROADMAP.md              # Phases to implement this spec
      STATE.md                # Progress tracking
      phases/
        01-foundation/
          01-01-PLAN.md
          01-01-SUMMARY.md
        02-core/
          ...
      VERIFICATION.md         # Final verification

  SPC-002-notifications/
    SPEC.md                   # Original spec
    planning/
      PROJECT.md
      ROADMAP.md
      STATE.md
      phases/
        01-notification-model/
        02-delivery-system/
      VERIFICATION.md
```

**Benefits:**

- Each spec is self-contained with complete history
- Easy to understand what was done for a specific feature
- Can archive/move spec directories independently
- No mixing of documents from different features
- Clear audit trail per implemented item

### Phase A: Spec Creation (Manual + Claude)

1. User works with Claude Code to create detailed spec/plan
2. Spec saved to numbered directory (e.g., `/docs/specs/SPC-002-notifications/`)
3. SPEC.md contains vision, requirements, acceptance criteria

### Phase B: Planning (Interactive with Claude)

Planning runs conversationally, **inside the spec directory**:

1. `/harness:plan-spec /docs/specs/SPC-002-notifications/`
2. Creates `planning/` subdirectory in the spec folder
3. Discusses the project, asks clarifying questions
4. Creates PROJECT.md, REQUIREMENTS.md in `planning/`
5. `/harness:research-spec` - investigates unknowns
6. `/harness:create-roadmap` - maps requirements to phases
7. Creates STATE.md - tracks progress throughout
8. `/harness:plan-phase N` - creates detailed PLAN.md files

**Key**: All documents stay in the spec directory. Complete source for the feature.

### Phase C: Execution (Harness Orchestration)

Once plans exist, harness takes over for automated parallel execution:

1. `/harness:orchestrate /docs/specs/SPC-002-notifications/`
2. 4 parallel slots execute work based on dependency graph:
   - Execute plans whose dependencies are satisfied (parallel when no conflicts)
   - Research ahead (N+1, N+2) - always safe to parallelize
   - Verify completed plans
3. Verification gates enforce quality
4. Creates VERIFICATION.md in spec directory when complete

**Key**: Execution writes results back to spec directory. Self-contained.

### GSD's Excellent State Tracking (Preserved, Per-Spec)

Each spec directory tracks its own progress:

- **STATUS.md** - At-a-glance progress
- **ROADMAP.md** - Progress checkboxes, phase status
- **SUMMARY.md** - Per-plan execution results, deviations
- **VERIFICATION.md** - Final verification status
- **Git commits** - Atomic commits per task, full audit trail

**Result**: Each spec directory is a complete, archived record of the implemented feature.

### Atomic Git Commits (Critical - Preserved from GSD)

During execution, each task produces an atomic commit:

```
feat(auth): implement login endpoint

- Added POST /api/auth/login
- JWT token generation
- Password validation

Plan: 02-01, Task: 2/3
Spec: SPC-002-authentication
```

**Benefits:**

- Complete audit trail per task
- Easy to bisect if issues arise
- Clean, granular history
- Each commit references spec and plan

### Codebase Documentation (`/harness:map-codebase`)

Like GSD's map-codebase command, analyze and document project structure:

- **STRUCTURE.md** - Directory layout, file organization
- **STACK.md** - Tech stack, dependencies, versions
- **PATTERNS.md** - Code patterns, conventions
- **INTEGRATIONS.md** - External APIs, services
- **TESTING.md** - Test strategy, frameworks
- **CONCERNS.md** - Known issues, tech debt

**For the harness itself**: We maintain `/docs/CODEBASE.md` documenting the harness architecture.

## Core GSD Concepts to Preserve

### 1. Goal-Backward Planning

> "Instead of coming up with plans that meant 'what is the summary,' define what must be TRUE for the goal to be achieved, then work backward."

- Define success conditions first
- Derive requirements from conditions
- Build plans that achieve conditions
- Verify against original conditions

### 2. Context Window Management

> "Context window. It's like the only thing that matters."

- **Clear after every major operation** - plan, execute, verify
- **Sub-agents run fresh** - each gets clean context, only summaries return
- **Front matter** - YAML metadata enables quick loading without reading full files
- **Target**: Stay under 50% context, ideally 25-30%

### 3. Dependency-Graph Parallelization (Replaces Wave-Based)

Instead of hard limits ("1 execute at a time, plan 2 ahead"), use a **dependency graph** where plans declare what they depend on and what files they modify. The harness calculates what can run in parallel.

**PLAN.md Frontmatter:**

```yaml
---
plan_id: '03-02' # Unique identifier
depends_on: ['03-01', '02-03'] # Must complete before this starts
files_modified: # For conflict detection
  - 'src/auth/login.ts'
  - 'src/auth/types.ts'
files_read: # Files we read (can overlap with other readers)
  - 'src/utils/crypto.ts'
checkpoints: ['verification'] # Types of checkpoints expected
autonomous: true # Can run without human interaction
---
```

**Parallelization Rules:**

1. **No dependencies** → Can start immediately
2. **Dependencies complete** → Can start
3. **File conflict** → Must wait (writes to same file)
4. **Read-only overlap** → OK (multiple readers don't conflict)

**Example Dependency Graph:**

```
Phase 3: Authentication
├── 03-01: Core auth types       [no deps]        ──┬──→ Can run parallel
├── 03-02: Login endpoint        [depends: 03-01]  │
├── 03-03: Logout endpoint       [depends: 03-01] ─┴──→ Can run parallel after 03-01
├── 03-04: Session middleware    [depends: 03-02, 03-03] → Waits for both
└── 03-05: Auth tests            [depends: 03-04]        → Sequential

Phase 4: User Profile (different files)
├── 04-01: Profile types         [no deps]        → Can run parallel with Phase 3!
├── 04-02: Profile API           [depends: 04-01]
```

**Conflict Detection:**

- Before starting execution, check `files_modified` against running executions
- If overlap → queue until conflict resolves
- If no overlap → run in parallel (even across phases)

**Benefits over Hard Limits:**

- Faster: Independent work runs simultaneously
- Smarter: Only blocks when necessary
- Scalable: 4 slots can all execute if graph allows
- Self-documenting: Dependencies explicit in plan metadata

### 4. Two-Level Verification (Mandatory)

```
PLAN-LEVEL:
  Execute 03-01 → Verify 03-01 ✓
  Execute 03-02 → Verify 03-02 ✓

PHASE-LEVEL:
  All plans verified → Verify Phase 3 ✓ → Unlock Phase 4
```

- Plan-level catches issues immediately
- Phase-level validates integration
- **Neither can be skipped**

### 5. Research-Ahead Strategy

While executing Phase N:

- Slot 1: Execute Phase N (building current)
- Slot 2: Research Phase N+1 (preparing next)
- Slot 3: Research Phase N+2 (preparing future)
- Slot 4: Verify/Admin (quality gate)

Research doesn't create dependencies → safe to parallelize.

### 6. Comprehensive Research System (gsd-researcher)

The research system uses the `gsd-researcher` agent (916 lines) with systematic methodology:

**Research Modes:**
| Mode | Trigger | Output Focus |
|------|---------|--------------|
| **Ecosystem** | "What tools exist for X?" | Options, popularity, when to use each |
| **Feasibility** | "Can we do X?" | YES/NO/MAYBE, blockers, risk factors |
| **Implementation** | "How do we implement X?" | Step-by-step, code examples, pitfalls |
| **Comparison** | "Compare A vs B" | Comparison matrix, clear recommendation |

**Tool Strategy (Priority Order):**

1. **Context7** - First for libraries (authoritative, current, version-aware)
2. **Official Docs** - WebFetch for gaps, changelogs, announcements
3. **WebSearch** - Ecosystem discovery (with current year in query)
4. **Verification** - Cross-reference all findings

**Source Hierarchy & Confidence:**
| Level | Sources | Use |
|-------|---------|-----|
| HIGH | Context7, official docs | State as fact |
| MEDIUM | WebSearch verified with official | State with attribution |
| LOW | WebSearch only, single source | Flag as needing validation |

**Output Files:**

- **Phase Research** → `{spec}/planning/research/phase-XX-RESEARCH.md`
- **Project Research** → Multiple files:
  - `SUMMARY.md` - Executive synthesis, roadmap implications
  - `STACK.md` - Technologies with versions and rationale
  - `FEATURES.md` - Table stakes, differentiators, anti-features
  - `ARCHITECTURE.md` - System structure, component boundaries
  - `PITFALLS.md` - Common mistakes with prevention

**Key Principles:**

- Claude's training data is 6-18 months stale → treat as hypothesis, verify with current sources
- "I couldn't find X" is valuable (honest reporting > completeness theater)
- Be prescriptive, not exploratory: "Use X" beats "Consider X or Y"
- Research feeds planning: findings become instructions for downstream workflows

### 6. Project Manager Mindset

> "I never read these files. The only thing I do is the things Claude can't do on its own."

User provides:

- Vision and direction
- Decisions when asked
- Verification (UAT)

Claude handles everything else.

## Distribution Model: Git Submodule

Projects include the harness as a **git submodule**:

```bash
# Add harness to a new or existing project
cd /path/to/your-project
git submodule add https://github.com/you/gsd-orchestration-harness .harness

# Update harness when we make changes
git submodule update --remote .harness
git add .harness
git commit -m "Update harness to latest"
```

**Project structure with harness:**

```
/your-project/
  .harness/                  # Git submodule → harness repo
    packages/
      harness-skills/        # Workflow skills
      mcp-server/            # MCP server
      session-manager/       # Session management
      ...

  .claude/
    settings.json            # MCP config points to .harness

  docs/specs/                # Your specs
    SPC-001-feature/
    SPC-002-feature/
```

**Benefits:**

- Pin to specific harness versions per project
- Update when ready: `git submodule update --remote`
- Full git history of harness changes
- Changes we make are available to all your projects
- Each project can stay on different versions if needed

## Design Principles

1. **Orchestration as code** - Harness code orchestrates, not Claude prompts
2. **Explicit communication** - Workers signal state via structured messages, not output parsing
3. **File-based protocol** - `.orchestration/` directory for crash recovery
4. **Keep valuable GSD concepts** - Goal-backward, dependency-graph parallelization, two-level verification, research-ahead
5. **Complete independence** - No dependency on external GSD repo, fully self-contained harness
6. **Phases fit one context window** - Each phase/plan small enough to complete at 0-50% context
7. **Dependency-driven parallelization** - Plans declare dependencies and files_modified; harness calculates what can run in parallel
8. **Workers retain full capabilities** - Sub-agents, skills, explore agents, all Claude Code features work normally within worker sessions
9. **Clear context between operations** - Workers start fresh for each major task
10. **Git submodule distribution** - Projects include harness as submodule for easy updates

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR (Harness)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Dependency  │  │ Verification │  │ Conflict Detection      │ │
│  │ Graph       │  │ Engine       │  │ (files_modified check)  │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
│           │               │                     │                │
│           └───────────────┴─────────────────────┘                │
│                           │                                      │
│                  ┌────────┴────────┐                             │
│                  │  Message Store  │  (SQLite)                   │
│                  └────────┬────────┘                             │
└───────────────────────────┼──────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
    ┌─────────┐       ┌─────────┐       ┌─────────┐
    │ Worker  │       │ Worker  │       │ Worker  │
    │   1     │       │   2     │       │   3     │
    └────┬────┘       └────┬────┘       └────┬────┘
         │                 │                  │
         └─────────────────┴──────────────────┘
                           │
              ┌────────────┴────────────┐
              │  .orchestration/        │
              │    sessions/{id}/       │
              │      status.json        │
              │      checkpoint.json    │
              │      result.json        │
              └─────────────────────────┘
```

---

## Implementation Phases

### Phase 0: Fork GSD Skills → Harness Commands

**Goal**: Copy GSD workflow skills into this repo and rename to `harness:*` namespace

**Source**: Your local GSD installation (v1.5.18):

```
/mnt/dev-linux/projects/general-reference/claude-shared-commands-agents-skills/
├── get-shit-done/
│   ├── workflows/          # 21 workflow files
│   ├── templates/          # Document templates
│   ├── references/         # Reference docs (checkpoints, verification, etc.)
│   └── VERSION            # 1.5.18
└── agents/
    ├── gsd-planner.md      # Core planning methodology (1320 lines)
    └── gsd-researcher.md   # Research methodology (916 lines)
```

**NOT** from GitHub - using your local tested version.

**What We're Forking**:

**Interactive Planning Commands** (user runs these manually):
| GSD Command | Harness Command | Purpose |
|-------------|-----------------|---------|
| `/gsd:new-project` | `/harness:plan-spec [spec-dir]` | Initialize planning in spec directory |
| `/gsd:research-project` | `/harness:research-spec` | Research unknowns with sub-agents |
| `/gsd:define-requirements` | `/harness:define-requirements` | Create REQUIREMENTS.md in spec dir |
| `/gsd:create-roadmap` | `/harness:create-roadmap` | Map requirements to phases |
| `/gsd:discuss-phase` | `/harness:discuss-phase` | Gather context before planning |
| `/gsd:research-phase` | `/harness:research-phase` | Research specific phase needs |
| `/gsd:plan-phase` | `/harness:plan-phase` | Create PLAN.md with dependency metadata |
| `/gsd:add-phase` | `/harness:add-phase` | Add phase to current spec |
| `/gsd:progress` | `/harness:status` | Check spec progress |
| `/gsd:map-codebase` | `/harness:map-codebase` | Analyze and document project structure |

**Orchestration Commands** (harness automates these):
| GSD Command | Harness Command | Purpose |
|-------------|-----------------|---------|
| `/gsd:execute-phase` | `/harness:execute-phase` | Run all plans with dependency-graph parallelism |
| `/gsd:execute-plan` | `/harness:execute-plan` | Run single plan |
| `/gsd:verify-work` | `/harness:verify-work` | Verify plan or phase |
| `/gsd:orchestrate` | `/harness:orchestrate` | Full parallel orchestration |

**Files to Create**:

```
packages/harness-skills/
  src/
    agents/
      harness-planner.md   # Core planning methodology (forked from gsd-planner)
      harness-researcher.md # Research methodology (forked from gsd-researcher)

    workflows/
      # Interactive Planning (spec-centric)
      plan-spec.md         # Initialize planning in spec directory
      research-spec.md     # Research unknowns for spec (spawns 4 researcher agents)
      define-requirements.md
      create-roadmap.md
      discuss-phase.md
      research-phase.md    # Research before planning (spawns researcher agent)
      plan-phase.md        # Creates PLAN.md (uses planner agent)
      add-phase.md
      status.md            # Check spec progress

      # Orchestrated Execution
      execute-phase.md
      execute-plan.md
      verify-work.md
      orchestrate.md

    templates/
      # These get created inside spec's planning/ directory
      project.md           # PROJECT.md template
      requirements.md      # REQUIREMENTS.md template
      roadmap.md           # ROADMAP.md template (with frontmatter)
      state.md             # STATE.md template
      plan.md              # PLAN.md template (with dependency metadata)
      summary.md           # SUMMARY.md template
      verification.md      # VERIFICATION.md template
      # Research output templates
      research.md          # Phase research template (RESEARCH.md)
      research-summary.md  # Project research synthesis (SUMMARY.md)
      research-stack.md    # Stack recommendations (STACK.md)
      research-features.md # Feature landscape (FEATURES.md)
      research-arch.md     # Architecture patterns (ARCHITECTURE.md)
      research-pitfalls.md # Common mistakes (PITFALLS.md)

    references/
      goal-backward.md     # Verification principles
      checkpoints.md       # Checkpoint handling (simplified)
      dependency-graph.md  # Dependency-graph parallelization
      state-tracking.md    # How state persists
      spec-organization.md # Spec-centric directory structure
      research-protocol.md # Research methodology reference
```

**Spec Directory Structure** (created by harness):

```
/docs/specs/SPC-XXX-feature-name/
  # ROOT LEVEL - Quick access, at-a-glance documents
  SPEC.md                    # Original spec (user created)
  STATUS.md                  # At-a-glance: current phase, % complete, blockers
  ROADMAP.md                 # High-level phases to implement

  # PRELIMINARY PLANNING - "Figuring out" phase
  planning/
    PROJECT.md               # Context for this spec
    REQUIREMENTS.md          # What "done" looks like
    research/                # Research findings
      phase-01-research.md
      phase-02-research.md
    plans/                   # PLAN.md files (before execution)
      01-phase-name/
        01-01-PLAN.md
        01-02-PLAN.md
      02-phase-name/
        02-01-PLAN.md

  # EXECUTED WORK - "Building" phase
  execution/
    phases/
      01-phase-name/
        01-01-SUMMARY.md     # Execution result
        01-02-SUMMARY.md
        VERIFICATION.md      # Phase verification
      02-phase-name/
        02-01-SUMMARY.md
        VERIFICATION.md
    FINAL-VERIFICATION.md    # Overall spec verification
    commits.log              # Git commit history for this spec
```

**Organization:**

- **Root** - SPEC, STATUS, ROADMAP (quick reference)
- **planning/** - Research, requirements, PLAN.md files (figuring out)
- **execution/** - Summaries, verification results (building)

**MCP Tool Renames**:
| Current | New |
|---------|-----|
| `gsd_start_session` | `harness_start_session` |
| `gsd_list_sessions` | `harness_list_sessions` |
| `gsd_get_output` | `harness_get_output` |
| `gsd_wait_for_state_change` | `harness_wait_for_state` |
| `gsd_respond_checkpoint` | `harness_respond` |
| `gsd_get_state` | `harness_get_project_state` |
| `gsd_get_checkpoint` | `harness_get_pending` |
| `gsd_end_session` | `harness_end_session` |
| `gsd_sync_project_state` | `harness_sync_state` |
| `gsd_set_execution_state` | `harness_set_state` |
| `gsd_get_execution_state` | `harness_get_state` |

**Key Changes in Forked Skills**:

1. **Workers retain full Claude Code capabilities** - Sub-agents, skills, explore agents work normally
2. **Preserve GSD's planning workflow** - Interactive planning commands work conversationally
3. **Preserve GSD's state tracking** - STATE.md, ROADMAP.md progress, SUMMARY.md, git commits
4. **Preserve dependency-graph execution** - Plans declare dependencies; harness calculates parallelization
5. **Preserve two-level verification** - Plan-level + Phase-level, neither skippable
6. **Preserve research-ahead strategy** - Research N+1, N+2 while executing N
7. **Add structured protocol for orchestration** - Workers use `harness_worker_report` for state communication
8. **Simplify checkpoint format** - JSON structure instead of plain text parsing
9. **Update all GSD references** - Rename to harness throughout
10. **Remove external GSD dependency** - VERSION file, update mechanism

### Phase 1: Worker Message Protocol (Core)

**Goal**: Add explicit worker-to-orchestrator messaging via MCP tools

**Files to Create/Modify**:

- `packages/core/src/types/worker-messages.ts` - Message type definitions
- `packages/core/src/types/orchestrator-messages.ts` - Response type definitions
- `packages/session-manager/src/db/message-store.ts` - SQLite message persistence
- `packages/mcp-server/src/tools/worker-report.ts` - `gsd_worker_report` tool
- `packages/mcp-server/src/tools/worker-await-response.ts` - `gsd_worker_await_response` tool
- `packages/mcp-server/src/tools/orchestrator-respond.ts` - `gsd_orchestrator_respond` tool
- `packages/mcp-server/src/tools/get-pending-messages.ts` - `gsd_get_pending_messages` tool

**New MCP Tools** (worker ↔ orchestrator communication):

- `harness_worker_report` - Worker reports status/checkpoints
- `harness_worker_await` - Worker waits for orchestrator response
- `harness_respond` - Orchestrator responds to worker
- `harness_get_pending` - Orchestrator polls for pending messages

**Message Types**:

```typescript
type WorkerMessageType =
  | 'session_ready'
  | 'task_started'
  | 'progress_update'
  | 'verification_needed'
  | 'decision_needed'
  | 'action_needed'
  | 'task_completed'
  | 'task_failed';

type OrchestratorMessageType =
  | 'assign_task'
  | 'verification_result'
  | 'decision_made'
  | 'action_completed'
  | 'abort_task';
```

**Database Schema**:

```sql
CREATE TABLE worker_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending|responded|expired
  created_at TEXT,
  responded_at TEXT,
  response TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### Phase 2: File-Based Protocol Directory

**Goal**: Add `.orchestration/` protocol for crash recovery

**Files to Create/Modify**:

- `packages/session-manager/src/session-manager.ts` - Initialize protocol dir on spawn
- `packages/mcp-server/src/tools/start-session.ts` - Create session protocol dir

**Directory Structure**:

```
.orchestration/
  config.yaml              # Orchestration settings
  dependency-graph.json    # Current dependency graph state
  active-files.json        # Files being modified by running workers (conflict detection)
  sessions/
    {session-id}/
      status.json          # Current worker status
      checkpoint.json      # Active checkpoint (if any)
      checkpoint_response.json  # Orchestrator response
      result.json          # Final execution result
```

**status.json Schema**:

```typescript
interface WorkerStatus {
  sessionId: string;
  timestamp: string;
  state: 'initializing' | 'running' | 'checkpoint' | 'completed' | 'failed';
  phase: number;
  plan: number;
  currentTask: number;
  totalTasks: number;
  message?: string;
}
```

### Phase 3: Project State Documents (Consolidated)

**Goal**: Consolidate STATE.md into ROADMAP.md with YAML frontmatter

**Files to Create/Modify**:

- `packages/core/src/gsd-state-parser.ts` - Add YAML frontmatter parsing
- `packages/core/src/types/gsd-state.ts` - Update interfaces

**ROADMAP.md Schema** (with frontmatter):

```yaml
---
version: 1
project: { name }
milestone: v1.0

# Current Position (replaces STATE.md)
current_phase: 3
current_plan: 2
status: executing # planning|executing|verifying|blocked|complete

# Progress
total_phases: 7
completed_phases: 2
total_plans: 18
completed_plans: 8

# Velocity
velocity:
  total_plans_completed: 8
  total_execution_minutes: 45
  average_minutes_per_plan: 6
---
```

**Migration**:

- STATE.md `Current Position` → ROADMAP.md frontmatter
- STATE.md `Performance Metrics` → ROADMAP.md frontmatter `velocity`
- STATE.md `Decisions` → PROJECT.md `Key Decisions`
- Drop: `Session Continuity` (orchestrator tracks in memory)

### Phase 4: Verification System

**Goal**: Add structured verification specifications to plans

**Files to Create/Modify**:

- `packages/core/src/types/verification.ts` - Verification types
- `packages/session-manager/src/verification-engine.ts` - Run verifications
- Update PLAN.md format with verification specs

**Verification Types**:

```typescript
type VerificationType =
  // Fully automatable
  | 'file_exists'
  | 'file_contains'
  | 'command_output'
  | 'api_response'
  | 'build_succeeds'
  | 'tests_pass'
  // Playwright automatable
  | 'ui_element_exists'
  | 'ui_navigation'
  // Human required
  | 'visual_quality'
  | 'ux_flow';
```

**Plan Verification Block**:

```yaml
---
# In PLAN.md frontmatter
must_pass:
  - id: auth-api-login
    type: api_response
    endpoint: POST /api/auth/login
    expects: { status: 200 }
  - id: tests
    type: tests_pass
    command: npm test
---
```

### Phase 5: Worker Instructions Template

**Goal**: Create worker prompt template that teaches the protocol

**Files to Create**:

- `packages/core/src/templates/worker-prompt.md` - Worker instructions

**Key Instructions**:

1. Call `gsd_worker_report` with `session_ready` on startup
2. Call `gsd_worker_report` with `task_started` before beginning work
3. Call `gsd_worker_report` with `progress_update` after each major step
4. For verification/decisions: call `gsd_worker_report`, then `gsd_worker_await_response`
5. Call `gsd_worker_report` with `task_completed` or `task_failed` when done

### Phase 6: Migration and Cleanup

**Goal**: Remove legacy output parsing after protocol adoption

**Files to Modify**:

- `packages/session-manager/src/session-manager.ts` - Remove `detectWaitState()` and `classifyPromptIntent()`
- `packages/core/src/types/checkpoint.ts` - Simplify to use new message types

---

## Critical Files Summary

### Phase 0: Fork GSD Skills

| File                                                       | Change                                              |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `packages/harness-skills/`                                 | NEW - Entire package for workflow skills            |
| `packages/harness-skills/src/agents/harness-planner.md`    | NEW - Core planning methodology (from gsd-planner)  |
| `packages/harness-skills/src/agents/harness-researcher.md` | NEW - Research methodology (from gsd-researcher)    |
| `packages/harness-skills/src/workflows/*.md`               | NEW - Harness workflow definitions                  |
| `packages/harness-skills/src/templates/*.md`               | NEW - Document templates including research outputs |
| `packages/mcp-server/src/tools/*.ts`                       | RENAME - All `gsd_*` → `harness_*`                  |
| `packages/mcp-server/src/server.ts`                        | MODIFY - Update tool registrations                  |

### Phase 1-6: Protocol & State

| File                                                     | Change                                                   |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `packages/core/src/types/worker-messages.ts`             | NEW - Worker message interfaces                          |
| `packages/core/src/types/orchestrator-messages.ts`       | NEW - Orchestrator response interfaces                   |
| `packages/core/src/types/verification.ts`                | NEW - Verification spec types                            |
| `packages/session-manager/src/db/message-store.ts`       | NEW - Message persistence                                |
| `packages/session-manager/src/verification-engine.ts`    | NEW - Automated verification                             |
| `packages/harness-skills/src/templates/worker-prompt.md` | NEW - Worker instructions                                |
| `packages/mcp-server/src/tools/worker-report.ts`         | NEW - `harness_worker_report` tool                       |
| `packages/mcp-server/src/tools/worker-await.ts`          | NEW - `harness_worker_await` tool                        |
| `packages/mcp-server/src/tools/respond.ts`               | NEW - `harness_respond` tool                             |
| `packages/mcp-server/src/tools/get-pending.ts`           | NEW - `harness_get_pending` tool                         |
| `packages/core/src/gsd-state-parser.ts`                  | RENAME → `harness-state-parser.ts`, add YAML frontmatter |
| `packages/session-manager/src/session-manager.ts`        | MODIFY - Init protocol dir, later remove output parsing  |

---

## Verification Plan

1. **Unit Tests**: Test each new MCP tool independently
2. **Integration Test**: Worker sends message → Orchestrator receives → Orchestrator responds → Worker receives
3. **Protocol Recovery Test**: Kill session mid-checkpoint → Restart → Verify state recovered from files
4. **End-to-End Test**: Run full plan execution with new protocol
5. **Migration Test**: Run with both protocols simultaneously (fallback to output parsing)

---

## Implementation Order

1. **Phase 0** (Fork GSD) - Copy skills, rename to `harness:*`, update MCP tool names
2. **Phase 1** (Worker Messages) - Core protocol, can test immediately
3. **Phase 2** (File Protocol) - Crash recovery, extends Phase 1
4. **Phase 5** (Worker Template) - Enable real workers to use protocol
5. **Phase 3** (State Documents) - Consolidate project state with YAML frontmatter
6. **Phase 4** (Verification) - Automated testing specifications
7. **Phase 6** (Cleanup) - Remove legacy output parsing

---

## Success Criteria

### Independence

- [ ] All `gsd_*` MCP tools renamed to `harness_*`
- [ ] All `/gsd:*` commands forked and renamed to `/harness:*`
- [ ] No dependency on external GSD repo

### GSD Methodology Preserved

- [ ] Goal-backward planning in `/harness:plan-phase` (harness-planner agent)
- [ ] Dependency-graph parallelization:
  - [ ] Plans declare `depends_on`, `files_modified`, `files_read` in frontmatter
  - [ ] Harness calculates parallelization from dependency graph
  - [ ] Conflict detection prevents concurrent writes to same file
  - [ ] Independent plans run in parallel (even across phases)
- [ ] Two-level verification (plan + phase, neither skippable)
- [ ] Research-ahead strategy (N+1, N+2 while executing N)
- [ ] Comprehensive research system (harness-researcher agent):
  - [ ] 4 research modes: ecosystem, feasibility, implementation, comparison
  - [ ] Tool strategy: Context7 → Official docs → WebSearch → Verification
  - [ ] Confidence levels: HIGH/MEDIUM/LOW with source attribution
  - [ ] `/harness:research-spec` spawns 4 parallel researchers (STACK, FEATURES, ARCHITECTURE, PITFALLS)
  - [ ] `/harness:research-phase` produces phase-XX-RESEARCH.md before planning
- [ ] State tracking: STATUS.md, ROADMAP.md progress, SUMMARY.md
- [ ] Context management: Clear between operations, sub-agents run fresh
- [ ] Atomic git commits per task with spec/plan references
- [ ] `/harness:map-codebase` for project structure documentation

### User Workflow Preserved

- [ ] Spec-centric: Each spec directory contains all its planning docs
- [ ] `/harness:plan-spec [spec-dir]` creates planning/ inside spec directory
- [ ] Interactive planning phase (user + Claude discuss)
- [ ] Automated execution phase (harness orchestrates)
- [ ] Each spec directory is complete, self-contained record of implemented feature
- [ ] No central `.planning/` directory mixing documents from different specs

### Structured Communication

- [ ] Workers signal state via `harness_worker_report` MCP tool
- [ ] Orchestrator responds via structured messages, not parsed output
- [ ] Session state survives harness restart via `.orchestration/` files
- [ ] `detectWaitState()` and `classifyPromptIntent()` removed (output parsing eliminated)

### Distribution

- [ ] Harness works as git submodule in any project
- [ ] `git submodule update --remote` pulls latest harness changes
- [ ] MCP config in project points to `.harness/` submodule
- [ ] Projects can pin to specific harness versions
