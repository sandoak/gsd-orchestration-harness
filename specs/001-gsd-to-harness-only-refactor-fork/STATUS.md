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
| 1     | Worker Message Protocol            | Pending  |         |
| 2     | File-Based Protocol Directory      | Pending  |         |
| 3     | Project State Documents            | Pending  |         |
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
