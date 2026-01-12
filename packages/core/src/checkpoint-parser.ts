import type {
  CheckpointType,
  CheckpointInfo,
  HumanVerifyCheckpoint,
  DecisionCheckpoint,
  HumanActionCheckpoint,
} from './types/checkpoint.js';

/**
 * Parses raw checkpoint content into typed CheckpointInfo objects.
 *
 * Checkpoint formats:
 *
 * human-verify:
 * ════════════════════════════════════════
 * CHECKPOINT: human-verify
 * Task [X] of [Y]: [Name]
 * What was built: [content]
 * How to verify:
 * 1. [step]
 * 2. [step]
 * Type "approved" to continue...
 * ════════════════════════════════════════
 *
 * decision:
 * ════════════════════════════════════════
 * CHECKPOINT: decision
 * Decision: [what]
 * Context: [why]
 * Options:
 * - option-a: [name] - Pros: [pros] Cons: [cons]
 * Select: option-a or option-b
 * ════════════════════════════════════════
 *
 * human-action:
 * ════════════════════════════════════════
 * CHECKPOINT: human-action
 * Action required: [action]
 * Instructions:
 * [multi-line]
 * Type "done" when completed
 * ════════════════════════════════════════
 */
export class CheckpointParser {
  /**
   * Parse raw checkpoint content into a typed CheckpointInfo object.
   *
   * @param rawContent - Raw checkpoint output from Claude CLI
   * @param type - The checkpoint type (already detected via CHECKPOINT_PATTERNS)
   * @param sessionId - The session ID
   * @returns Parsed checkpoint info, or undefined if parsing fails
   */
  static parse(
    rawContent: string,
    type: CheckpointType,
    sessionId: string
  ): CheckpointInfo | undefined {
    switch (type) {
      case 'human-verify':
        return this.parseHumanVerify(rawContent, sessionId);
      case 'decision':
        return this.parseDecision(rawContent, sessionId);
      case 'human-action':
        return this.parseHumanAction(rawContent, sessionId);
      default:
        return undefined;
    }
  }

