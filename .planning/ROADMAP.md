# Roadmap: GSD Session Harness

## Overview

Building a harness that enables Claude Code to orchestrate multiple GSD sessions in parallel. The journey goes from monorepo foundation, through session management and MCP tools, to a real-time dashboard, culminating in full GSD workflow integration with automated checkpoint handling.

## Domain Expertise

- ./.claude/skills/expertise/typescript-nodejs/SKILL.md (if exists)
- ./.claude/skills/expertise/mcp-development/SKILL.md (if exists)

Or: None (using established patterns)

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Core Types** - Monorepo setup with shared types and build configuration (2/2 plans)
- [x] **Phase 2: Session Management** - Claude CLI process spawning with output capture and persistence (3/3 plans)
- [x] **Phase 3: MCP Server** - 6 tools for session control via stdio transport (3/3 plans)
- [x] **Phase 4: Web Dashboard** - Real-time terminal dashboard with xterm.js (3/3 plans)
- [x] **Phase 5: GSD Integration** - State parsing and checkpoint automation (3/3 plans)
- [ ] **Phase 6: E2E Integration** - Wire components, testing, and polish

## Phase Details

### Phase 1: Foundation & Core Types

**Goal**: Establish pnpm monorepo with shared types, TypeScript strict mode, and build tooling
**Depends on**: Nothing (first phase)
**Research**: Unlikely (established patterns)
**Plans**: TBD

Plans:

- [x] 01-01: Monorepo scaffolding and workspace configuration (2026-01-12)
- [x] 01-02: Shared types package with core interfaces (2026-01-12)

### Phase 2: Session Management

**Goal**: Spawn and manage Claude CLI processes with output capture and SQLite persistence
**Depends on**: Phase 1
**Research**: Unlikely (node:child_process patterns)
**Plans**: TBD

Plans:

- [x] 02-01: Claude process spawning and lifecycle management (2026-01-12)
- [x] 02-02: SQLite persistence with better-sqlite3 (2026-01-12)
- [x] 02-03: Session recovery after harness restart (2026-01-12)

### Phase 3: MCP Server

**Goal**: Implement 6 MCP tools for session control using @modelcontextprotocol/sdk
**Depends on**: Phase 2
**Research**: Unlikely (MCP SDK documented)
**Plans**: TBD

Plans:

- [x] 03-01: MCP server setup with stdio transport (2026-01-12)
- [x] 03-02: Session control tools (start, list, end) (2026-01-12)
- [x] 03-03: State and checkpoint tools (get_output, get_state, get_checkpoint) (2026-01-12)

### Phase 4: Web Dashboard

**Goal**: Real-time dashboard with terminal emulation for session monitoring
**Depends on**: Phase 2
**Research**: Unlikely (xterm.js well-documented)
**Plans**: TBD

Plans:

- [x] 04-01: Fastify HTTP + WebSocket server (2026-01-12)
- [x] 04-02: React + Vite dashboard with Zustand (2026-01-12)
- [x] 04-03: xterm.js terminal integration with ANSI support (2026-01-12)

### Phase 5: GSD Integration

**Goal**: Parse GSD state files and automate checkpoint handling
**Depends on**: Phase 3, Phase 4
**Research**: Likely (checkpoint XML format, Playwright verification)
**Research topics**: Checkpoint XML structure, Playwright for verification automation
**Plans**: TBD

Plans:

- [x] 05-01: GSD state parser (STATE.md, ROADMAP.md, PLAN.md) (2026-01-12)
- [x] 05-02: Checkpoint detection and classification (2026-01-12)
- [x] 05-03: Checkpoint response relay via MCP tool (2026-01-12)

### Phase 6: E2E Integration

**Goal**: Wire all components together with comprehensive testing
**Depends on**: All previous phases
**Research**: Unlikely (internal integration)
**Plans**: TBD

Plans:

- [x] 06-01: Component integration and wiring (2026-01-11)
- [x] 06-02: End-to-end workflow testing (2026-01-12)
- [ ] 06-03: Documentation and usage examples

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase                 | Plans Complete | Status      | Completed  |
| --------------------- | -------------- | ----------- | ---------- |
| 1. Foundation         | 2/2            | Complete    | 2026-01-12 |
| 2. Session Management | 3/3            | Complete    | 2026-01-12 |
| 3. MCP Server         | 3/3            | Complete    | 2026-01-12 |
| 4. Web Dashboard      | 3/3            | Complete    | 2026-01-12 |
| 5. GSD Integration    | 3/3            | Complete    | 2026-01-12 |
| 6. E2E Integration    | 2/3            | In progress | -          |

---

_Created: 2026-01-11_
