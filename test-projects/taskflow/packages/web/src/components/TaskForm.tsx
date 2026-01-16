import type { CreateTaskInput } from '@taskflow/shared';
import { useState, FormEvent } from 'react';

import './TaskForm.css';

interface TaskFormProps {
  onSubmit: (task: CreateTaskInput) => Promise<void>;
  submitting?: boolean;
}

export function TaskForm({ onSubmit, submitting = false }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required');
      return;
    }

    try {
      await onSubmit({
        title: trimmedTitle,
        description: description.trim() || undefined,
      });
      setTitle('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  return (
    <form className="task-form" onSubmit={handleSubmit} data-testid="task-form">
      <h2>Create New Task</h2>
      {error && (
        <div className="task-form-error" role="alert">
          {error}
        </div>
      )}
      <div className="form-group">
        <label htmlFor="task-title">Title *</label>
        <input
          id="task-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          disabled={submitting}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="task-description">Description (optional)</label>
        <textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add more details..."
          disabled={submitting}
          rows={3}
        />
      </div>
      <button type="submit" className="submit-button" disabled={submitting || !title.trim()}>
        {submitting ? 'Creating...' : 'Create Task'}
      </button>
    </form>
  );
}
