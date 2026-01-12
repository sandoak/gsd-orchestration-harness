---
phase: 06-e2e-integration
plan: 01
subsystem: harness
tags: [integration, mcp, web-server, unified-entry-point]

# Dependency graph
requires:
  - phase: 03-mcp-server
    provides: GsdMcpServer class for Claude Code integration
  - phase: 04-web-dashboard
    provides: HarnessServer with WebSocket event streaming
  - phase: 05-gsd-integration
    provides: Complete MCP toolset for session orchestration
provides:
  - @gsd/harness package as unified entry point
  - Shared PersistentSessionManager between MCP and web servers
  - npm scripts for harness startup (harness:start, harness:dev, dashboard:dev)
  - MCP configuration example for Claude Code
affects: [e2e-testing, production-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Unified entry point with shared state
    - Graceful shutdown coordination between services
    - Logging to stderr to preserve MCP stdout channel

key-files:
  created:
    - packages/harness/package.json
    - packages/harness/tsconfig.json
    - packages/harness/src/index.ts
    - mcp-config.json.example
  modified:
    - package.json (added harness scripts)
    - tsconfig.json (added harness project reference)
    - packages/web-server/src/harness-server.ts (bug fix)

key-decisions:
  - 'Single PersistentSessionManager shared between MCP server and web dashboard'
  - 'Web server starts before MCP server to ensure dashboard availability'
  - 'All logging to stderr to preserve MCP JSON-RPC on stdout'
  - 'GSD_HARNESS_PORT environment variable for port configuration'

patterns-established:
  - 'Unified entry point pattern for multi-service harness'
  - 'Signal handler coordination for graceful multi-service shutdown'

issues-created: []

# Metrics
duration: 12min
completed: 2026-01-11
---

# Phase 6 Plan 1: Component Integration Summary

**Wire MCP server and web dashboard to share a single PersistentSessionManager instance for unified orchestration**

## Performance

- **Duration:** 12 min
- **Started:** 2026-01-11T22:25:00Z
- **Completed:** 2026-01-11T22:37:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Created @gsd/harness package as unified entry point
- Single PersistentSessionManager shared between MCP server and web dashboard
- HarnessServer (web + WebSocket) starts on port 3333
- GsdMcpServer connects via stdio for Claude Code integration
- Graceful shutdown handling for both servers
- npm scripts for easy startup (harness:start, harness:dev, dashboard:dev)
- MCP configuration example for Claude Code integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Create unified harness entry point** - `39738c5` (feat)
2. **Task 2: Add root npm scripts for harness operation** - `ddd1dac` (feat)
3. **Task 3: Add MCP server configuration example** - `d11e7c6` (docs)

## Bug Fix

During verification, discovered a race condition in HarnessServer where WebSocket plugin registration was not being awaited before starting the server:

- **Bug fix: Await WebSocket registration** - `13f289d` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/harness/package.json` - Package configuration with bin entry
- `packages/harness/tsconfig.json` - TypeScript config with project references
- `packages/harness/src/index.ts` - Unified entry point starting both servers
- `package.json` - Added harness:start, harness:dev, dashboard:dev scripts
- `tsconfig.json` - Added harness to project references
- `mcp-config.json.example` - Example MCP configuration for Claude Code
- `packages/web-server/src/harness-server.ts` - Fixed async WebSocket registration

## Decisions Made

- All logging goes to stderr to preserve stdout for MCP JSON-RPC communication
- Web server starts first to ensure dashboard is available before MCP ready message
- Port configurable via GSD_HARNESS_PORT environment variable (default: 3333)
- Graceful shutdown stops web server first, then MCP server

## Deviations from Plan

One deviation per Rule 1 (auto-fix bugs):

- Fixed race condition in HarnessServer where WebSocket plugin was not fully registered before start()

## Issues Encountered

- WebSocket plugin registration was using `void` to ignore the promise, causing race condition
- Fixed by moving registration to start() method and properly awaiting

## Verification Results

All checks passed:

- [x] `pnpm install` succeeds
- [x] `pnpm build` builds all packages including harness
- [x] `pnpm harness:start` launches without error
- [x] http://localhost:3333/health responds with `{"status":"ok"}`
- [x] http://localhost:3333/api/sessions responds with `[]`
- [x] MCP server ready on stdio

## Next Phase Readiness

- Component integration complete, ready for E2E testing
- Harness usage pattern:

  ```bash
  # Production-like
  pnpm harness:start

  # Development
  pnpm harness:dev

  # Dashboard development (separate)
  pnpm dashboard:dev
  ```

- MCP configuration for Claude Code:

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

---

_Phase: 06-e2e-integration_
_Completed: 2026-01-11_
