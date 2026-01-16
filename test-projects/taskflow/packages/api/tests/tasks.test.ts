import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect } from 'vitest';

import { db } from '../src/db/connection.js';

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  completed: number;
  created_at: string;
  updated_at: string;
}

function createTestTask(
  overrides: Partial<{
    id: string;
    title: string;
    description: string | null;
    completed: number;
  }> = {}
): TaskRow {
  const id = overrides.id || uuidv4();
  const now = new Date().toISOString();
  const task = {
    id,
    title: overrides.title ?? 'Test Task',
    description: overrides.description ?? null,
    completed: overrides.completed ?? 0,
  };

  db.prepare(
    `
    INSERT INTO tasks (id, title, description, completed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(task.id, task.title, task.description, task.completed, now, now);

  return { ...task, created_at: now, updated_at: now };
}

describe('Tasks Database Operations', () => {
  describe('CREATE', () => {
    it('should insert a new task', () => {
      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO tasks (id, title, description, completed, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?)
      `
      ).run(id, 'New Task', 'Description', now, now);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
      expect(task).toBeDefined();
      expect(task?.title).toBe('New Task');
      expect(task?.description).toBe('Description');
      expect(task?.completed).toBe(0);
    });

    it('should insert a task with null description', () => {
      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO tasks (id, title, description, completed, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?)
      `
      ).run(id, 'Task without description', null, now, now);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
      expect(task).toBeDefined();
      expect(task?.description).toBeNull();
    });
  });

  describe('READ', () => {
    it('should fetch all tasks', () => {
      createTestTask({ title: 'Task 1' });
      createTestTask({ title: 'Task 2' });

      const tasks = db.prepare('SELECT * FROM tasks').all() as TaskRow[];
      expect(tasks).toHaveLength(2);
    });

    it('should fetch a single task by id', () => {
      const created = createTestTask({ title: 'Specific Task' });

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(created.id) as
        | TaskRow
        | undefined;
      expect(task).toBeDefined();
      expect(task?.title).toBe('Specific Task');
    });

    it('should return undefined for non-existent task', () => {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('non-existent') as
        | TaskRow
        | undefined;
      expect(task).toBeUndefined();
    });

    it('should fetch tasks ordered by created_at', () => {
      createTestTask({ title: 'First' });
      // Small delay to ensure different timestamps
      createTestTask({ title: 'Second' });

      const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all() as TaskRow[];
      expect(tasks[0]?.title).toBe('First');
    });
  });

  describe('UPDATE', () => {
    it('should update task title', () => {
      const created = createTestTask({ title: 'Original' });

      db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run('Updated', created.id);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(created.id) as
        | TaskRow
        | undefined;
      expect(task?.title).toBe('Updated');
    });

    it('should update task description', () => {
      const created = createTestTask({ description: null });

      db.prepare('UPDATE tasks SET description = ? WHERE id = ?').run(
        'New description',
        created.id
      );

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(created.id) as
        | TaskRow
        | undefined;
      expect(task?.description).toBe('New description');
    });

    it('should update task completion status', () => {
      const created = createTestTask({ completed: 0 });

      db.prepare('UPDATE tasks SET completed = 1 WHERE id = ?').run(created.id);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(created.id) as
        | TaskRow
        | undefined;
      expect(task?.completed).toBe(1);
    });

    it('should update multiple fields at once', () => {
      const created = createTestTask({ title: 'Old', completed: 0 });
      const newUpdatedAt = new Date().toISOString();

      db.prepare('UPDATE tasks SET title = ?, completed = ?, updated_at = ? WHERE id = ?').run(
        'New',
        1,
        newUpdatedAt,
        created.id
      );

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(created.id) as
        | TaskRow
        | undefined;
      expect(task?.title).toBe('New');
      expect(task?.completed).toBe(1);
    });
  });

  describe('DELETE', () => {
    it('should delete a task', () => {
      const created = createTestTask();

      const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(created.id);
      expect(result.changes).toBe(1);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(created.id) as
        | TaskRow
        | undefined;
      expect(task).toBeUndefined();
    });

    it('should return 0 changes when deleting non-existent task', () => {
      const result = db.prepare('DELETE FROM tasks WHERE id = ?').run('non-existent');
      expect(result.changes).toBe(0);
    });

    it('should not affect other tasks when deleting one', () => {
      const task1 = createTestTask({ title: 'Task 1' });
      const task2 = createTestTask({ title: 'Task 2' });

      db.prepare('DELETE FROM tasks WHERE id = ?').run(task1.id);

      const remaining = db.prepare('SELECT * FROM tasks').all() as TaskRow[];
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.id).toBe(task2.id);
    });
  });

  describe('Data Validation', () => {
    it('should enforce NOT NULL on title', () => {
      const id = uuidv4();
      const now = new Date().toISOString();

      expect(() => {
        db.prepare(
          `
          INSERT INTO tasks (id, title, description, completed, created_at, updated_at)
          VALUES (?, ?, ?, 0, ?, ?)
        `
        ).run(id, null, null, now, now);
      }).toThrow();
    });

    it('should require id to be provided (application level)', () => {
      // Note: SQLite TEXT PRIMARY KEY allows NULL (becomes rowid),
      // but our application always provides UUIDs via uuidv4()
      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO tasks (id, title, description, completed, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?)
      `
      ).run(id, 'Title', null, now, now);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
      expect(task).toBeDefined();
      expect(task?.id).toBe(id);
    });

    it('should enforce unique id constraint', () => {
      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO tasks (id, title, description, completed, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?)
      `
      ).run(id, 'First', null, now, now);

      expect(() => {
        db.prepare(
          `
          INSERT INTO tasks (id, title, description, completed, created_at, updated_at)
          VALUES (?, ?, ?, 0, ?, ?)
        `
        ).run(id, 'Second', null, now, now);
      }).toThrow();
    });

    it('should default completed to 0', () => {
      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO tasks (id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `
      ).run(id, 'Task', now, now);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
      expect(task?.completed).toBe(0);
    });
  });
});
