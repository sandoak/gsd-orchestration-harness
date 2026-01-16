import type { Task, CreateTaskInput, UpdateTaskInput, ApiResponse } from '@taskflow/shared';
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { db } from '../db/index.js';

const router: RouterType = Router();

// GET /api/tasks - List all tasks
router.get('/', (_req: Request, res: Response<ApiResponse<Task[]>>) => {
  try {
    const tasks = db
      .prepare(
        `
      SELECT id, title, description, completed,
             created_at as createdAt, updated_at as updatedAt
      FROM tasks ORDER BY created_at DESC
    `
      )
      .all() as Task[];

    const formattedTasks = tasks.map((task) => ({
      ...task,
      completed: Boolean(task.completed),
    }));

    res.json({ data: formattedTasks });
  } catch {
    res.status(500).json({ data: [], error: 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/:id - Get single task
router.get('/:id', (req: Request<{ id: string }>, res: Response<ApiResponse<Task | null>>) => {
  try {
    const { id } = req.params;
    const task = db
      .prepare(
        `
      SELECT id, title, description, completed,
             created_at as createdAt, updated_at as updatedAt
      FROM tasks WHERE id = ?
    `
      )
      .get(id) as Task | undefined;

    if (!task) {
      res.status(404).json({ data: null, error: 'Task not found' });
      return;
    }

    res.json({
      data: {
        ...task,
        completed: Boolean(task.completed),
      },
    });
  } catch {
    res.status(500).json({ data: null, error: 'Failed to fetch task' });
  }
});

// POST /api/tasks - Create task
router.post(
  '/',
  (req: Request<object, object, CreateTaskInput>, res: Response<ApiResponse<Task>>) => {
    try {
      const { title, description } = req.body;

      if (!title || typeof title !== 'string' || title.trim() === '') {
        res.status(400).json({ data: null as unknown as Task, error: 'Title is required' });
        return;
      }

      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(
        `
      INSERT INTO tasks (id, title, description, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      ).run(id, title.trim(), description || null, 0, now, now);

      const newTask: Task = {
        id,
        title: title.trim(),
        description: description || undefined,
        completed: false,
        createdAt: now,
        updatedAt: now,
      };

      res.status(201).json({ data: newTask });
    } catch {
      res.status(500).json({ data: null as unknown as Task, error: 'Failed to create task' });
    }
  }
);

// PATCH /api/tasks/:id - Update task
router.patch(
  '/:id',
  (
    req: Request<{ id: string }, object, UpdateTaskInput>,
    res: Response<ApiResponse<Task | null>>
  ) => {
    try {
      const { id } = req.params;
      const { title, description, completed } = req.body;

      // Check if task exists
      const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ data: null, error: 'Task not found' });
        return;
      }

      // Build update query dynamically
      const updates: string[] = [];
      const values: (string | number | null)[] = [];

      if (title !== undefined) {
        if (typeof title !== 'string' || title.trim() === '') {
          res.status(400).json({ data: null, error: 'Title cannot be empty' });
          return;
        }
        updates.push('title = ?');
        values.push(title.trim());
      }

      if (description !== undefined) {
        updates.push('description = ?');
        values.push(description || null);
      }

      if (completed !== undefined) {
        updates.push('completed = ?');
        values.push(completed ? 1 : 0);
      }

      if (updates.length === 0) {
        res.status(400).json({ data: null, error: 'No valid fields to update' });
        return;
      }

      const now = new Date().toISOString();
      updates.push('updated_at = ?');
      values.push(now);
      values.push(id);

      db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      // Fetch updated task
      const updatedTask = db
        .prepare(
          `
      SELECT id, title, description, completed,
             created_at as createdAt, updated_at as updatedAt
      FROM tasks WHERE id = ?
    `
        )
        .get(id) as Task;

      res.json({
        data: {
          ...updatedTask,
          completed: Boolean(updatedTask.completed),
        },
      });
    } catch {
      res.status(500).json({ data: null, error: 'Failed to update task' });
    }
  }
);

// DELETE /api/tasks/:id - Delete task
router.delete(
  '/:id',
  (req: Request<{ id: string }>, res: Response<ApiResponse<{ deleted: boolean }>>) => {
    try {
      const { id } = req.params;

      const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

      if (result.changes === 0) {
        res.status(404).json({ data: { deleted: false }, error: 'Task not found' });
        return;
      }

      res.json({ data: { deleted: true } });
    } catch {
      res.status(500).json({ data: { deleted: false }, error: 'Failed to delete task' });
    }
  }
);

export default router;
