export const MAX_SESSIONS = 3;
export const SESSION_SLOTS = [1, 2, 3] as const;
export const DEFAULT_OUTPUT_BUFFER_SIZE = 50000; // ~50KB
export const CHECKPOINT_PATTERNS = {
  humanVerify: /CHECKPOINT:\s*human-verify/i,
  decision: /CHECKPOINT:\s*decision/i,
  humanAction: /CHECKPOINT:\s*human-action/i,
} as const;
