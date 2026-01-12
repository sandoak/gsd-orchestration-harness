export type SessionStatus = 'idle' | 'running' | 'waiting_checkpoint' | 'completed' | 'failed';

export interface Session {
  id: string;
  slot: 1 | 2 | 3;
  status: SessionStatus;
  workingDir: string;
  currentCommand?: string;
  startedAt: Date;
  endedAt?: Date;
  pid?: number;
}

export interface SessionOutput {
  sessionId: string;
  timestamp: Date;
  type: 'stdout' | 'stderr';
  data: string;
}
