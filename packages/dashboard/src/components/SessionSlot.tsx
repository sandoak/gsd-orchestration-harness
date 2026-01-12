import type { Session, SessionStatus } from '../types';

import { Terminal } from './Terminal';

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
  const isWaitingCheckpoint = session?.status === 'waiting_checkpoint';

  if (!session) {
    return (
      <div className="flex h-full min-h-[200px] flex-col overflow-hidden rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 p-4">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <span className="text-sm font-medium text-slate-400">Slot {slot}</span>
          <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400">Empty</span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center rounded bg-slate-900/50 text-slate-500">
          <span className="text-sm">No active session</span>
        </div>
      </div>
    );
  }

  const status = statusColors[session.status];

  return (
    <div
      className={`flex h-full min-h-[200px] flex-col overflow-hidden rounded-lg border bg-slate-800 p-4 ${
        isWaitingCheckpoint ? 'border-2 border-yellow-500' : 'border-slate-600'
      }`}
    >
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <span className="text-sm font-medium text-slate-300">Slot {slot}</span>
        <div className="flex items-center gap-2">
          {isWaitingCheckpoint && (
            <span className="animate-pulse rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
              Waiting for checkpoint
            </span>
          )}
          <span className={`rounded px-2 py-0.5 text-xs ${status.bg} ${status.text}`}>
            {status.label}
          </span>
        </div>
      </div>
      <div className="mb-2 shrink-0 truncate text-xs text-slate-400" title={session.workingDir}>
        {session.workingDir}
      </div>
      {session.currentCommand && (
        <div
          className="mb-2 shrink-0 truncate text-xs text-slate-500"
          title={session.currentCommand}
        >
          $ {session.currentCommand}
        </div>
      )}
      {/* Terminal takes remaining height */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Terminal sessionId={session.id} className="h-full" />
      </div>
    </div>
  );
}
