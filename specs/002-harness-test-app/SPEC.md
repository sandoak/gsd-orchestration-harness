# SPC-002: Harness Test App

## Goal

Create a small full-stack application to test and validate the harness orchestration system built in SPC-001. The app should exercise:

1. **Worker message protocol** - `harness_worker_report`, `harness_worker_await`
2. **Credential lookup** - `credentials_needed` for database connection
3. **Verification system** - Auto verifications (tests_pass, build_succeeds) + Playwright (UI checks)
4. **Dependency-graph parallelization** - Plans with `depends_on` that enable parallel execution
5. **Two-level verification** - Plan-level + Phase-level verification gates

## App Description: TaskFlow

A minimal task management app with:

- **Backend**: Express + SQLite (simple, portable, tests credential flow)
- **Frontend**: React + Vite (modern stack, tests Playwright verification)
- **Monorepo**: pnpm workspace (mirrors harness structure)

## Project Location

```
test-projects/
  taskflow/
    specs/
      SPC-001-taskflow-mvp/
        SPEC.md
        STATUS.md
        ROADMAP.md
        planning/
          ...
    packages/
      api/           # Express backend
      web/           # React frontend
      shared/        # Shared types
```

## Phase Structure (4 Phases, 10 Plans)

### Phase 1: Project Foundation

**Goal**: Monorepo structure with both packages initialized

| Plan  | Name              | Depends On | Files Modified    | Parallelizable |
| ----- | ----------------- | ---------- | ----------------- | -------------- |
| 01-01 | Monorepo setup    | -          | root config files | Yes (first)    |
| 01-02 | Backend scaffold  | 01-01      | packages/api/\*   | Yes with 01-03 |
| 01-03 | Frontend scaffold | 01-01      | packages/web/\*   | Yes with 01-02 |

**Verification**: `build_succeeds` for both packages

### Phase 2: Backend API

**Goal**: Working REST API with SQLite database

| Plan  | Name           | Depends On | Files Modified             | Parallelizable |
| ----- | -------------- | ---------- | -------------------------- | -------------- |
| 02-01 | Database layer | 01-02      | packages/api/src/db/\*     | First in phase |
| 02-02 | Task endpoints | 02-01      | packages/api/src/routes/\* | Yes with 02-03 |
| 02-03 | API tests      | 02-01      | packages/api/tests/\*      | Yes with 02-02 |

**Credentials Test**: Plan 02-01 will request `sqlite` credentials (even though SQLite is file-based, this tests the credential flow)

**Verification**: `tests_pass`, `api_response` checks

### Phase 3: Frontend UI

**Goal**: React UI that can manage tasks

| Plan  | Name                | Depends On          | Files Modified                         | Parallelizable |
| ----- | ------------------- | ------------------- | -------------------------------------- | -------------- |
| 03-01 | Task list component | 01-03               | packages/web/src/components/TaskList\* | Yes with 03-02 |
| 03-02 | Task form component | 01-03               | packages/web/src/components/TaskForm\* | Yes with 03-01 |
| 03-03 | API integration     | 03-01, 03-02, 02-02 | packages/web/src/api/\*                | After UI + API |

**Note**: 03-01 and 03-02 can run in parallel with Phase 2 work (no file conflicts)

**Verification**: `build_succeeds`, component tests

### Phase 4: Integration & E2E

**Goal**: Full integration verified with Playwright

| Plan  | Name      | Depends On | Files Modified      | Parallelizable |
| ----- | --------- | ---------- | ------------------- | -------------- |
| 04-01 | E2E tests | 03-03      | packages/web/e2e/\* | Sequential     |

**Playwright Verification**:

- `ui_element_exists`: Task list renders
- `ui_form_submit`: Can create a task
- `ui_navigation`: Can navigate app

---

## Dependency Graph Visualization

```
Phase 1: Foundation
┌─────────┐
│ 01-01   │ Monorepo setup
└────┬────┘
     │
     ├──────────────────┐
     ▼                  ▼
┌─────────┐       ┌─────────┐
│ 01-02   │       │ 01-03   │  ← Can run in parallel
│ Backend │       │ Frontend│
└────┬────┘       └────┬────┘
     │                  │
Phase 2: API            Phase 3: UI (partial)
     │                  │
     ▼                  ├──────────────────┐
┌─────────┐            ▼                  ▼
│ 02-01   │       ┌─────────┐       ┌─────────┐
│ Database│       │ 03-01   │       │ 03-02   │  ← All 3 can run in parallel!
└────┬────┘       │TaskList │       │TaskForm │
     │            └────┬────┘       └────┬────┘
     ├──────────┐      │                  │
     ▼          ▼      └────────┬─────────┘
┌─────────┐ ┌─────────┐         │
│ 02-02   │ │ 02-03   │         │
│Endpoints│ │API Tests│  ← Parallel
└────┬────┘ └─────────┘         │
     │                          │
     └──────────────────────────┤
                                ▼
                          ┌─────────┐
                          │ 03-03   │  API integration
                          └────┬────┘
                               │
Phase 4: E2E                   │
                               ▼
                          ┌─────────┐
                          │ 04-01   │  E2E tests
                          └─────────┘
```

**Maximum parallelism**: At one point, 02-01, 03-01, and 03-02 can all run simultaneously (different file sets).

---

## Harness Features Exercised

| Feature                 | How It's Tested                                                   |
| ----------------------- | ----------------------------------------------------------------- |
| Worker protocol         | All plans use `harness_worker_report` for status                  |
| Credential lookup       | 02-01 requests `sqlite` credentials                               |
| Auto verification       | `tests_pass`, `build_succeeds`, `file_exists`                     |
| Playwright verification | 04-01 uses `ui_element_exists`, `ui_form_submit`                  |
| Dependency graph        | Plans declare `depends_on`, harness calculates parallel execution |
| File conflict detection | No overlapping `files_modified` → parallel execution allowed      |
| Two-level verification  | Each plan verified, then phase verified                           |
| Progress tracking       | ROADMAP.md frontmatter updated after each plan                    |

---

## Test Project Structure

```
test-projects/
  taskflow/
    package.json             # Monorepo root
    pnpm-workspace.yaml
    packages/
      api/
        package.json
        tsconfig.json
        src/
          index.ts           # Express server
          db/
            connection.ts    # SQLite connection (credentials test)
            schema.ts        # Task table
          routes/
            tasks.ts         # CRUD endpoints
        tests/
          tasks.test.ts
      web/
        package.json
        vite.config.ts
        src/
          App.tsx
          components/
            TaskList.tsx
            TaskForm.tsx
          api/
            tasks.ts         # API client
        e2e/
          tasks.spec.ts      # Playwright tests
      shared/
        package.json
        src/
          types.ts           # Task interface
```

---

## Verification Checklist

After execution, verify:

- [ ] Worker messages were sent via `harness_worker_report`
- [ ] Credential request was made for 02-01 (even if mocked)
- [ ] Auto verifications ran (tests_pass, build_succeeds)
- [ ] Playwright verifications ran (if available)
- [ ] Parallel execution occurred where dependency graph allowed
- [ ] ROADMAP.md frontmatter was updated
- [ ] `.orchestration/` directory tracked session state
- [ ] Atomic commits were created per task

---

## Notes

- **SQLite credentials**: Even though SQLite is file-based, we'll have 02-01 request credentials to test the `credentials_needed` → `credentials_provided` flow. The credential provider can return a mock/placeholder.

- **Playwright**: If Playwright MCP is not configured, those verifications can be skipped or run manually.

- **Scope**: This is intentionally small. The goal is to validate the harness, not build a production app.
