import type { Task, CreateTaskInput } from '@taskflow/shared';
import { useState, useEffect, useCallback } from 'react';

import { tasksApi } from '../api';

interface UseTasksReturn {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  creating: boolean;
  refresh: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<void>;
  toggleTask: (id: string, completed: boolean) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

export function useTasks(): UseTasksReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await tasksApi.getAll();
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  const createTask = useCallback(async (input: CreateTaskInput) => {
    try {
      setCreating(true);
      const newTask = await tasksApi.create(input);
      setTasks((prev) => [newTask, ...prev]);
    } finally {
      setCreating(false);
    }
  }, []);

  const toggleTask = useCallback(async (id: string, completed: boolean) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed } : t)));
    try {
      await tasksApi.update(id, { completed });
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t)));
    }
  }, []);

  const deleteTask = useCallback(
    async (id: string) => {
      const taskToDelete = tasks.find((t) => t.id === id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      try {
        await tasksApi.delete(id);
      } catch {
        if (taskToDelete) setTasks((prev) => [...prev, taskToDelete]);
      }
    },
    [tasks]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tasks, loading, error, creating, refresh, createTask, toggleTask, deleteTask };
}
