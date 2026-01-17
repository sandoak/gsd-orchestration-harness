import { CHECKPOINT_PATTERNS, CheckpointParser } from '@gsd/core';
import type { CheckpointType, CheckpointInfo } from '@gsd/core';
import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for harness_get_checkpoint tool parameters.
 */
const getCheckpointSchema = {
  sessionId: z.string().describe('ID of the session to check for checkpoints'),
};

/**
 * Response structure when no checkpoint is detected.
 */
interface NoCheckpointResponse {
  hasCheckpoint: false;
}

/**
 * Response structure when a checkpoint is detected but type is unknown.
 */
interface UnknownCheckpointResponse {
  hasCheckpoint: true;
  type: undefined;
  rawContent: string;
}

/**
 * Full checkpoint response with parsed info.
 */
type CheckpointResponse =
  | NoCheckpointResponse
  | UnknownCheckpointResponse
  | (CheckpointInfo & { hasCheckpoint: true; rawContent?: string });

/**
 * Completion detection patterns for workflow completion.
 */
const COMPLETION_PATTERNS = {
  verificationPassed: /verification\s+passed/i,
  planningComplete: /planning\s+complete/i,
  phaseComplete: /phase\s+\d+.*complete/i,
  executionComplete: /execution\s+complete/i,
  nextCommand: /next\s+command:\s*(.+?)(?:\n|$)/i,
  // Orchestrator signal patterns
  spawnVerification: /orchestrator\s+will\s+spawn\s+verification/i,
  awaitingVerification: /awaiting\s+verification/i,
};

/**
 * Detects checkpoint type from output using CHECKPOINT_PATTERNS and completion patterns.
 */
function detectCheckpointType(output: string): CheckpointType | undefined {
  if (CHECKPOINT_PATTERNS.humanVerify.test(output)) {
    return 'human-verify';
  }
  if (CHECKPOINT_PATTERNS.decision.test(output)) {
    return 'decision';
  }
  if (CHECKPOINT_PATTERNS.humanAction.test(output)) {
    return 'human-action';
  }
  // Check for completion patterns (workflow finished)
  if (
    COMPLETION_PATTERNS.verificationPassed.test(output) ||
    COMPLETION_PATTERNS.planningComplete.test(output) ||
    COMPLETION_PATTERNS.phaseComplete.test(output) ||
    COMPLETION_PATTERNS.executionComplete.test(output) ||
    COMPLETION_PATTERNS.nextCommand.test(output) ||
    COMPLETION_PATTERNS.spawnVerification.test(output) ||
    COMPLETION_PATTERNS.awaitingVerification.test(output)
  ) {
    return 'completion';
  }
  return undefined;
}

/**
 * Parses completion checkpoint from output.
 */
function parseCompletionCheckpoint(
  output: string,
  _sessionId: string
): {
  workflow: string;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  nextCommand?: string;
} {
  // Extract next command if present
  const nextCommandMatch = output.match(COMPLETION_PATTERNS.nextCommand);
  const nextCommand = nextCommandMatch?.[1]?.trim();

  // Determine workflow type from output
  let workflow = 'unknown';
  if (/plan-phase|planning/i.test(output)) {
    workflow = 'plan-phase';
  } else if (/execute-phase|execution/i.test(output)) {
    workflow = 'execute-phase';
  } else if (/verify-work|verification/i.test(output)) {
    workflow = 'verify-work';
  } else if (/research-phase|research/i.test(output)) {
    workflow = 'research-phase';
  }

  // Determine status
  let status: 'success' | 'partial' | 'failed' = 'success';
  if (/failed|error|blocked/i.test(output)) {
    status = 'failed';
  } else if (/partial|incomplete/i.test(output)) {
    status = 'partial';
  }

  // Extract summary (look for status message patterns)
  let summary = 'Workflow completed';
  if (COMPLETION_PATTERNS.verificationPassed.test(output)) {
    summary = 'Verification passed';
  } else if (COMPLETION_PATTERNS.planningComplete.test(output)) {
    summary = 'Planning complete';
  } else if (COMPLETION_PATTERNS.executionComplete.test(output)) {
    summary = 'Execution complete - awaiting verification';
  } else if (COMPLETION_PATTERNS.spawnVerification.test(output)) {
    summary = 'Execution complete - orchestrator should spawn verification';
  } else if (COMPLETION_PATTERNS.phaseComplete.test(output)) {
    const match = output.match(/phase\s+(\d+).*complete/i);
    summary = match ? `Phase ${match[1]} complete` : 'Phase complete';
  }

  return { workflow, status, summary, nextCommand };
}

