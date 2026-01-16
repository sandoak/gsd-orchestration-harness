import { TaskForm, TaskList } from './components';
import { useTasks } from './hooks';
import './App.css';

function App() {
  const { tasks, loading, error, creating, createTask, toggleTask, deleteTask } = useTasks();

  return (
    <div className="app">
      <header className="app-header">
        <h1>TaskFlow</h1>
        <p>A minimal task management app</p>
      </header>
      <main className="app-main">
        <section className="form-section">
          <TaskForm onSubmit={createTask} submitting={creating} />
        </section>
        <section className="list-section">
          <TaskList
            tasks={tasks}
            loading={loading}
            error={error}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
