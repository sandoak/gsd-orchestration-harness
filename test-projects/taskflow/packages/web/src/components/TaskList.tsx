import type { Task } from '@taskflow/shared';

import { TaskItem } from './TaskItem';
import './TaskList.css';

interface TaskListProps {
  tasks: Task[];
  loading?: boolean;
  error?: string | null;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

export function TaskList({ tasks, loading, error, onToggle, onDelete }: TaskListProps) {
  if (loading) {
    return (
      <div className="task-list-loading" data-testid="task-list-loading">
        Loading tasks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="task-list-error" data-testid="task-list-error">
        Error: {error}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="task-list-empty" data-testid="task-list-empty">
        No tasks yet. Create one!
      </div>
    );
  }

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  return (
    <div className="task-list" data-testid="task-list">
      {incompleteTasks.length > 0 && (
        <section className="task-section">
          <h2>To Do ({incompleteTasks.length})</h2>
          <div className="task-items">
            {incompleteTasks.map((task) => (
              <TaskItem key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </div>
        </section>
      )}
      {completedTasks.length > 0 && (
        <section className="task-section completed-section">
          <h2>Completed ({completedTasks.length})</h2>
          <div className="task-items">
            {completedTasks.map((task) => (
              <TaskItem key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
