# GSD Orchestration Harness Architecture

This document describes the system architecture, data flow, and design decisions of the GSD Orchestration Harness.

## Overview

The GSD Orchestration Harness enables Claude Code to manage multiple parallel GSD (Get Shit Done) sessions. It provides:

1. **MCP Server**: Exposes tools for session control via stdio transport
2. **Session Manager**: Spawns and manages Claude CLI processes
3. **Web Dashboard**: Real-time terminal monitoring with xterm.js
4. **GSD Parser**: Extracts state from `.planning/` files

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

## Data Flow

### 1. Claude Code → MCP Server (stdio JSON-RPC)

Claude Code communicates with the harness via MCP (Model Context Protocol):

```
Claude Code                    MCP Server
    │                              │
    │──── JSON-RPC request ──────>│  (stdin)
    │     {tool: gsd_start_session}
    │                              │
    │<─── JSON-RPC response ──────│  (stdout)
    │     {session_id: "abc123"}   │
```

The MCP server uses stdio transport, meaning:

- Requests arrive on `stdin` as JSON-RPC messages
- Responses go to `stdout` as JSON-RPC messages
- All logging goes to `stderr` to avoid corrupting the JSON-RPC stream

### 2. MCP Server → SessionManager → Claude CLI Processes

When a session starts:

```
GsdMcpServer
    │
    ├── registerTools() → 7 MCP tools
    │
    └── PersistentSessionManager
            │
            ├── spawnSession(projectPath, command)
            │       │
            │       └── ClaudeProcess (node:child_process)
            │               │
            │               ├── spawn("claude", [...args])
            │               ├── stdout → captured output
            │               ├── stderr → captured output
            │               └── stdin ← checkpoint responses
            │
            └── SQLite (sessions.db)
                    ├── sessions table
                    └── session_output table
```

### 3. SessionManager Events → WebSocket → Dashboard

Real-time updates flow to the dashboard:

```
ClaudeProcess                   Dashboard
    │                              │
    │ stdout data                  │
    ▼                              │
SessionManager                     │
    │                              │
    │ emit('output', data)         │
    ▼                              │
HarnessServer (Fastify)            │
    │                              │
    │ WebSocket broadcast          │
    ▼                              │
ws://localhost:3333/ws ──────────> WebSocket client
                                   │
                                   ▼
                               useSessionStore (Zustand)
                                   │
                                   ▼
                               TerminalSlot (xterm.js)
```

### 4. Checkpoint Detection → MCP Tool Response → stdin Relay

When a checkpoint is detected:

```
ClaudeProcess stdout
    │
    │ "════════════════════════"
    │ "CHECKPOINT: human-verify"
    │
    ▼
CheckpointParser
    │
    │ detects checkpoint pattern
    │
    ▼
SessionManager
    │
    │ updates session state to 'waiting_checkpoint'
    │ stores checkpoint info
    │
    ▼
Claude Code calls gsd_get_checkpoint
    │
    │ returns checkpoint details
    │
    ▼
Claude Code calls gsd_respond_checkpoint("approved")
    │
    ▼
SessionManager
    │
    │ writes to session stdin
    │
    ▼
ClaudeProcess stdin → continues execution
```

## Package Structure

```
packages/
├── core/                    # Shared types, no runtime deps
│   └── src/
│       ├── types.ts         # SessionState, SessionEvent, etc.
│       └── checkpoint-patterns.ts
│
├── session-manager/         # Process spawning, SQLite persistence
│   └── src/
│       ├── claude-process.ts      # Spawns claude CLI
│       ├── session-manager.ts     # Manages session lifecycle
│       ├── persistent-manager.ts  # SQLite + recovery
│       └── persistence.ts         # Database operations
│
├── mcp-server/              # MCP tools, stdio transport
│   └── src/
│       ├── server.ts              # GsdMcpServer class
│       └── tools/
│           ├── start-session.ts   # gsd_start_session
│           ├── list-sessions.ts   # gsd_list_sessions
│           ├── end-session.ts     # gsd_end_session
│           ├── get-output.ts      # gsd_get_output
│           ├── get-state.ts       # gsd_get_state
│           ├── get-checkpoint.ts  # gsd_get_checkpoint
│           └── respond-checkpoint.ts
│
├── web-server/              # Fastify + WebSocket
│   └── src/
│       ├── harness-server.ts      # HarnessServer class
│       ├── routes.ts              # HTTP endpoints
│       └── ws-handler.ts          # WebSocket events
│
├── dashboard/               # React + xterm.js
│   └── src/
│       ├── App.tsx
│       ├── store/
│       │   └── session-store.ts   # Zustand state
│       └── components/
│           ├── SessionGrid.tsx
│           ├── TerminalSlot.tsx
│           └── SessionControls.tsx
│
└── harness/                 # Unified entry point
    └── src/
        └── index.ts               # Main entry, starts all servers
```

## Key Patterns

### PersistentSessionManager as Shared State

A single `PersistentSessionManager` instance is shared between the MCP server and web server:

```typescript
const manager = new PersistentSessionManager();

const webServer = new HarnessServer({ manager, port });
const mcpServer = new GsdMcpServer(manager);
```

This ensures:

