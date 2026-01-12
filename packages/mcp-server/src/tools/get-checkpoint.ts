import { CHECKPOINT_PATTERNS } from '@gsd/core';
import type { CheckpointType } from '@gsd/core';
import type { PersistentSessionManager } from '@gsd/session-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Schema for gsd_get_checkpoint tool parameters.
 */
const getCheckpointSchema = {
  sessionId: z.string().describe('ID of the session to check for checkpoints'),
};

/**
 * Basic checkpoint info extracted from output.
 * Phase 5 will enhance with full XML parsing.
 */
interface BasicCheckpointInfo {
  hasCheckpoint: boolean;
  type?: CheckpointType;
  rawContent?: string;
}

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
 * Registers the gsd_get_checkpoint tool with the MCP server.
 *
 * This tool detects if a session is at a checkpoint and extracts basic info.
 * Uses regex pattern matching; Phase 5 adds full XML parsing.
 *
 * @param server - The MCP server instance
 * @param manager - The PersistentSessionManager instance
 */
export function registerGetCheckpointTool(
  server: McpServer,
  manager: PersistentSessionManager
): void {
  server.tool('gsd_get_checkpoint', getCheckpointSchema, async ({ sessionId }) => {
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
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sessionId,
              checkpoint: {
                hasCheckpoint: false,
              } satisfies BasicCheckpointInfo,
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
      const checkpointType = detectCheckpointType(recentOutput);

      if (!checkpointType) {
        // Session says waiting but no checkpoint pattern found
        // This might happen if the checkpoint is in earlier output
        const fullCheckpointType = detectCheckpointType(fullOutput);

        if (fullCheckpointType) {
          const rawContent = extractCheckpointContent(fullOutput);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  sessionId,
                  checkpoint: {
                    hasCheckpoint: true,
                    type: fullCheckpointType,
                    rawContent,
                  } satisfies BasicCheckpointInfo,
                }),
              },
            ],
          };
        }

        // Status says waiting but no checkpoint pattern anywhere
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId,
                checkpoint: {
                  hasCheckpoint: true,
                  type: undefined,
                  rawContent: 'Checkpoint detected but type unknown',
                } satisfies BasicCheckpointInfo,
              }),
            },
          ],
        };
      }

      // Extract checkpoint content
      const rawContent =
        extractCheckpointContent(recentOutput) ?? extractCheckpointContent(fullOutput);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sessionId,
              checkpoint: {
                hasCheckpoint: true,
                type: checkpointType,
                rawContent,
              } satisfies BasicCheckpointInfo,
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
