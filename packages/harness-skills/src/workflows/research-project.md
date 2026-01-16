# Research Project Workflow

## DEPRECATED

**This workflow has been consolidated into the harness-researcher agent.**

The research methodology for project research now lives in:

- `agents/harness-researcher.md`

The `/harness:research-project` command spawns 4 parallel harness-researcher agents:

- Stack agent -> .planning/research/STACK.md
- Features agent -> .planning/research/FEATURES.md
- Architecture agent -> .planning/research/ARCHITECTURE.md
- Pitfalls agent -> .planning/research/PITFALLS.md

The orchestrator synthesizes SUMMARY.md after all agents complete.

**Migration:** No action needed - the command handles this automatically.

---

_Deprecated: 2026-01-15_
_Replaced by: agents/harness-researcher.md_
