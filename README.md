# GSD Orchestration Harness

Enable Claude Code to orchestrate multiple GSD sessions in parallel, with automated checkpoint verification, freeing humans from manual session management.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the harness
pnpm harness:start
```

The harness starts:

- **MCP Server** on stdio (for Claude Code integration)
- **Web Dashboard** at http://localhost:3333

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

## MCP Tools

The harness provides 7 MCP tools for session orchestration:

| Tool                     | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `gsd_start_session`      | Start a new GSD session in an available slot    |
| `gsd_list_sessions`      | Get status of all session slots                 |
| `gsd_end_session`        | Terminate a running session                     |
| `gsd_get_output`         | Get recent output from a session                |
| `gsd_get_state`          | Parse .planning/ directory and return GSD state |
| `gsd_get_checkpoint`     | Get checkpoint info if session is waiting       |
| `gsd_respond_checkpoint` | Send a response to a waiting checkpoint         |

## Claude Code Integration

Add the harness to your Claude Code configuration:

### Using claude_desktop_config.json

```json
{
  "mcpServers": {
    "gsd-harness": {
      "command": "node",
      "args": ["packages/harness/dist/index.js"],
      "cwd": "/path/to/gsd-orchestration-harness"
    }
  }
}
```

### Using .mcp.json (project-local)

```json
{
  "mcpServers": {
    "gsd-harness": {
      "command": "node",
      "args": ["packages/harness/dist/index.js"],
      "cwd": "/path/to/gsd-orchestration-harness"
    }
  }
}
```

See `mcp-config.json.example` for a complete example configuration.

### Environment Variables

| Variable           | Default | Description                |
| ------------------ | ------- | -------------------------- |
| `GSD_HARNESS_PORT` | `3333`  | Port for the web dashboard |

## Dashboard

The web dashboard provides real-time session monitoring:

- **URL**: http://localhost:3333 (same as API)
- **Features**:
  - 3 session slots displayed simultaneously
  - xterm.js terminals with full ANSI color support
  - Real-time WebSocket updates
  - Session state indicators (running, waiting checkpoint, completed, failed)

The dashboard is served automatically by the harness - no separate server needed.

## Development

```bash
# Watch mode (rebuilds on changes)
pnpm dev

# Dashboard dev server with hot reload (port 5173)
cd packages/dashboard && pnpm dev

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint code
pnpm lint

# Fix lint issues
pnpm lint:fix

# Type check
pnpm typecheck
```

## Packages

This monorepo contains the following packages:

| Package                | Description                                 |
| ---------------------- | ------------------------------------------- |
| `@gsd/core`            | Shared types and interfaces (no runtime)    |
| `@gsd/session-manager` | Claude CLI process spawning and persistence |
| `@gsd/mcp-server`      | MCP tools using stdio transport             |
| `@gsd/web-server`      | Fastify HTTP + WebSocket server             |
| `@gsd/dashboard`       | React + Vite dashboard with xterm.js        |
| `@gsd/harness`         | Unified entry point for all components      |

## Session Lifecycle

Sessions progress through these states:

```
idle → running → waiting_checkpoint → running → completed
                       ↓
                    failed
```

## Checkpoint Handling

The harness detects three checkpoint types:

| Type                      | Frequency | Handling                         |
| ------------------------- | --------- | -------------------------------- |
| `checkpoint:human-verify` | 90%       | Automated verification possible  |
| `checkpoint:decision`     | 9%        | Present options, wait for choice |
| `checkpoint:human-action` | 1%        | Alert for manual steps required  |

Use `gsd_get_checkpoint` to inspect checkpoint details and `gsd_respond_checkpoint` to continue.

## Orchestration Mode

The harness enables Claude to orchestrate multiple GSD sessions in parallel using the `/gsd:orchestrate` command.

### How It Works

1. **Check Harness**: Verify MCP tools are available via `gsd_list_sessions`
2. **Build Work Queue**: Load ROADMAP.md to identify phases/plans to execute
3. **Assign Work**: Start sessions in idle slots with `gsd_start_session`
4. **Monitor Progress**: Poll running sessions for completion or checkpoints
5. **Handle Checkpoints**: Respond to checkpoints via `gsd_respond_checkpoint`
6. **Assign Next Work**: As slots complete, assign remaining plans
7. **Report Completion**: Update STATE.md and report final status

### Example Orchestration Flow

```
Slot 0: running  → Phase 2 Plan 1
Slot 1: running  → Phase 2 Plan 2
Slot 2: idle     → (waiting for work)

[Slot 0 completes]
Slot 0: idle     → Assigning Phase 2 Plan 3...
Slot 1: running  → Phase 2 Plan 2
Slot 2: idle     → (no more parallel-safe work)

[Slot 1 hits checkpoint]
Slot 0: running  → Phase 2 Plan 3
Slot 1: waiting  → CHECKPOINT: decision needed
Slot 2: idle

[Orchestrator handles checkpoint]
gsd_get_checkpoint("slot-1") → decision options
gsd_respond_checkpoint("slot-1", "option-a")
Slot 1: running  → continuing...
```

### Usage

```bash
# In your project directory
/gsd:orchestrate
```

The orchestrator Claude:

- Acts as session coordinator
- Assigns work based on ROADMAP dependencies
- Handles checkpoints (auto-approve human-verify when possible)
- Surfaces decisions and manual actions to user
- Tracks overall progress across all sessions

See `.claude/get-shit-done/workflows/orchestrate.md` for full workflow details.

## Requirements

- Node.js >=22.0.0 <25.0.0
- pnpm >=9.0.0

## License

MIT
