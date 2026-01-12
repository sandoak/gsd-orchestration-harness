import { SessionPanel } from './components/SessionPanel';
import { useSessionStore } from './store/session-store';
import { useWebSocket } from './store/use-websocket';

function App() {
  useWebSocket();
  const connected = useSessionStore((state) => state.connected);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-900 text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-6 py-4">
        <h1 className="text-xl font-semibold">GSD Session Harness</h1>
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-sm text-slate-400">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>
      <main className="min-h-0 flex-1 p-6">
        <SessionPanel />
      </main>
    </div>
  );
}

export default App;
