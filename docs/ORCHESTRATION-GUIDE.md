# GSD Orchestration Harness - User Guide

## What Is This?

A **parallel AI software factory** that orchestrates multiple Claude Code sessions to build software autonomously with quality gates.

```
┌─────────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (Conductor)                                        │
│  - Reads ROADMAP.md, STATE.md                                    │
│  - Assigns work to 4 parallel slots                              │
│  - Responds to checkpoints                                       │
│  - Enforces workflow: plan → execute → verify → next             │
├─────────────────────────────────────────────────────────────────┤
│  Slot 1          │  Slot 2          │  Slot 3          │ Slot 4 │
│  [Execute 07-01] │  [Plan Phase 8]  │  [Verify P6]     │ [idle] │
├─────────────────────────────────────────────────────────────────┤
│  HARNESS (Physical Barriers - Cannot Be Bypassed)                │
│  - Max 1 execute at a time (prevents codebase conflicts)         │
│  - Plan only N+1 phase ahead (prevents stale context drift)      │
│  - Verify gates (quality before quantity)                        │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start the Harness

```bash
cd ~/.gsd-harness
npm run dev
```

Dashboard: http://localhost:3333

### 2. Initialize Your Project

```bash
cd /path/to/your/project
gsd-harness init
```

This copies the GSD workflow files to your project's `.claude/` directory.

### 3. Create a Roadmap

Create `.planning/ROADMAP.md` with phases:

```markdown
# Project Roadmap

## Phase 1: Foundation

- Project scaffolding
- Base configuration
- Core dependencies

## Phase 2: Data Layer

- Database schema
- API client setup
- Type definitions

## Phase 3: Business Logic

- Core services
- Validation rules
- Business rules

## Phase 4: UI Components

- Base components
- Design system
- Layouts

## Phase 5+: Features

- Feature A
- Feature B
- etc.
```

### 4. Start Orchestration

```bash
claude --dangerously-skip-permissions
> /gsd:orchestrate
```

### 5. Walk Away

The orchestrator will:

- Plan phases (up to N+1 ahead)
- Execute plans (one at a time)
- Verify completed work
- Reconcile plans against reality
- Loop until roadmap complete

## How It Works

### Physical Barriers (Harness-Enforced)

These limits **cannot be bypassed** - the harness physically blocks violations:

| Barrier            | Rule                                   | Why                             |
| ------------------ | -------------------------------------- | ------------------------------- |
| **Execute Limit**  | Max 1 concurrent                       | Prevents codebase conflicts     |
| **Planning Limit** | Only N+1 phase                         | Prevents stale context in plans |
| **Verify Gate**    | Must verify before next phase executes | Quality checkpoint              |

### The Pipeline

```
PLAN → RECONCILE → EXECUTE → VERIFY → (next phase)
  │        │          │         │
  │        │          │         └─ Quality gate before proceeding
  │        │          └─ One execution at a time
  │        └─ Review plan against current codebase
  └─ Create PLAN.md files for phase
```

### State Tracking

The harness tracks:

- `highestExecutedPhase` - Last fully completed phase
- `highestExecutingPhase/Plan` - Currently running (e.g., 07-02)
- `pendingVerifyPhase` - Phase awaiting verification

### Reconciliation

When the orchestrator restarts, it calls:

```
gsd_set_execution_state(projectPath, highestExecutedPhase, forceReset: true)
```

This synchronizes the harness database with the actual project state from STATE.md.

## Best Practices

### 1. Front-Load Planning

Write a detailed ROADMAP.md. The clearer the phases, the better the orchestration.

### 2. Keep Phases Focused

Each phase should have a clear deliverable:

- **Good**: "Phase 3: Authentication system"
- **Bad**: "Phase 3: Various improvements"

### 3. Let It Run

Start orchestration and check back periodically. The harness prevents runaway behavior.

### 4. Trust the Verify Gates

Don't skip verification. It catches issues before they compound.

### 5. Use for Greenfield Projects

The system works best for new projects where you control the phase structure.

## Troubleshooting

### Planning Blocked

```
PLANNING LIMIT: Phase 9 is too far ahead. Currently executing Phase 7.
```

**Solution**: Wait for current phase to progress. Only N+1 planning allowed.

### Execute Blocked

```
VERIFY GATE: Phase 6 must be verified before executing Phase 8.
```

**Solution**: Run `/gsd:verify-work 6` to verify the completed phase.

### Stale State

If the harness has stale state from a previous run:

```
gsd_set_execution_state(projectPath, actualPhase, forceReset: true)
```

Or manually clear: `rm ~/.gsd-harness/data/sessions.db`

### Session Stuck

If a session is stuck, the orchestrator should:

1. End the session: `gsd_end_session(sessionId)`
2. Start fresh: `gsd_start_session(workingDir, command)`

## Architecture

```
gsd-orchestration-harness/
├── packages/
│   ├── harness/          # CLI entry point
│   ├── mcp-server/       # MCP tools (gsd_*)
│   ├── session-manager/  # Session lifecycle + SQLite
│   ├── web-server/       # HTTP/WebSocket server
│   └── dashboard/        # Web UI
├── bin/
│   └── gsd-harness       # CLI script
└── .claude/
    └── get-shit-done/
        └── workflows/
            └── orchestrate.md  # Orchestrator instructions
```

## MCP Tools Reference

| Tool                        | Purpose                         |
| --------------------------- | ------------------------------- |
| `gsd_list_sessions`         | List all sessions               |
| `gsd_start_session`         | Start new Claude session        |
| `gsd_end_session`           | Terminate a session             |
| `gsd_get_output`            | Get session output              |
| `gsd_respond_checkpoint`    | Respond to prompts (1, 2, y, n) |
| `gsd_wait_for_state_change` | Efficient waiting               |
| `gsd_sync_project_state`    | Sync filesystem → database      |
| `gsd_set_execution_state`   | Set/reconcile state             |
| `gsd_mark_phase_verified`   | Mark phase as verified          |

## What Makes This Special

- **Self-correcting**: Reconciles plans against reality before execution
- **Self-limiting**: Physical barriers prevent going off the rails
- **Self-verifying**: Quality gates built into the workflow
- **Parallel**: 4 simultaneous workstreams
- **Resumable**: State persists, restart anytime
- **Autonomous**: Start it and walk away

You've essentially built an **AI CI/CD pipeline** for software development.
