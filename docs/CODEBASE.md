# GSD Orchestration Harness - Codebase Documentation

> Comprehensive reference for understanding the harness architecture and codebase.

---

## Quick Reference

| Package              | Purpose                  | Key Files                                             |
| -------------------- | ------------------------ | ----------------------------------------------------- |
| @gsd/core            | Domain types, parsers    | `types/*.ts`, `gsd-state-parser.ts`                   |
| @gsd/session-manager | PTY + SQLite persistence | `session-manager.ts`, `persistent-session-manager.ts` |
| @gsd/mcp-server      | MCP tool definitions     | `tools/*.ts`, `server.ts`                             |
| @gsd/web-server      | HTTP/WebSocket/MCP HTTP  | `server.ts`, `websocket.ts`                           |
| @gsd/harness         | CLI entry point          | `cli.ts`                                              |
| @gsd/dashboard       | React UI                 | `App.tsx`, `components/`                              |

---

## Structure

```
gsd-orchestration-harness/
├── packages/
│   ├── core/                    # Domain types and utilities
│   │   └── src/
│   │       ├── types/           # TypeScript interfaces
│   │       │   ├── session.ts   # Session, SessionStatus
│   │       │   ├── events.ts    # Event types, PromptIntent
│   │       │   ├── checkpoint.ts # Checkpoint types
│   │       │   └── gsd-state.ts # GSD state interfaces
│   │       ├── gsd-state-parser.ts  # Parse STATE.md, ROADMAP.md
│   │       └── index.ts
│   │
│   ├── session-manager/         # Session lifecycle management
│   │   └── src/
│   │       ├── session-manager.ts           # Core PTY management
│   │       ├── persistent-session-manager.ts # SQLite decorator
│   │       ├── output-buffer.ts             # Circular buffer
│   │       ├── db/
│   │       │   ├── session-store.ts         # Session persistence
│   │       │   └── orchestration-store.ts   # Execution state
│   │       └── index.ts
│   │
│   ├── mcp-server/              # MCP tool implementations
│   │   └── src/
│   │       ├── server.ts        # Tool registration
│   │       └── tools/
│   │           ├── start-session.ts      # gsd_start_session
│   │           ├── list-sessions.ts      # gsd_list_sessions
│   │           ├── end-session.ts        # gsd_end_session
│   │           ├── get-output.ts         # gsd_get_output
│   │           ├── get-state.ts          # gsd_get_state
│   │           ├── get-checkpoint.ts     # gsd_get_checkpoint
│   │           ├── respond-checkpoint.ts # gsd_respond_checkpoint
│   │           ├── wait-for-state-change.ts # gsd_wait_for_state_change
│   │           ├── sync-project-state.ts # gsd_sync_project_state
│   │           ├── set-execution-state.ts # gsd_set_execution_state
│   │           └── mark-phase-verified.ts # gsd_mark_phase_verified
│   │
│   ├── web-server/              # HTTP + WebSocket server
│   │   └── src/
│   │       ├── server.ts        # Fastify setup, routes
│   │       ├── websocket.ts     # Real-time updates
│   │       └── mcp-http.ts      # MCP HTTP Streamable transport
│   │
│   ├── harness/                 # CLI entry point
│   │   └── src/
│   │       └── cli.ts           # Main entry, starts all services
│   │
│   └── dashboard/               # React frontend
│       └── src/
│           ├── App.tsx          # Main component
│           ├── stores/          # Zustand state
│           ├── components/
│           │   ├── Terminal.tsx # xterm.js wrapper
│           │   └── SessionCard.tsx
│           └── hooks/
│
├── docs/                        # Documentation
│   └── CODEBASE.md             # This file
│
├── .planning/                   # GSD planning docs (for harness itself)
│
└── .claude/                     # Claude Code configuration
    └── get-shit-done/           # GSD skills (being forked to harness)
```

---

## Tech Stack

### Runtime

- **Node.js** >=22.0.0 <25.0.0 (glob bug in v25)
- **TypeScript** 5.3+ (strict mode)

### Core Dependencies

