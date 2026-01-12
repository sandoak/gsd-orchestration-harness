# Phase 5: GSD Integration - Context

**Gathered:** 2026-01-12 (revised)
**Status:** Ready for planning

<vision>
## How This Should Work

The harness runs on the **same machine** as Claude Code — this is essential because Claude CLI needs the user's OAuth tokens. The harness + MCP server are local infrastructure for a single GSD orchestrator.

**The orchestrator is this Claude conversation.** When I call `gsd_start_session`, a Claude CLI process spawns in one of the 3 slots. When that session hits a checkpoint, I get notified via MCP and handle the verification myself (using Playwright MCP, reading files, etc.).

**Slot assignment follows the GSD pipeline:**

- Slot 1 = Planning (running `/gsd:plan-phase`)
- Slot 2 = Execution (running `/gsd:execute-plan`)
- Slot 3 = Verification (handling checkpoints, running tests)

Work flows through the pipeline. When planning completes, execution can start. When execution hits a checkpoint, verification slot handles it.

**Not everything parallelizes.** Planning depends on prior implementation results (SUMMARYs contain decisions). So slots aren't always all active — sometimes it's serial, sometimes parallel, depending on GSD workflow state.

</vision>

<essential>
## What Must Be Nailed

The **checkpoint handling loop** is the core automation:

1. **Detect** — Recognize checkpoint in session output (using CHECKPOINT_PATTERNS)
2. **Parse** — Extract checkpoint content (what-built, how-to-verify, options, etc.)
3. **Notify** — Alert the orchestrator (this Claude) via MCP tool response
4. **Verify** — Orchestrator performs verification (Playwright, file checks, etc.)
5. **Relay** — Send orchestrator's response back to the CLI session's stdin

If this loop works reliably, the harness is useful. Everything else is secondary.

</essential>

<boundaries>
## What's Out of Scope

- **Multi-project support** — All 3 slots work on the same project. No switching between different projects in this phase.
- **Smart parallelization** — No automatic detection of what can run in parallel. The orchestrator (this Claude) decides which slots do what.
- **Remote deployment** — Harness must run locally (same machine as Claude Code for OAuth). Remote/cloud is future work.

</boundaries>

<specifics>
## Specific Ideas

- MCP tools are the primary interface — the orchestrator calls `gsd_start_session`, `gsd_get_checkpoint`, etc.
- WebSocket is for dashboard UI, not orchestrator communication (orchestrator uses MCP)
- Checkpoint response goes to session stdin (`sendInput()` method on SessionManager)
- State parsing helps orchestrator understand where each slot is in its workflow

</specifics>

<notes>
## Additional Context

Previous context described "multiple orchestrating Claudes connecting to a server" — that's wrong. This is simpler:

- One GSD orchestrator (this Claude conversation)
- One harness (local process)
- Three session slots (for pipeline stages)
- MCP tools for control
- Dashboard for visibility

The harness is acceleration infrastructure, not a multi-tenant server.

</notes>

---

_Phase: 05-gsd-integration_
_Context gathered: 2026-01-12 (revised)_
