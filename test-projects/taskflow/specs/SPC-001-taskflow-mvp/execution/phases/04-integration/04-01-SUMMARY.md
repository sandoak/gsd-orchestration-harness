---
phase: 04-integration
plan: 01
subsystem: e2e-testing
tags: [playwright, e2e, testing, chromium, web-server]
dependency-graph:
  requires: [03-03]
  provides: [e2e-test-suite, playwright-config, automated-testing]
  affects: []
tech-stack:
  added: []
  patterns: [page-object-like-selectors, e2e-test-organization, web-server-auto-start]
key-files:
  created:
    - packages/web/playwright.config.ts
    - packages/web/e2e/tasks.spec.ts
  modified: []
decisions:
  - decision: Use Playwright for E2E testing
    rationale: Modern, fast, excellent TypeScript support, auto-wait features
  - decision: Configure dual web servers (API + frontend)
    rationale: Tests need both services running for full integration testing
  - decision: Use data-testid selectors for stable element selection
    rationale: Decouples tests from CSS/layout changes
metrics:
  duration: 2m10s
  completed: 2026-01-16
---

# Phase 04 Plan 01: E2E Tests Summary

Playwright E2E test suite validating complete task management user flow with auto-starting backend and frontend servers.

## What Was Built

### 1. Playwright Configuration (`packages/web/playwright.config.ts`)

- Test directory set to `./e2e`
- Parallel test execution enabled
- CI-aware configuration (retries, single worker)
- HTML reporter for test results
- Chromium browser project configured
- Dual web server auto-start:
  - API server at `http://localhost:3001/api/health`
  - Frontend at `http://localhost:3000`

### 2. E2E Test Suite (`packages/web/e2e/tasks.spec.ts`)

Test coverage for complete user flow:

**Page Load Tests:**

- App header displays "TaskFlow"
- Task form is visible on load

**Task Creation Tests:**

- Create a new task with title and description
- Form clears after successful submission

**Task Management Tests:**

- Toggle task completion status (checkbox, class change)
- Delete a task (removes from list)

## Commits

| Task | Description              | Commit  | Files                |
| ---- | ------------------------ | ------- | -------------------- |
| 1    | Create Playwright config | f2f45c2 | playwright.config.ts |
| 2    | Create E2E test suite    | 0e6d53c | e2e/tasks.spec.ts    |

## Key Implementation Details

### Web Server Auto-Start Pattern

```typescript
webServer: [
  {
    command: 'pnpm --filter @taskflow/api dev',
    url: 'http://localhost:3001/api/health',
    reuseExistingServer: !process.env.CI,
    cwd: '../..',
  },
  {
    command: 'pnpm --filter @taskflow/web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    cwd: '../..',
  },
],
```

### Test Organization Pattern

```typescript
test.describe('TaskFlow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Page Load', () => { ... });
  test.describe('Task Creation', () => { ... });
  test.describe('Task Management', () => { ... });
});
```

## Deviations from Plan

None - plan executed exactly as written.

Note: Task 1 (Playwright configuration) was already committed prior to this execution (f2f45c2).

## Verification Results

- [x] playwright.config.ts exists with webServer config
- [x] e2e/tasks.spec.ts exists with test scenarios
- [x] 6 individual tests covering full user flow
- [x] Page load tests created
- [x] Task creation tests created
- [x] Task toggle and delete tests created

## Phase Completion

**Phase 04 Complete**

This is the final phase of the TaskFlow MVP. The complete stack is now:

- Monorepo with pnpm workspaces
- Express backend with SQLite database
- React frontend with TypeScript
- Full API integration with optimistic updates
- E2E test suite with Playwright
