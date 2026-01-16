import type { Task, CreateTaskInput, UpdateTaskInput, ApiResponse } from '@taskflow/shared';

const API_BASE = '/api';

// eslint-disable-next-line no-undef
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export const tasksApi = {
  async getAll(): Promise<Task[]> {
    const response = await fetch(`${API_BASE}/tasks`);
    const data = await handleResponse<ApiResponse<Task[]>>(response);
    return data.data;
  },

  async create(input: CreateTaskInput): Promise<Task> {
    const response = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await handleResponse<ApiResponse<Task>>(response);
    return data.data;
  },

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const response = await fetch(`${API_BASE}/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await handleResponse<ApiResponse<Task>>(response);
    return data.data;
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' });
    await handleResponse<ApiResponse<{ deleted: boolean }>>(response);
  },
};
