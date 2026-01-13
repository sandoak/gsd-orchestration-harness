# Architecture Context

**Last Updated**: 2026-01-13
**Domain**: Architecture
**Status**: Active

## Overview

System architecture documentation for the GSD Orchestration Harness - a parallel Claude Code session manager for automated project execution.

## Quick Navigation

| Topic            | File                                       | Description                         |
| ---------------- | ------------------------------------------ | ----------------------------------- |
| Harness Overview | [harness-overview.md](harness-overview.md) | Slots, phases, gates, PTY detection |

## Architecture Summary

**Core Concept**: 4 parallel PTY slots running Claude Code sessions, orchestrated via MCP tools.

**Key Components**:

- **Session Manager** - PTY spawning, wait state detection
- **MCP Server** - HTTP transport for orchestration tools
- **Dashboard** - Real-time WebSocket monitoring
- **SQLite DB** - Session and orchestration state persistence

**Phase Execution**:

- Verify gates block Phase N+2 while Phase N pending verify
- `maxExecutePhase = pendingVerifyPhase + 1`
- Parallel execution: verify + execute within limits

## Technology Stack

- **Runtime**: Node.js >=22.0.0 <25.0.0
- **Language**: TypeScript 5.x (strict mode)
- **Database**: SQLite via better-sqlite3
- **PTY**: node-pty for Claude CLI sessions
- **Testing**: Vitest

## Related Context

- [/context/development/CLAUDE.md](/context/development/CLAUDE.md) - Development workflows
- [/context/operations/CLAUDE.md](/context/operations/CLAUDE.md) - Harness setup and operation

---

_For updates, use `/context.update` command_