| Package                     | Version | Purpose              |
| --------------------------- | ------- | -------------------- |
| `@modelcontextprotocol/sdk` | ^1.12.0 | MCP server/client    |
| `better-sqlite3`            | ^11.0.0 | SQLite with WAL mode |
| `node-pty`                  | ^1.0.0  | PTY for Claude CLI   |
| `fastify`                   | ^5.0.0  | HTTP server          |
| `@fastify/websocket`        | ^11.0.0 | WebSocket support    |
| `zod`                       | ^3.24.0 | Schema validation    |

### Frontend

| Package        | Version | Purpose            |
| -------------- | ------- | ------------------ |
| `react`        | ^19.0.0 | UI framework       |
| `zustand`      | ^5.0.0  | State management   |
| `@xterm/xterm` | ^5.5.0  | Terminal emulation |
| `tailwindcss`  | ^4.0.0  | Styling            |

### Build

| Tool     | Purpose                      |
| -------- | ---------------------------- |
| `pnpm`   | Package manager (workspaces) |
| `tsup`   | TypeScript bundler           |
| `vite`   | Frontend build               |
| `vitest` | Testing                      |

---

## Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      PRESENTATION                            │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │  Dashboard      │  │  MCP Client (Claude orchestrator) │  │
│  │  (React/xterm)  │  │                                   │  │
│  └────────┬────────┘  └────────────────┬─────────────────┘  │
└───────────┼────────────────────────────┼────────────────────┘
            │ WebSocket                  │ MCP HTTP
┌───────────┼────────────────────────────┼────────────────────┐
│           │         HTTP LAYER         │                    │
│  ┌────────▼────────────────────────────▼─────────────────┐  │
│  │              Web Server (Fastify)                      │  │
│  │  /api/sessions, /ws, /mcp (HTTP Streamable)           │  │
│  └────────────────────────┬──────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                    SERVICE LAYER                            │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │           PersistentSessionManager                     │  │
│  │  (Decorator: adds SQLite persistence)                  │  │
│  └────────────────────────┬──────────────────────────────┘  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │              SessionManager                            │  │
│  │  (Core: PTY lifecycle, wait state detection)          │  │
│  └────────────────────────┬──────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                     DATA LAYER                              │
│  ┌──────────────────┐  ┌─────────────────────────────────┐  │
│  │  SessionStore    │  │  OrchestrationStore             │  │
│  │  (sessions table)│  │  (execution_state table)        │  │
│  └────────┬─────────┘  └────────────────┬────────────────┘  │
│           └──────────────┬──────────────┘                   │
│                   ┌──────▼──────┐                           │
│                   │   SQLite    │                           │
│                   │  (WAL mode) │                           │
│                   └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                      OS LAYER                               │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │                    node-pty                            │  │
│  │  (Spawns Claude CLI in PTY)                           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Orchestrator calls MCP tool (gsd_start_session)
          │
          ▼
2. Web Server receives HTTP request
          │
          ▼
3. MCP Server routes to tool handler
          │
          ▼
4. SessionManager spawns PTY with Claude CLI
          │
          ▼
5. PTY output captured in circular buffer
          │
          ▼
6. Wait state detection analyzes output
          │
          ▼
7. Events emitted (session:waiting, session:output)
          │
          ▼
8. WebSocket broadcasts to dashboard
          │
          ▼
9. SQLite persists session state
```

---

## Key Algorithms

### Wait State Detection (`session-manager.ts`)

```typescript
detectWaitState(output: string): WaitStateResult {
  // 1. Check for "Baked for" (work complete, waiting for input)
  const hasBakedFor = output.match(/Baked for/i);

  // 2. Check for active spinner (still working)
  const hasActiveSpinner = !hasBakedFor && lastChunk.match(/[✶✻✽✢]/);
  if (hasActiveSpinner) return { waiting: false };

  // 3. Check for prompt character (❯)
  const hasPrompt = lastLine.match(/❯\s*$/);

  // 4. Check for numbered menu
  const menuMatch = output.match(/^\s*(\d+)\./gm);

  // 5. Classify prompt intent
  const intent = classifyPromptIntent(output);

  return { waiting: hasPrompt, intent, menuOptions };
}
```

### Physical Barriers (`start-session.ts`)

```typescript
// Only 1 execute at a time
if (isExecuteCommand(command)) {
  const runningExecutes = sessions.filter(
    (s) => s.status === 'running' && isExecuteCommand(s.currentCommand)
  );
  if (runningExecutes.length >= 1) {
    return { error: 'EXECUTION LIMIT: Only 1 execute at a time' };
  }
}

