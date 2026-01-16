/**
 * GSD State Parser - Parses GSD project state from .planning/ files.
 *
 * Extracts state from STATE.md, ROADMAP.md, and current PLAN.md using regex patterns.
 * Supports YAML frontmatter in ROADMAP.md for quick state reading.
 * Per CONTEXT.md: MVP regex approach, not full AST parsing.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { parseRoadmapFrontmatter } from './frontmatter-parser.js';
import type { GsdPhase, GsdState } from './types/gsd-state.js';

/**
 * Extended GSD state with additional parsed information.
 */
export interface ParsedGsdState extends GsdState {
  /** Status line from STATE.md (e.g., "In progress", "Phase complete") */
  status: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Last activity date from STATE.md */
  lastActivity: string;
  /** Key decisions accumulated from STATE.md */
  decisions: string[];
  /** Deferred issues from STATE.md */
  deferredIssues: string[];
  /** Total phases in ROADMAP */
  totalPhases: number;
  /** Total plans in current phase */
  plansInCurrentPhase: number;
  /** Task count from current PLAN.md */
  currentPlanTasks: number;
  /** Whether current plan has checkpoints */
  currentPlanHasCheckpoints: boolean;
  /** Whether state was loaded from frontmatter (faster) vs parsed from content */
  fromFrontmatter: boolean;
}

/**
 * Parser for GSD project state from .planning/ directory.
 */
export class GsdStateParser {
  private readonly planningDir: string;

  /**
   * Creates a new GsdStateParser for the given working directory.
   * @param workingDir - Project root directory containing .planning/
   */
  constructor(workingDir: string) {
    this.planningDir = join(workingDir, '.planning');
  }

  /**
   * Parses GSD state from the .planning/ directory.
   * @returns ParsedGsdState with all available information
   */
  parse(): ParsedGsdState {
    const state: ParsedGsdState = {
      projectName: this.parseProjectName(),
      currentPhase: 0,
      currentPlan: 0,
      phases: [],
      hasCheckpoint: false,
      status: 'unknown',
      progress: 0,
      lastActivity: '',
      decisions: [],
      deferredIssues: [],
      totalPhases: 0,
      plansInCurrentPhase: 0,
      currentPlanTasks: 0,
      currentPlanHasCheckpoints: false,
      fromFrontmatter: false,
    };

    // Parse ROADMAP.md first (may have frontmatter with state)
    this.parseRoadmapFile(state);

    // Only parse STATE.md if we didn't get state from frontmatter
    if (!state.fromFrontmatter) {
      this.parseStateFile(state);
    }

    // Parse current PLAN.md
    this.parseCurrentPlan(state);

    return state;
  }

  /**
   * Static factory method to parse state from a directory.
   * @param workingDir - Project root directory containing .planning/
   * @returns ParsedGsdState with all available information
   */
  static parseFromDirectory(workingDir: string): ParsedGsdState {
    const parser = new GsdStateParser(workingDir);
    return parser.parse();
  }

