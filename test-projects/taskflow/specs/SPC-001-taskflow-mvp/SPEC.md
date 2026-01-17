# SPC-001: TaskFlow MVP

## Overview

TaskFlow is a minimal task management application designed to test and validate the GSD Orchestration Harness. It exercises worker protocols, credential lookups, verification systems, and dependency-graph parallelization.

## Goals

1. Create a working full-stack task management app
2. Exercise all harness orchestration features
3. Validate parallel execution with dependency graphs
4. Test credential flow with database connection

## Tech Stack

- **Backend**: Express.js + SQLite
- **Frontend**: React + Vite
- **Monorepo**: pnpm workspaces
- **Shared**: TypeScript types package

## Features

### Core Features

- View list of tasks
- Create new tasks
- Mark tasks complete
- Delete tasks

### API Endpoints

- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create a task
- `PATCH /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task

### Data Model

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## Success Criteria

1. Backend API responds correctly to all endpoints
2. Frontend renders task list and form
3. Full E2E flow works (create, view, complete, delete)
4. All tests pass
5. Build succeeds for all packages
