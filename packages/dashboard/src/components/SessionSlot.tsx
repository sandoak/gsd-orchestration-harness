import { useState, useCallback } from 'react';

import { useSessionOutput } from '../hooks/use-session-output';
import type { Session, SessionStatus } from '../types';

import { Terminal } from './Terminal';

/**
 * Strip ANSI escape codes from text for cleaner clipboard output.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

interface SessionSlotProps {
  slot: 1 | 2 | 3 | 4;
  session: Session | undefined;
}

/**
 * Slot labels - generic slots that can run any task type.
 */
const slotLabels: Record<1 | 2 | 3 | 4, { name: string; description: string }> = {
  1: { name: 'Slot 1', description: 'Any task - priority: Verify > Reconcile > Execute > Plan' },
  2: { name: 'Slot 2', description: 'Any task - priority: Verify > Reconcile > Execute > Plan' },
  3: { name: 'Slot 3', description: 'Any task - priority: Verify > Reconcile > Execute > Plan' },
  4: { name: 'Slot 4', description: 'Any task - priority: Verify > Reconcile > Execute > Plan' },
};

const statusColors: Record<SessionStatus, { bg: string; text: string; label: string }> = {
  idle: { bg: 'bg-slate-600', text: 'text-slate-300', label: 'Idle' },
  running: { bg: 'bg-green-600', text: 'text-green-100', label: 'Running' },
  waiting_checkpoint: { bg: 'bg-yellow-600', text: 'text-yellow-100', label: 'Checkpoint' },
  completed: { bg: 'bg-blue-600', text: 'text-blue-100', label: 'Completed' },
  failed: { bg: 'bg-red-600', text: 'text-red-100', label: 'Failed' },
};

export function SessionSlot({ slot, session }: SessionSlotProps) {
  const isWaitingCheckpoint = session?.status === 'waiting_checkpoint';
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  // Get session output for copy functionality
  const { output } = useSessionOutput(session?.id ?? '');

  const handleCopy = useCallback(async () => {
    if (!session || output.length === 0) return;

    try {
      // Join all output chunks and strip ANSI codes
      const cleanText = stripAnsi(output.join(''));
      await navigator.clipboard.writeText(cleanText);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }, [session, output]);

  const slotInfo = slotLabels[slot];

  if (!session) {
    return (
      <div className="flex h-full min-h-[200px] flex-col overflow-hidden rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 p-4">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <span className="text-sm font-medium text-slate-400" title={slotInfo.description}>
            {slotInfo.name}
          </span>
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
        <span className="text-sm font-medium text-slate-300" title={slotInfo.description}>
          {slotInfo.name}
        </span>
        <div className="flex items-center gap-2">
          {/* Copy button */}
          <button
            onClick={handleCopy}
            disabled={output.length === 0}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              copyStatus === 'copied'
                ? 'bg-green-600 text-green-100'
                : copyStatus === 'error'
                  ? 'bg-red-600 text-red-100'
                  : output.length === 0
                    ? 'cursor-not-allowed bg-slate-700 text-slate-500'
                    : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
            }`}
            title="Copy terminal output to clipboard"
          >
            {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Failed' : 'Copy'}
          </button>
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
