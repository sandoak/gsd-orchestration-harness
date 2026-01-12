export type CheckpointType = 'human-verify' | 'decision' | 'human-action';

export interface CheckpointBase {
  type: CheckpointType;
  sessionId: string;
  detectedAt: Date;
}

export interface HumanVerifyCheckpoint extends CheckpointBase {
  type: 'human-verify';
  whatBuilt: string;
  howToVerify: string[];
  resumeSignal: string;
}

export interface DecisionCheckpoint extends CheckpointBase {
  type: 'decision';
  decision: string;
  context: string;
  options: Array<{
    id: string;
    name: string;
    pros: string;
    cons: string;
  }>;
  resumeSignal: string;
}

export interface HumanActionCheckpoint extends CheckpointBase {
  type: 'human-action';
  action: string;
  instructions: string;
  resumeSignal: string;
}

export type CheckpointInfo = HumanVerifyCheckpoint | DecisionCheckpoint | HumanActionCheckpoint;
