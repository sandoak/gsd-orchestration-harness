# GSD Session Harness

## Core Value

Enable Claude Code to orchestrate multiple GSD sessions in parallel, with automated checkpoint verification, freeing humans from manual session management.

## Problem

GSD (the Claude Code workflow system) requires manual session management:

- User must run `/clear` between phases
- User must manually copy the next GSD command
- Checkpoints require human verification (clicking around in browser)
- No visibility into multiple parallel workstreams
- Single session bottleneck limits throughput

## Solution

Build a harness that:

1. **Spawns GSD sessions** as separate Claude CLI processes
2. **Streams output** to a web dashboard (localhost:3333)
3. **Parses GSD state** to know what command to run next
4. **Handles checkpoints** - Playwright for verification, user for decisions
5. **Enables orchestrating Claude** to keep work moving forward

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GSD SESSION HARNESS                                  │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   Session 1     │  │   Session 2     │  │   Session 3     │  Dashboard   │
│  │   EXECUTING     │  │   PLANNING      │  │    (idle)       │  :3333       │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│           │                   │                   │                          │
│           └───────────────────┴───────────────────┘                          │
│                               │                                              │
│                    ┌──────────┴──────────┐                                   │
│                    │   Session Manager   │  MCP Server (stdio)               │
│                    │   + GSD Parser      │                                   │
│                    └──────────┬──────────┘                                   │
│                               │                                              │
│           ┌───────────────────┼───────────────────┐                          │
│           ▼                   ▼                   ▼                          │
│      claude CLI          claude CLI          claude CLI                      │
│      (session 1)         (session 2)         (session 3)                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Features

| Feature                  | Description                                        |
| ------------------------ | -------------------------------------------------- |
| 3 parallel session slots | Execute in one, plan in another, reserve third     |
| MCP tools                | 6 tools for Claude to control sessions             |
| GSD-aware parsing        | Reads STATE.md, ROADMAP.md, checkpoint XML         |
| Checkpoint handling      | Playwright for human-verify, prompts for decisions |
| Session recovery         | Reconnects after harness restart via SQLite        |
| Real-time dashboard      | xterm.js terminals with ANSI color support         |

## MCP Tools

| Tool                 | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `gsd_start_session`  | Start new GSD session in available slot   |
| `gsd_list_sessions`  | Get status of all session slots           |
| `gsd_get_output`     | Get recent output from a session          |
| `gsd_get_state`      | Parse .planning/ and return GSD state     |
| `gsd_get_checkpoint` | Get checkpoint info if session is waiting |
| `gsd_end_session`    | Terminate a running session               |

## Technology Stack

| Component   | Technology                             | Rationale                       |
| ----------- | -------------------------------------- | ------------------------------- |
| MCP Server  | TypeScript + @modelcontextprotocol/sdk | Official MCP SDK                |
| Web Server  | Fastify                                | Fast, TypeScript-first          |
| WebSocket   | ws                                     | Simple, reliable                |
| Dashboard   | React + Vite + Tailwind                | Fast dev, matches patterns      |
| Terminal    | xterm.js                               | Industry standard, ANSI support |
| State       | Zustand                                | Lightweight, TypeScript-first   |
| Persistence | better-sqlite3                         | Zero-config, crash-safe         |
| Process     | node:child_process                     | Native, handles pipes well      |

## Directory Structure

```
gsd-orchestration-harness/
├── package.json                 # Monorepo root
├── pnpm-workspace.yaml
├── packages/
│   ├── core/                    # Shared types and utilities
│   │   └── src/
│   │       ├── types.ts
│   │       └── gsd-parser.ts
│   ├── mcp-server/              # MCP server (stdio)
│   │   └── src/
│   │       ├── index.ts
│   │       ├── server.ts
│   │       ├── tools/
│   │       ├── session-manager.ts
│   │       ├── claude-process.ts
│   │       └── persistence.ts
│   ├── web-server/              # HTTP + WebSocket
│   │   └── src/
│   │       ├── http-server.ts
│   │       └── ws-server.ts
│   └── dashboard/               # React + Vite
│       └── src/
│           ├── App.tsx
│           └── components/
├── scripts/
│   ├── start.sh
│   └── dev.sh
└── data/
    └── sessions.db
```

## Checkpoint Handling

| Type                      | Frequency | Handling                                        |
| ------------------------- | --------- | ----------------------------------------------- |
| `checkpoint:human-verify` | 90%       | Orchestrator runs Playwright to verify          |
| `checkpoint:decision`     | 9%        | Present options to user, continue with choice   |
| `checkpoint:human-action` | 1%        | Alert user for manual steps (email links, etc.) |

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] MCP server with 6 tools working via stdio transport
- [ ] Session spawning of Claude CLI processes
- [ ] Output capture and streaming to dashboard
- [ ] GSD state parsing (.planning/ files)
- [ ] Checkpoint detection in output stream
- [ ] WebSocket real-time streaming to browser
- [ ] xterm.js terminal emulation with ANSI colors
- [ ] SQLite persistence for session recovery
- [ ] Recovery after harness restart
- [ ] 3 parallel session slots
- [ ] Playwright verification for checkpoints

### Out of Scope

- Remote/cloud deployment — localhost only for v1
- User authentication — single user assumed
- Multiple project orchestration — one project at a time
- Mobile/responsive dashboard — desktop-first
- Configuration UI — code/file based config only

## Constraints

| Constraint                    | Rationale                            |
| ----------------------------- | ------------------------------------ |
| Monorepo with pnpm workspaces | Clean separation of concerns         |
| stdio MCP transport           | Standard Claude Code integration     |
| SQLite for persistence        | Zero-config, crash-safe              |
| localhost:3333 for dashboard  | No external network needed           |
| Node.js >=22.0.0 <25.0.0      | Modern features, known issues in v25 |

## Key Decisions

| Decision                           | Rationale                              | Outcome |
| ---------------------------------- | -------------------------------------- | ------- |
| Spawn fresh Claude CLI per command | Avoids stdin complexity, clean context | Pending |
| SQLite over file-based state       | Crash-safe, atomic operations          | Pending |
| xterm.js for terminal              | Industry standard, full ANSI support   | Pending |
| 3 session slots                    | Balance parallelism vs. complexity     | Pending |

## Success Criteria

1. **MCP tools work** - Call each tool from Claude Code, verify responses
2. **Session spawning** - Start session, see output in dashboard
3. **Parallel sessions** - Run 2 sessions simultaneously
4. **Recovery** - Kill harness, restart, verify sessions reconnect
5. **GSD parsing** - Verify correct phase/plan detection
6. **Checkpoint handling** - Playwright verifies, orchestrator continues
7. **End-to-end** - Run full GSD workflow with harness orchestration

## Related Resources

- Planning docs: `/mnt/dev-linux/projects/general-reference/project-ideas/gsd-automation-harness/`
- GSD workflow: `.claude/get-shit-done/`
- MCP SDK: `@modelcontextprotocol/sdk`

---

_Last updated: 2026-01-11 after initialization_
