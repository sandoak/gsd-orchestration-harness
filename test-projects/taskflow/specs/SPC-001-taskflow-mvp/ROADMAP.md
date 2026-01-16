---
version: 1
project: taskflow
milestone: mvp

current_phase: 2
current_plan: 3
status: executing

total_phases: 4
completed_phases: 2
total_plans: 10
completed_plans: 6

spec_dir: specs/SPC-001-taskflow-mvp
spec_id: SPC-001
---

# TaskFlow MVP Roadmap

## Overview

This roadmap defines the execution plan for building the TaskFlow MVP. The project is structured to exercise harness orchestration features including parallel execution, credential lookup, and multi-level verification.

## Phase Summary

| Phase | Name               | Plans | Dependencies              | Verification             |
| ----- | ------------------ | ----- | ------------------------- | ------------------------ |
| 1     | Project Foundation | 3     | -                         | build_succeeds           |
| 2     | Backend API        | 3     | Phase 1                   | tests_pass, api_response |
| 3     | Frontend UI        | 3     | Phase 1 (partial Phase 2) | build_succeeds           |
| 4     | Integration & E2E  | 1     | Phases 2, 3               | playwright               |

## Phase 1: Project Foundation

**Goal**: Monorepo structure with both packages initialized
**Plan Directory**: `planning/plans/01-foundation/`

### Plans

| Plan  | Name              | Depends On | Wave | Files Modified    |
| ----- | ----------------- | ---------- | ---- | ----------------- |
| 01-01 | Monorepo setup    | -          | 1    | root config files |
| 01-02 | Backend scaffold  | 01-01      | 2    | packages/api/\*   |
| 01-03 | Frontend scaffold | 01-01      | 2    | packages/web/\*   |

- [x] 01-01-PLAN.md: Monorepo setup
- [x] 01-02-PLAN.md: Backend scaffold
- [x] 01-03-PLAN.md: Frontend scaffold

### Parallelization

- 01-02 and 01-03 can run in parallel after 01-01

### Verification

```yaml
type: build_succeeds
packages:
  - packages/api
  - packages/web
```

---

## Phase 2: Backend API

**Goal**: Working REST API with SQLite database
**Plan Directory**: `planning/plans/02-backend-api/`

### Plans

| Plan  | Name           | Depends On | Wave | Files Modified             |
| ----- | -------------- | ---------- | ---- | -------------------------- |
| 02-01 | Database layer | 01-02      | 1    | packages/api/src/db/\*     |
| 02-02 | Task endpoints | 02-01      | 2    | packages/api/src/routes/\* |
| 02-03 | API tests      | 02-01      | 2    | packages/api/tests/\*      |

- [x] 02-01-PLAN.md: Database layer (credentials_needed: sqlite)
- [x] 02-02-PLAN.md: Task endpoints
- [x] 02-03-PLAN.md: API tests

### Credentials

Plan 02-01 will request `sqlite` credentials to test the credential flow.

### Parallelization

- 02-02 and 02-03 can run in parallel after 02-01

### Verification

```yaml
type: tests_pass
package: packages/api
command: pnpm test
```

---

## Phase 3: Frontend UI

**Goal**: React UI that can manage tasks
**Plan Directory**: `planning/plans/03-frontend-ui/`

### Plans

| Plan  | Name                | Depends On          | Wave | Files Modified                         |
| ----- | ------------------- | ------------------- | ---- | -------------------------------------- |
| 03-01 | Task list component | 01-03               | 1    | packages/web/src/components/TaskList\* |
| 03-02 | Task form component | 01-03               | 1    | packages/web/src/components/TaskForm\* |
| 03-03 | API integration     | 03-01, 03-02, 02-02 | 2    | packages/web/src/api/\*                |

- [ ] 03-01-PLAN.md: Task list component
- [ ] 03-02-PLAN.md: Task form component
- [ ] 03-03-PLAN.md: API integration

### Cross-Phase Parallelization

- 03-01 and 03-02 can run in parallel with Phase 2 work (no file conflicts)
- Maximum parallelism point: 02-01, 03-01, and 03-02 can run simultaneously

### Verification

```yaml
type: build_succeeds
package: packages/web
command: pnpm build
```

---

## Phase 4: Integration & E2E

**Goal**: Full integration verified with Playwright
**Plan Directory**: `planning/plans/04-integration/`

### Plans

| Plan  | Name      | Depends On | Wave | Files Modified      |
| ----- | --------- | ---------- | ---- | ------------------- |
| 04-01 | E2E tests | 03-03      | 1    | packages/web/e2e/\* |

- [ ] 04-01-PLAN.md: E2E tests (playwright verification)

### Playwright Verification

```yaml
type: playwright
tests:
  - ui_element_exists: Task list renders
  - ui_form_submit: Can create a task
  - ui_navigation: Can navigate app
```

---

## Dependency Graph

```
01-01 ─┬─> 01-02 ─> 02-01 ─┬─> 02-02 ─┐
       │                   │          │
       │                   └─> 02-03  │
       │                              │
       └─> 01-03 ─┬─> 03-01 ─┐       │
                  │          ├─> 03-03 ─> 04-01
                  └─> 03-02 ─┘
```

## Execution Notes

1. **Parallelism**: The harness should detect when plans can run in parallel based on `depends_on` and `files_modified`
2. **Credentials**: The `sqlite` credential request in 02-01 tests the credential flow
3. **Verification**: Each phase has its own verification, plus individual plan verifications
4. **Progress**: ROADMAP frontmatter is updated after each plan completion