// Verify gate - must verify before next phase
const verifyCheck = orchestrationStore.canStartExecute(workingDir, phase);
if (!verifyCheck.allowed) {
  return { error: `VERIFY GATE: ${verifyCheck.reason}` };
}

// Planning limit - only plan 2 phases ahead
const planCheck = orchestrationStore.canStartPlan(workingDir, phase);
if (!planCheck.allowed) {
  return { error: `PLANNING LIMIT: ${planCheck.reason}` };
}
```

---

## MCP Tools Reference

| Tool                        | Purpose                      | Key Parameters                        |
| --------------------------- | ---------------------------- | ------------------------------------- |
| `gsd_start_session`         | Spawn Claude CLI session     | `workingDir`, `command`               |
| `gsd_list_sessions`         | List all sessions            | `filter` (optional)                   |
| `gsd_end_session`           | Terminate session            | `sessionId`                           |
| `gsd_get_output`            | Get session output           | `sessionId`, `lines`, `since`         |
| `gsd_get_state`             | Get GSD project state        | `sessionId`                           |
| `gsd_get_checkpoint`        | Check for pending checkpoint | `sessionId`                           |
| `gsd_respond_checkpoint`    | Send response to session     | `sessionId`, `response`               |
| `gsd_wait_for_state_change` | Block until state changes    | `sessionIds`, `timeout`               |
| `gsd_sync_project_state`    | Sync state from .planning/   | `projectPath`                         |
| `gsd_set_execution_state`   | Set execution position       | `projectPath`, `highestExecutedPhase` |
| `gsd_mark_phase_verified`   | Mark phase as verified       | `projectPath`, `phaseNumber`          |

---

## Database Schema

### sessions table

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  slot INTEGER NOT NULL,
  status TEXT NOT NULL,  -- 'running' | 'completed' | 'failed'
  working_dir TEXT NOT NULL,
  current_command TEXT,
  started_at TEXT,
  ended_at TEXT,
  pid INTEGER,
  exit_code INTEGER
);
```

### execution_state table

```sql
CREATE TABLE execution_state (
  project_path TEXT PRIMARY KEY,
  highest_executed_phase INTEGER DEFAULT 0,
  highest_verified_phase INTEGER DEFAULT 0,
  pending_verify_phase INTEGER,
  highest_executing_phase INTEGER,
  highest_executing_plan INTEGER,
  updated_at TEXT
);
```

---

## Development

### Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm dev              # Start harness (port 3333)
pnpm test             # Run tests
pnpm lint             # Lint code
pnpm lint:fix         # Fix lint issues
```

### Adding a New MCP Tool

1. Create `packages/mcp-server/src/tools/your-tool.ts`:

```typescript
import { z } from 'zod';

const schema = {
  param: z.string().describe('Description'),
};

export function registerYourTool(server, manager) {
  server.tool('gsd_your_tool', schema, async ({ param }) => {
    // Implementation
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true }) }],
    };
  });
}
```

2. Register in `packages/mcp-server/src/server.ts`:

```typescript
import { registerYourTool } from './tools/your-tool.js';
registerYourTool(server, manager);
```

---

## Troubleshooting

### "Session not found" errors

- Session may have been terminated
- Harness restart invalidates old session IDs
- Use `gsd_list_sessions` to get current IDs

### Wait state not detected

- Check for "Baked for" pattern in output
- Spinner characters may be blocking detection
- Use `gsd_get_output` to inspect raw output

### Database locked

- SQLite uses WAL mode for concurrent reads
- Only one write at a time
- Check for hung processes holding lock

---

_Last updated: 2026-01-16_