- Both servers see the same session state
- Events emitted from sessions reach both WebSocket clients and MCP tool calls
- SQLite persistence is centralized

### EventEmitter for Cross-Component Communication

Session events use Node.js EventEmitter:

```typescript
interface SessionEventMap {
  output: (sessionId: string, data: string) => void;
  'state-change': (sessionId: string, state: SessionState) => void;
  checkpoint: (sessionId: string, checkpoint: CheckpointInfo) => void;
  error: (sessionId: string, error: Error) => void;
}
```

Components subscribe to events:

```typescript
manager.on('output', (sessionId, data) => {
  ws.broadcast({ type: 'output', sessionId, data });
});
```

### Discriminated Unions for Type-Safe Events

Events use discriminated unions for type safety:

```typescript
type SessionEvent =
  | { type: 'output'; sessionId: string; data: string }
  | { type: 'state_change'; sessionId: string; state: SessionState }
  | { type: 'checkpoint'; sessionId: string; info: CheckpointInfo }
  | { type: 'error'; sessionId: string; error: string };
```

### SQLite WAL Mode for Concurrent Access

The database uses WAL (Write-Ahead Logging) mode:

```typescript
db.pragma('journal_mode = WAL');
```

Benefits:

- Dashboard can read while sessions write
- Better performance for concurrent operations
- Crash recovery for interrupted sessions

## Session Lifecycle

Sessions progress through a state machine:

```
     ┌─────────┐
     │  idle   │  (slot available)
     └────┬────┘
          │ gsd_start_session
          ▼
     ┌─────────┐
     │ running │  (claude CLI executing)
     └────┬────┘
          │
          ├──────────────────┐
          │                  │ checkpoint detected
          ▼                  ▼
     ┌─────────┐    ┌──────────────────┐
     │completed│    │waiting_checkpoint│
     └─────────┘    └────────┬─────────┘
                             │ gsd_respond_checkpoint
                             ▼
                        ┌─────────┐
                        │ running │
                        └────┬────┘
                             │
          ┌──────────────────┴──────────────────┐
          ▼                                      ▼
     ┌─────────┐                           ┌────────┐
     │completed│                           │ failed │
     └─────────┘                           └────────┘
```

### State Transitions

| From                 | To                   | Trigger                     |
| -------------------- | -------------------- | --------------------------- |
| `idle`               | `running`            | `gsd_start_session` called  |
| `running`            | `waiting_checkpoint` | Checkpoint pattern detected |
| `running`            | `completed`          | Process exits with code 0   |
| `running`            | `failed`             | Process exits with error    |
| `waiting_checkpoint` | `running`            | `gsd_respond_checkpoint`    |

## Checkpoint Handling

### Detection

Checkpoints are detected via regex patterns in Claude CLI output:

```typescript
const CHECKPOINT_PATTERNS = {
  header: /═{20,}.*CHECKPOINT.*═{20,}/,
  type: /CHECKPOINT:\s*(human-verify|decision|human-action)/i,
  taskNumber: /Task\s+(\d+)\s+of\s+(\d+)/,
};
```

### Types

| Type           | Frequency | Description                    |
| -------------- | --------- | ------------------------------ |
| `human-verify` | 90%       | Claude built something, verify |
| `decision`     | 9%        | Choose between options         |
| `human-action` | 1%        | Manual step required           |

### Response Flow

1. `gsd_get_checkpoint` returns checkpoint info
2. Orchestrator or user reviews
3. `gsd_respond_checkpoint` sends response to stdin
4. Claude CLI continues execution

## Persistence

### SQLite Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  slot INTEGER NOT NULL,
  project_path TEXT NOT NULL,
  command TEXT NOT NULL,
  pid INTEGER,
  state TEXT NOT NULL DEFAULT 'idle',
  checkpoint_type TEXT,
  checkpoint_raw TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE session_output (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  data TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Recovery

On harness restart:

1. Query sessions with `state='running'` or `state='waiting_checkpoint'`
2. Check if PID is still alive
3. If alive: Cannot reconnect (limitation of stdio)
4. Mark orphaned sessions as `failed`
5. Emit `recovery:complete` event

## Technology Choices

| Component   | Choice                    | Rationale                         |
| ----------- | ------------------------- | --------------------------------- |
| MCP SDK     | @modelcontextprotocol/sdk | Official SDK for Claude Code      |
| Process     | node:child_process        | Native, handles pipes well        |
| Database    | better-sqlite3            | Sync API, crash-safe, zero-config |
| HTTP Server | Fastify 5.x               | Fast, TypeScript-first            |
| WebSocket   | @fastify/websocket        | Integrated with Fastify           |
| Dashboard   | React 19 + Vite           | Modern, fast dev experience       |
| State       | Zustand 5.x               | Lightweight, TypeScript-first     |
| Terminal    | xterm.js 5.x              | Industry standard, ANSI support   |

## Constraints

| Constraint          | Rationale                           |
| ------------------- | ----------------------------------- |
| localhost only      | v1 scope, no auth complexity        |
| 3 session slots     | Balance parallelism vs. complexity  |
| stdio MCP transport | Standard Claude Code integration    |
| Node.js >=22 <25    | Modern features, avoid v25 glob bug |
