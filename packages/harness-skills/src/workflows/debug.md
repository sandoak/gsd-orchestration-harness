# Debug Workflow (DEPRECATED)

This workflow has been consolidated into the `harness-debugger` agent.

**Location:** `agents/harness-debugger.md`

**Reason:** The harness-debugger agent contains all debugging expertise. Loading a separate workflow into orchestrator context was wasteful.

**Migration:**

- `/harness:debug` now spawns `harness-debugger` agent directly
- All debugging methodology lives in the agent file
- Templates remain at `get-shit-done/templates/DEBUG.md`

See `agents/harness-debugger.md` for debugging expertise.