  /**
   * Extracts project name from PROJECT.md title or directory name.
   */
  private parseProjectName(): string {
    const projectFile = join(this.planningDir, 'PROJECT.md');
    if (existsSync(projectFile)) {
      const content = readFileSync(projectFile, 'utf-8');
      // Match first markdown heading: # Project Name
      const match = content.match(/^#\s+(.+)$/m);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    // Fallback to parent directory name
    return basename(join(this.planningDir, '..'));
  }

  /**
   * Parses STATE.md for current position and accumulated context.
   */
  private parseStateFile(state: ParsedGsdState): void {
    const stateFile = join(this.planningDir, 'STATE.md');
    if (!existsSync(stateFile)) {
      return;
    }

    const content = readFileSync(stateFile, 'utf-8');

    // Extract phase number from "Phase: X of Y"
    const phaseMatch = content.match(/Phase:\s*(\d+)\s*of\s*(\d+)/i);
    if (phaseMatch && phaseMatch[1] && phaseMatch[2]) {
      state.currentPhase = parseInt(phaseMatch[1], 10);
      state.totalPhases = parseInt(phaseMatch[2], 10);
    }

    // Extract plan number from "Plan: X of Y in current phase"
    const planMatch = content.match(/Plan:\s*(\d+)\s*of\s*(\d+)/i);
    if (planMatch && planMatch[1] && planMatch[2]) {
      state.currentPlan = parseInt(planMatch[1], 10);
      state.plansInCurrentPhase = parseInt(planMatch[2], 10);
    }

    // Extract status from "Status:" line
    const statusMatch = content.match(/Status:\s*([^\n]+)/i);
    if (statusMatch?.[1]) {
      state.status = statusMatch[1].trim();
    }

    // Extract progress percentage from progress bar (e.g., "[███████░░░] 65%")
    const progressMatch = content.match(/\[[\u2588\u2591\u2593\u2592█░▓▒■□]+\]\s*(\d+)%/);
    if (progressMatch?.[1]) {
      state.progress = parseInt(progressMatch[1], 10);
    }

    // Extract last activity date from "Last activity:" line
    const lastActivityMatch = content.match(/Last activity:\s*([^\n—-]+)/i);
    if (lastActivityMatch?.[1]) {
      state.lastActivity = lastActivityMatch[1].trim();
    }

    // Extract decisions from ### Decisions section
    state.decisions = this.extractListSection(content, '### Decisions');

    // Extract deferred issues from ### Deferred Issues section
    state.deferredIssues = this.extractListSection(content, '### Deferred Issues');
  }

  /**
   * Parses ROADMAP.md for phases and their statuses.
   * Checks for YAML frontmatter first for quick state reading.
   */
  private parseRoadmapFile(state: ParsedGsdState): void {
    const roadmapFile = join(this.planningDir, 'ROADMAP.md');
    if (!existsSync(roadmapFile)) {
      return;
    }

    const content = readFileSync(roadmapFile, 'utf-8');

    // Try to parse frontmatter first (faster path)
    const frontmatter = parseRoadmapFrontmatter(content);
    if (frontmatter) {
      state.frontmatter = frontmatter;
      state.fromFrontmatter = true;

      // Populate state from frontmatter
      if (frontmatter.project) {
        state.projectName = frontmatter.project;
      }
      state.currentPhase = frontmatter.current_phase;
      state.currentPlan = frontmatter.current_plan;
      state.totalPhases = frontmatter.total_phases;
      state.progress =
        frontmatter.total_plans > 0
          ? Math.round((frontmatter.completed_plans / frontmatter.total_plans) * 100)
          : 0;

      // Map project status to status string
      state.status = this.mapProjectStatus(frontmatter.status);
    }

    // Still parse phases from content for detailed info
    const phases: GsdPhase[] = [];

    // Match phase lines: - [x] **Phase N: Name** or - [ ] **Phase N: Name**
    // Also handles: N/N plans or (N/N plans) patterns
    const phaseRegex = /^-\s*\[(x|\s)\]\s*\*\*Phase\s+(\d+):\s*([^*]+)\*\*/gim;
    let match: RegExpExecArray | null;

    while ((match = phaseRegex.exec(content)) !== null) {
      const checkMark = match[1];
      const phaseNumStr = match[2];
      const phaseNameStr = match[3];
      if (!checkMark || !phaseNumStr || !phaseNameStr) continue;

      const isComplete = checkMark.toLowerCase() === 'x';
      const phaseNum = parseInt(phaseNumStr, 10);
      const phaseName = phaseNameStr.trim();

      // Find plan completion for this phase in Phase Details section
      const { plansComplete, plansTotal } = this.findPlanCompletion(content, phaseNum);

      phases.push({
        number: phaseNum,
        name: phaseName,
        status: isComplete ? 'completed' : plansComplete > 0 ? 'in_progress' : 'not_started',
        plansTotal,
        plansComplete,
      });
    }

    state.phases = phases;
    if (phases.length > 0 && state.totalPhases === 0) {
      state.totalPhases = phases.length;
    }
  }

  /**
   * Maps ProjectStatus to display string.
   */
  private mapProjectStatus(status: string): string {
    const statusMap: Record<string, string> = {
      planning: 'Planning',
      executing: 'Executing',
      verifying: 'Verifying',
      blocked: 'Blocked',
      complete: 'Complete',
    };
    return statusMap[status] ?? status;
  }

  /**
   * Finds plan completion counts for a specific phase in ROADMAP.md.
   */
  private findPlanCompletion(
    content: string,
    phaseNum: number
  ): { plansComplete: number; plansTotal: number } {
    // Look for the Phase Details section for this phase
    // Pattern: ### Phase N: Name followed by plan checkboxes
    const phaseDetailRegex = new RegExp(
      `###\\s*Phase\\s+${phaseNum}[:\\s][^#]*Plans:[^\\n]*([\\s\\S]*?)(?=###|$)`,
      'i'
    );

    const sectionMatch = content.match(phaseDetailRegex);
    if (!sectionMatch) {
      // Try simpler pattern: just count plan checkboxes after Phase header
      const simpleRegex = new RegExp(
        `###\\s*Phase\\s+${phaseNum}[^#]*?([\\s\\S]*?)(?=###\\s*Phase|##\\s|$)`,
        'i'
      );
      const simpleMatch = content.match(simpleRegex);
      if (simpleMatch && simpleMatch[1]) {
        return this.countPlanCheckboxes(simpleMatch[1]);
      }
      return { plansComplete: 0, plansTotal: 0 };
    }

    if (!sectionMatch[1]) {
      return { plansComplete: 0, plansTotal: 0 };
    }
    return this.countPlanCheckboxes(sectionMatch[1]);
  }

  /**
   * Counts plan checkboxes in a section of text.
   */
  private countPlanCheckboxes(section: string): { plansComplete: number; plansTotal: number } {
    // Match plan checkboxes: - [x] 01-01: or - [ ] 01-02:
    const planCheckboxRegex = /^-\s*\[(x|\s)\]\s*\d+-\d+:/gim;
    let plansTotal = 0;
    let plansComplete = 0;

    let match: RegExpExecArray | null;
    while ((match = planCheckboxRegex.exec(section)) !== null) {
      plansTotal++;
      const checkMark = match[1];
      if (checkMark && checkMark.toLowerCase() === 'x') {
        plansComplete++;
      }
    }

    return { plansComplete, plansTotal };
  }

  /**
   * Parses current PLAN.md for task count and checkpoint presence.
   */
  private parseCurrentPlan(state: ParsedGsdState): void {
    if (state.currentPhase === 0) {
      return;
    }

    // Find phase directory
    const phasesDir = join(this.planningDir, 'phases');
    if (!existsSync(phasesDir)) {
      return;
    }

    // Find directory matching current phase (e.g., "01-foundation", "02-session-management")
    const phaseDir = this.findPhaseDirectory(phasesDir, state.currentPhase);
    if (!phaseDir) {
      return;
    }

    // Build plan filename (e.g., "01-02-PLAN.md")
    const planPadded = String(state.currentPlan).padStart(2, '0');
    const phasePadded = String(state.currentPhase).padStart(2, '0');
    const planFile = join(phaseDir, `${phasePadded}-${planPadded}-PLAN.md`);

    if (!existsSync(planFile)) {
      return;
    }

    const content = readFileSync(planFile, 'utf-8');

    // Count tasks (both <task ...> and type="auto" patterns)
    const taskMatches = content.match(/<task\s+/gi);
    state.currentPlanTasks = taskMatches?.length ?? 0;

    // Check for checkpoints
    state.currentPlanHasCheckpoints = /type="checkpoint/i.test(content);

    // Update hasCheckpoint based on plan
    if (state.currentPlanHasCheckpoints) {
      state.hasCheckpoint = true;
    }
  }

  /**
   * Finds phase directory matching a phase number.
   */
  private findPhaseDirectory(phasesDir: string, phaseNum: number): string | null {
    try {
      const entries = readdirSync(phasesDir, { withFileTypes: true });
      const phasePadded = String(phaseNum).padStart(2, '0');

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith(phasePadded + '-')) {
          return join(phasesDir, entry.name);
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }
    return null;
  }

  /**
   * Extracts a list section from markdown content.
   * @param content - Full markdown content
   * @param sectionHeader - Header to find (e.g., "### Decisions")
   * @returns Array of list item texts
   */
  private extractListSection(content: string, sectionHeader: string): string[] {
    // Find section start
    const headerIndex = content.indexOf(sectionHeader);
    if (headerIndex === -1) {
      return [];
    }

    // Find section end (next header or end of content)
    const sectionStart = headerIndex + sectionHeader.length;
    const nextHeaderMatch = content.slice(sectionStart).match(/\n#{1,3}\s/);
    const sectionEnd =
      nextHeaderMatch && nextHeaderMatch.index !== undefined
        ? sectionStart + nextHeaderMatch.index
        : content.length;

    const section = content.slice(sectionStart, sectionEnd);

    // Extract list items (lines starting with - or *)
    const items: string[] = [];
    const listItemRegex = /^[-*]\s+(.+)$/gm;
    let match: RegExpExecArray | null;

    while ((match = listItemRegex.exec(section)) !== null) {
      const itemText = match[1];
      if (!itemText) continue;
      const item = itemText.trim();
      // Skip "None" or "None yet" items
      if (item.toLowerCase() !== 'none' && !item.toLowerCase().startsWith('none ')) {
        items.push(item);
      }
    }

    return items;
  }
}
