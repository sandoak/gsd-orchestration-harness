import type { Task } from '@taskflow/shared';
import './TaskItem.css';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

export function TaskItem({ task, onToggle, onDelete }: TaskItemProps) {
  return (
    <div className={`task-item ${task.completed ? 'completed' : ''}`} data-testid="task-item">
      <div className="task-checkbox">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggle(task.id, !task.completed)}
          aria-label={`Mark "${task.title}" as ${task.completed ? 'incomplete' : 'complete'}`}
        />
      </div>
      <div className="task-content">
        <h3 className="task-title">{task.title}</h3>
        {task.description && <p className="task-description">{task.description}</p>}
        <span className="task-date">Created: {new Date(task.createdAt).toLocaleDateString()}</span>
      </div>
      <button
        className="task-delete"
        onClick={() => onDelete(task.id)}
        aria-label={`Delete "${task.title}"`}
      >
        Delete
      </button>
    </div>
  );
}