  /**
   * Parse human-verify checkpoint content.
   */
  private static parseHumanVerify(rawContent: string, sessionId: string): HumanVerifyCheckpoint {
    // Extract "What was built" or "I built" or similar variations
    const whatBuiltPatterns = [
      /(?:What was built|What I built|I built|I automated)[:\s]*([^\n]+(?:\n(?![A-Z])[^\n]+)*)/i,
      /Task \d+ of \d+:\s*[^\n]+\n\n?([^\n]+(?:\n(?!How|Type|═)[^\n]+)*)/i,
    ];

    let whatBuilt = 'Unable to parse';
    for (const pattern of whatBuiltPatterns) {
      const match = rawContent.match(pattern);
      if (match?.[1]) {
        whatBuilt = match[1].trim();
        break;
      }
    }

    // Extract "How to verify" steps
    const howToVerifyPatterns = [
      /How to verify[:\s]*\n((?:\s*\d+\.[^\n]+\n?)+)/i,
      /How to verify[:\s]*\n((?:[^\n]+\n?)+?)(?=Type|═|$)/i,
    ];

    let howToVerify: string[] = ['Unable to parse verification steps'];
    for (const pattern of howToVerifyPatterns) {
      const match = rawContent.match(pattern);
      if (match?.[1]) {
        // Split by numbered lines or newlines
        const steps = match[1]
          .split(/\n/)
          .map((line) => line.replace(/^\s*\d+\.\s*/, '').trim())
          .filter((line) => line.length > 0);
        if (steps.length > 0) {
          howToVerify = steps;
          break;
        }
      }
    }

    // Extract resume signal (the instruction for how to continue)
    const resumePatterns = [
      /(Type\s*["']?approved["']?[^═\n]*)/i,
      /(Type\s*["']?[^"'\n]+["']?\s*(?:to continue|or describe)[^═\n]*)/i,
      /([^\n]*(?:approved|continue|describe issues)[^\n]*)/i,
    ];

    let resumeSignal = 'Type "approved" to continue';
    for (const pattern of resumePatterns) {
      const match = rawContent.match(pattern);
      if (match?.[1]) {
        resumeSignal = match[1].trim();
        break;
      }
    }

    return {
      type: 'human-verify',
      sessionId,
      detectedAt: new Date(),
      whatBuilt,
      howToVerify,
      resumeSignal,
    };
  }

  /**
   * Parse decision checkpoint content.
   */
  private static parseDecision(rawContent: string, sessionId: string): DecisionCheckpoint {
    // Extract decision question
    const decisionPatterns = [/Decision[:\s]+([^\n]+)/i, /Decision needed[:\s]+([^\n]+)/i];

    let decision = 'Unable to parse decision';
    for (const pattern of decisionPatterns) {
      const match = rawContent.match(pattern);
      if (match?.[1]) {
        decision = match[1].trim();
        break;
      }
    }

    // Extract context
    const contextPatterns = [/Context[:\s]+([^\n]+(?:\n(?!Options)[^\n]+)*)/i];

    let context = '';
    for (const pattern of contextPatterns) {
      const match = rawContent.match(pattern);
      if (match?.[1]) {
        context = match[1].trim();
        break;
      }
    }

    // Extract options
    const optionsSection = rawContent.match(
      /Options[:\s]*\n((?:[^\n]*(?:option|─|\d+\.)[^\n]*\n?)+)/i
    );

    const options: Array<{ id: string; name: string; pros: string; cons: string }> = [];

    if (optionsSection?.[1]) {
      const sectionContent = optionsSection[1];
      // Pattern: - option-id: name - Pros: ... Cons: ...
      // Or: 1. option-id: name\n   Pros: ...\n   Cons: ...
      const optionPatterns = [
        // Inline format: - option-a: Name - Pros: x Cons: y
        /[-•]\s*(\w+(?:-\w+)?)[:\s]+([^-\n]+)\s*[-–]\s*Pros[:\s]+([^C\n]+)\s*Cons[:\s]+([^\n]+)/gi,
        // Block format with option id
        /(\w+(?:-\w+)?)[:\s]+([^\n]+)\n\s*Pros[:\s]+([^\n]+)\n\s*Cons[:\s]+([^\n]+)/gi,
        // Numbered format: 1. Name\n   Pros: x\n   Cons: y
        /\d+\.\s*\[?(\w+(?:-\w+)?)\]?[:\s]+([^\n]+)\n\s*Pros[:\s]+([^\n]+)\n\s*Cons[:\s]+([^\n]+)/gi,
      ];

      for (const pattern of optionPatterns) {
        let match;
        while ((match = pattern.exec(sectionContent)) !== null) {
          if (match[1] && match[2] && match[3] && match[4]) {
            options.push({
              id: match[1].trim(),
              name: match[2].trim(),
              pros: match[3].trim(),
              cons: match[4].trim(),
            });
          }
        }
        if (options.length > 0) break;
      }

      // Fallback: simpler option extraction if complex pattern fails
      if (options.length === 0) {
        const simplePattern = /[-•]\s*(\w+(?:-\w+)?)[:\s]+([^\n]+)/g;
        let match;
        while ((match = simplePattern.exec(sectionContent)) !== null) {
          if (match[1] && match[2]) {
            options.push({
              id: match[1].trim(),
              name: match[2].trim(),
              pros: '',
              cons: '',
            });
          }
        }
      }
    }

    // If no options found, add placeholder
    if (options.length === 0) {
      options.push({ id: 'unknown', name: 'Unable to parse options', pros: '', cons: '' });
    }

    // Extract resume signal
    const resumePatterns = [
      /Select[:\s]+([^\n═]+)/i,
      /(Select\s*[:]\s*\w+(?:\s*,\s*\w+)*(?:\s*or\s*\w+)?)/i,
    ];

    let resumeSignal = 'Select an option';
    for (const pattern of resumePatterns) {
      const match = rawContent.match(pattern);
      if (match?.[1]) {
        resumeSignal = match[1].trim();
        break;
      }
    }

    return {
      type: 'decision',
      sessionId,
      detectedAt: new Date(),
      decision,
      context,
      options,
      resumeSignal,
    };
  }

  /**
   * Parse human-action checkpoint content.
   */
  private static parseHumanAction(rawContent: string, sessionId: string): HumanActionCheckpoint {
    // Extract action required
    const actionPatterns = [
      /Action required[:\s]+([^\n]+)/i,
      /Action[:\s]+([^\n]+)/i,
      /Need your help with[:\s]+([^\n]+)/i,
    ];

    let action = 'Unable to parse action';
    for (const pattern of actionPatterns) {
      const match = rawContent.match(pattern);
      if (match?.[1]) {
        action = match[1].trim();
        break;
      }
    }

    // Extract instructions (multi-line content after "Instructions:")
    const instructionsPatterns = [
      /Instructions[:\s]*\n((?:[^\n]+\n?)+?)(?=Type|I'll verify|═|$)/i,
      /What you need to do[:\s]*\n((?:[^\n]+\n?)+?)(?=Type|I'll verify|═|$)/i,
    ];

    let instructions = rawContent;
    for (const pattern of instructionsPatterns) {
      const match = rawContent.match(pattern);
      if (match?.[1]) {
        instructions = match[1].trim();
        break;
      }
    }

    // Extract resume signal
    const resumePatterns = [
      /(Type\s*["']?done["']?[^═\n]*)/i,
      /(Type\s*["']?[^"'\n]+["']?\s*when\s*[^═\n]*)/i,
    ];

    let resumeSignal = 'Type "done" when complete';
    for (const pattern of resumePatterns) {
      const match = rawContent.match(pattern);
      if (match?.[1]) {
        resumeSignal = match[1].trim();
        break;
      }
    }

    return {
      type: 'human-action',
      sessionId,
      detectedAt: new Date(),
      action,
      instructions,
      resumeSignal,
    };
  }
}
