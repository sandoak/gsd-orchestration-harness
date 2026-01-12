import type { Session, SessionStatus } from '../types';

interface SessionSlotProps {
  slot: 1 | 2 | 3;
  session: Session | undefined;
}

const statusColors: Record<SessionStatus, { bg: string; text: string; label: string }> = {
  idle: { bg: 'bg-slate-600', text: 'text-slate-300', label: 'Idle' },
  running: { bg: 'bg-green-600', text: 'text-green-100', label: 'Running' },
  waiting_checkpoint: { bg: 'bg-yellow-600', text: 'text-yellow-100', label: 'Checkpoint' },
  completed: { bg: 'bg-blue-600', text: 'text-blue-100', label: 'Completed' },
  failed: { bg: 'bg-red-600', text: 'text-red-100', label: 'Failed' },
};

export function SessionSlot({ slot, session }: SessionSlotProps) {
  if (!session) {
    return (
      <div className="flex flex-col rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-400">Slot {slot}</span>
          <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400">Empty</span>
        </div>
        <div className="flex flex-1 items-center justify-center text-slate-500">
          <span className="text-sm">No active session</span>
        </div>
        {/* Reserve space for terminal (added in 04-03) */}
        <div className="mt-4 h-48 rounded bg-slate-900/50" />
      </div>
    );
  }

  const status = statusColors[session.status];

  return (
    <div className="flex flex-col rounded-lg border border-slate-600 bg-slate-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">Slot {slot}</span>
        <span className={`rounded px-2 py-0.5 text-xs ${status.bg} ${status.text}`}>
          {status.label}
        </span>
      </div>
      <div className="mb-2 truncate text-xs text-slate-400" title={session.workingDir}>
        {session.workingDir}
      </div>
      {session.currentCommand && (
        <div className="mb-2 truncate text-xs text-slate-500" title={session.currentCommand}>
          $ {session.currentCommand}
        </div>
      )}
      {/* Reserve space for terminal (added in 04-03) */}
      <div className="mt-auto h-48 rounded bg-slate-900" />
    </div>
  );
}