/**
 * Extracts checkpoint content block from output.
 * Looks for the checkpoint banner pattern and extracts surrounding context.
 */
function extractCheckpointContent(output: string): string | undefined {
  // Look for checkpoint banner pattern (═══ CHECKPOINT: ... ═══)
  const bannerPattern = /═{10,}[\s\S]*?CHECKPOINT:[\s\S]*?═{10,}[\s\S]*?═{10,}/;
  const match = output.match(bannerPattern);
  if (match) {
    return match[0];
  }

  // Fallback: just find the CHECKPOINT line and surrounding context
  const lines = output.split('\n');
  const checkpointLineIndex = lines.findIndex((line) => /CHECKPOINT:/i.test(line));
  if (checkpointLineIndex !== -1) {
    // Return 20 lines around the checkpoint
    const start = Math.max(0, checkpointLineIndex - 5);
    const end = Math.min(lines.length, checkpointLineIndex + 15);
    return lines.slice(start, end).join('\n');
  }

  return undefined;
}

/**
 * Registers the harness_get_checkpoint tool with the MCP server.
 *
 * This tool detects if a session is at a checkpoint and returns parsed
 * CheckpointInfo with typed fields for each checkpoint type.
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerGetCheckpointTool(
  server: McpServer,
  manager: PersistentSessionManager
): void {
  server.tool('harness_get_checkpoint', getCheckpointSchema, async ({ sessionId }) => {
    // Verify session exists
    const session = manager.getSession(sessionId);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Session not found: ${sessionId}`,
            }),
          },
        ],
      };
    }

    // PRIORITY 1: Check for explicit checkpoint in database (from harness_signal_checkpoint)
    const dbCheckpoint = manager.checkpointStore.getPendingBySession(sessionId);
    if (dbCheckpoint) {
      // Return the explicit checkpoint - this takes priority over pattern detection
      const response: CheckpointResponse = {
        hasCheckpoint: true,
        type: dbCheckpoint.type === 'error' ? undefined : dbCheckpoint.type,
        sessionId,
        detectedAt: dbCheckpoint.createdAt,
        ...(dbCheckpoint.type === 'completion' && {
          workflow: dbCheckpoint.workflow ?? 'unknown',
          status: 'success' as const,
          summary: dbCheckpoint.summary,
          nextCommand: dbCheckpoint.nextCommand,
          resumeSignal: dbCheckpoint.nextCommand
            ? `Run: ${dbCheckpoint.nextCommand}`
            : 'Workflow completed - decide next action',
        }),
        ...(dbCheckpoint.type === 'human-verify' && {
          whatBuilt: dbCheckpoint.summary,
          howToVerify: ['See checkpoint details'],
          resumeSignal: 'Type "approved" to continue',
        }),
        ...(dbCheckpoint.type === 'decision' && {
          decision: dbCheckpoint.summary,
          context: '',
          options: [],
          resumeSignal: 'Select an option',
        }),
        ...(dbCheckpoint.type === 'human-action' && {
          action: dbCheckpoint.summary,
          instructions: '',
          resumeSignal: 'Type "done" when complete',
        }),
        rawContent: JSON.stringify(dbCheckpoint.data ?? {}),
      } as CheckpointResponse;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sessionId,
              checkpoint: response,
              source: 'explicit', // Indicates this came from harness_signal_checkpoint
              checkpointId: dbCheckpoint.id,
            }),
          },
        ],
      };
    }

    // PRIORITY 2: Check session status for pattern-based detection
    if (session.status !== 'waiting_checkpoint') {
      const response: CheckpointResponse = { hasCheckpoint: false };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sessionId,
              checkpoint: response,
            }),
          },
        ],
      };
    }

    // PRIORITY 3: Fall back to pattern-based detection from output
    try {
      // Get recent output (last chunks, roughly 50 lines worth)
      const outputChunks = manager.getOutput(sessionId);
      const fullOutput = outputChunks.join('');

      // Get last ~50 lines for checkpoint detection
      const lines = fullOutput.split('\n');
      const recentOutput = lines.slice(-50).join('\n');

      // Detect checkpoint type
      let checkpointType = detectCheckpointType(recentOutput);
      let rawContent = extractCheckpointContent(recentOutput);

      // If not found in recent output, try full output
      if (!checkpointType) {
        checkpointType = detectCheckpointType(fullOutput);
        rawContent = extractCheckpointContent(fullOutput);
      }

      // If still no checkpoint type found
      if (!checkpointType) {
        // Status says waiting but no checkpoint pattern anywhere
        const response: UnknownCheckpointResponse = {
          hasCheckpoint: true,
          type: undefined,
          rawContent: rawContent ?? 'Checkpoint detected but type unknown',
        };
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId,
                checkpoint: response,
              }),
            },
          ],
        };
      }

      // Handle completion checkpoint specially (not parsed by CheckpointParser)
      let response: CheckpointResponse;
      if (checkpointType === 'completion') {
        const completionData = parseCompletionCheckpoint(fullOutput, sessionId);
        response = {
          hasCheckpoint: true,
          type: 'completion',
          sessionId,
          detectedAt: new Date(),
          workflow: completionData.workflow,
          status: completionData.status,
          summary: completionData.summary,
          nextCommand: completionData.nextCommand,
          resumeSignal: completionData.nextCommand
            ? `Run: ${completionData.nextCommand}`
            : 'Workflow completed - decide next action',
          rawContent: rawContent ?? recentOutput.slice(-500),
        } as CheckpointResponse;
      } else {
        // Parse the checkpoint content using CheckpointParser
        const parsedCheckpoint = rawContent
          ? CheckpointParser.parse(rawContent, checkpointType, sessionId)
          : undefined;

        // Build response with parsed checkpoint or fallback to raw content
        if (parsedCheckpoint) {
          response = {
            ...parsedCheckpoint,
            hasCheckpoint: true,
            rawContent, // Include raw content as fallback
          };
        } else {
          // Parsing failed, return raw content with detected type
          response = {
            hasCheckpoint: true,
            type: checkpointType,
            sessionId,
            detectedAt: new Date(),
            rawContent: rawContent ?? 'Checkpoint content not extracted',
            // Type-specific fallbacks based on checkpoint type
            ...(checkpointType === 'human-verify' && {
              whatBuilt: 'Unable to parse',
              howToVerify: ['Unable to parse verification steps'],
              resumeSignal: 'Type "approved" to continue',
            }),
            ...(checkpointType === 'decision' && {
              decision: 'Unable to parse',
              context: '',
              options: [{ id: 'unknown', name: 'Unable to parse', pros: '', cons: '' }],
              resumeSignal: 'Select an option',
            }),
            ...(checkpointType === 'human-action' && {
              action: 'Unable to parse',
              instructions: rawContent ?? '',
              resumeSignal: 'Type "done" when complete',
            }),
          } as CheckpointResponse;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sessionId,
              checkpoint: response,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error checking checkpoint';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Failed to check checkpoint: ${errorMessage}`,
            }),
          },
        ],
      };
    }
  });
}
