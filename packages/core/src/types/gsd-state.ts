import type { CheckpointInfo } from './checkpoint.js';
import type { RoadmapFrontmatter, ProjectStatus, VelocityMetrics } from './roadmap-frontmatter.js';

export interface GsdPhase {
  number: number;
  name: string;
  status: 'not_started' | 'in_progress' | 'completed';
  plansTotal: number;
  plansComplete: number;
}

export interface GsdPlan {
  phase: number;
  plan: number;
  name: string;
  status: 'pending' | 'executing' | 'completed';
  tasksTotal: number;
  tasksComplete: number;
}

export interface GsdState {
  projectName: string;
  currentPhase: number;
  currentPlan: number;
  phases: GsdPhase[];
  hasCheckpoint: boolean;
  checkpoint?: CheckpointInfo;

  /** ROADMAP.md frontmatter (if available) */
  frontmatter?: RoadmapFrontmatter;
}

// Re-export frontmatter types for convenience
export type { RoadmapFrontmatter, ProjectStatus, VelocityMetrics };
