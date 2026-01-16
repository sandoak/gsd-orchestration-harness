import type { ReactElement } from 'react';

import './App.css';

function App(): ReactElement {
  return (
    <div className="app">
      <header className="app-header">
        <h1>TaskFlow</h1>
        <p>Your personal task management system</p>
      </header>
      <main className="app-main">
        <p>Welcome to TaskFlow. Task management features coming soon.</p>
      </main>
    </div>
  );
}

export default App;
