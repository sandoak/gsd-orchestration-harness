# Phase 5: GSD Integration - Context

**Gathered:** 2026-01-12
**Status:** Ready for planning

<vision>
## How This Should Work

The harness is a **standalone server** that multiple orchestrating Claudes connect to. Each orchestrator manages its own session — the harness doesn't do checkpoint resolution itself, it just detects checkpoints and notifies the connected orchestrator.

When a session hits a checkpoint:

1. Harness detects the checkpoint in session output
2. Harness classifies it (human-verify, decision, human-action)
3. Harness notifies the connected orchestrator: "Your session hit a checkpoint, here's the content"
4. Orchestrator handles verification locally (using its own Playwright MCP)
5. Orchestrator reports back (approve, fail, needs more work)
6. Harness relays that response to the Claude CLI session

The 3 slots are for **different projects** — each orchestrator connects and manages one slot. This is cleaner than trying to run parallel phases of the same project, since planning depends on implementation results.

</vision>

<essential>
## What Must Be Nailed

- **State parsing** - Read STATE.md, ROADMAP.md, PLAN.md to understand where a session is in its workflow
- **Checkpoint detection** - Recognize when session output contains a checkpoint, parse its content
- **Checkpoint classification** - Distinguish human-verify, decision, human-action types
- **Orchestrator notifications** - Push checkpoint events to the connected orchestrator via WebSocket with full checkpoint content
- **Response relay** - Receive orchestrator's verification result and send it to the CLI session

All five are equally critical — the integration doesn't work without any of them.

</essential>

<boundaries>
## What's Out of Scope

- **Multi-tenant auth** - No authentication/permissions between orchestrators yet. Anyone can connect. This is Phase 6 or later.
- **Playwright in harness** - Harness doesn't run verification. Orchestrator runs Playwright locally and reports back.
- **Checkpoint auto-resolution logic** - Harness just detects and relays. Smart handling is the orchestrator's job.

</boundaries>

<specifics>
## Specific Ideas

- Checkpoint detection should use the CHECKPOINT_PATTERNS from @gsd/core (established in Phase 3)
- WebSocket messages should include full checkpoint content so orchestrator can parse verification steps
- Response relay needs to handle the different response types: approve, fail, needs-more-work, etc.
- State parsing is MVP regex for now — future enhancement could be full AST parsing

</specifics>

<notes>
## Additional Context

Original thought was running implementation and planning phases in parallel, but planning depends on implementation results (SUMMARY.md contains decisions, patterns). Serial execution per project makes more sense.

The harness becomes infrastructure that orchestrators connect to — like a session management server. Each orchestrator is responsible for its own project's checkpoint handling.

</notes>

---

_Phase: 05-gsd-integration_
_Context gathered: 2026-01-12_
