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
 * Detects checkpoint type from output using CHECKPOINT_PATTERNS.
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
  return undefined;
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

    // Check session status first
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

      // Parse the checkpoint content
      const parsedCheckpoint = rawContent
        ? CheckpointParser.parse(rawContent, checkpointType, sessionId)
        : undefined;

      // Build response with parsed checkpoint or fallback to raw content
      let response: CheckpointResponse;
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
