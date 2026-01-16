export const MAX_SESSIONS = 4;
export const SESSION_SLOTS = [1, 2, 3, 4] as const;
export const DEFAULT_OUTPUT_BUFFER_SIZE = 50000; // ~50KB
export const CHECKPOINT_PATTERNS = {
  humanVerify: /CHECKPOINT:\s*human-verify/i,
  decision: /CHECKPOINT:\s*decision/i,
  // Match both old "human-action" and new "Action Required" formats
  humanAction: /CHECKPOINT:\s*(?:human-action|Action\s*Required)/i,
} as const;
