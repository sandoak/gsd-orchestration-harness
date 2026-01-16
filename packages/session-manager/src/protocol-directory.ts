import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type {
  ActiveFilesState,
  DependencyGraphState,
  ExecutionResult,
  OrchestrationConfig,
  PersistedCheckpoint,
  PersistedCheckpointResponse,
  WorkerStatus,
} from '@gsd/core';

/**
 * Default orchestration configuration
 */
const DEFAULT_CONFIG: OrchestrationConfig = {
  version: '1.0',
  specDir: '',
  maxParallelExecutions: 2,
  maxParallelResearch: 2,
  verificationRequired: true,
  autoCommit: true,
};

/**
 * ProtocolDirectory manages the .orchestration/ directory structure
 * for crash recovery and state persistence.
 *
 * Directory structure:
 * .orchestration/
 *   config.yaml              # Orchestration settings
 *   dependency-graph.json    # Current dependency graph state
 *   active-files.json        # Files being modified (conflict detection)
 *   sessions/
 *     {session-id}/
 *       status.json          # Current worker status
 *       checkpoint.json      # Active checkpoint (if any)
 *       checkpoint_response.json  # Orchestrator response
 *       result.json          # Final execution result
 */
export class ProtocolDirectory {
  private readonly baseDir: string;
  private readonly sessionsDir: string;

  /**
   * Creates a new ProtocolDirectory manager.
   * @param workingDir - The project working directory (contains .orchestration/)
   */
  constructor(workingDir: string) {
    this.baseDir = join(workingDir, '.orchestration');
    this.sessionsDir = join(this.baseDir, 'sessions');
  }

  /**
   * Initializes the .orchestration/ directory structure.
   * Creates directories and default files if they don't exist.
   */
  initialize(specDir?: string): void {
    // Create base directory
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }

    // Create sessions directory
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }

    // Create default config if not exists
    const configPath = join(this.baseDir, 'config.yaml');
    if (!existsSync(configPath)) {
      const config: OrchestrationConfig = {
        ...DEFAULT_CONFIG,
        specDir: specDir ?? '',
      };
      this.writeYaml(configPath, config);
    }

    // Create empty dependency graph if not exists
    const graphPath = join(this.baseDir, 'dependency-graph.json');
    if (!existsSync(graphPath)) {
      const initialGraph: DependencyGraphState = {
        timestamp: new Date().toISOString(),
        specDir: specDir ?? '',
        plans: [],
        completed: [],
        running: [],
        blocked: [],
        available: [],
      };
      this.writeJson(graphPath, initialGraph);
    }

    // Create empty active files if not exists
    const activePath = join(this.baseDir, 'active-files.json');
    if (!existsSync(activePath)) {
      const initialActive: ActiveFilesState = {
        timestamp: new Date().toISOString(),
        files: [],
      };
      this.writeJson(activePath, initialActive);
    }
  }

  /**
   * Checks if the protocol directory exists and is initialized.
   */
  isInitialized(): boolean {
    return existsSync(this.baseDir) && existsSync(this.sessionsDir);
  }

  // ==================== Session Directory Methods ====================

  /**
   * Creates a session directory for a new session.
   */
  createSessionDir(sessionId: string): void {
    const sessionDir = join(this.sessionsDir, sessionId);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
  }

  /**
   * Removes a session directory and all its contents.
   */
  removeSessionDir(sessionId: string): void {
    const sessionDir = join(this.sessionsDir, sessionId);
    if (existsSync(sessionDir)) {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  /**
   * Gets the path to a session's directory.
   */
  getSessionDir(sessionId: string): string {
    return join(this.sessionsDir, sessionId);
  }

  // ==================== Status Methods ====================

  /**
   * Writes the worker status to status.json
   */
  writeStatus(sessionId: string, status: WorkerStatus): void {
    const statusPath = join(this.sessionsDir, sessionId, 'status.json');
    this.writeJson(statusPath, status);
  }

  /**
   * Reads the worker status from status.json
   */
  readStatus(sessionId: string): WorkerStatus | null {
    const statusPath = join(this.sessionsDir, sessionId, 'status.json');
    return this.readJson<WorkerStatus>(statusPath);
  }

  // ==================== Checkpoint Methods ====================

  /**
   * Writes an active checkpoint to checkpoint.json
   */
  writeCheckpoint(sessionId: string, checkpoint: PersistedCheckpoint): void {
    const checkpointPath = join(this.sessionsDir, sessionId, 'checkpoint.json');
    this.writeJson(checkpointPath, checkpoint);
  }

  /**
   * Reads the active checkpoint from checkpoint.json
   */
  readCheckpoint(sessionId: string): PersistedCheckpoint | null {
    const checkpointPath = join(this.sessionsDir, sessionId, 'checkpoint.json');
    return this.readJson<PersistedCheckpoint>(checkpointPath);
  }

  /**
   * Removes the checkpoint file (after it's been handled)
   */
  clearCheckpoint(sessionId: string): void {
    const checkpointPath = join(this.sessionsDir, sessionId, 'checkpoint.json');
    if (existsSync(checkpointPath)) {
      rmSync(checkpointPath);
    }
  }

  /**
   * Writes the checkpoint response to checkpoint_response.json
   */
  writeCheckpointResponse(sessionId: string, response: PersistedCheckpointResponse): void {
    const responsePath = join(this.sessionsDir, sessionId, 'checkpoint_response.json');
    this.writeJson(responsePath, response);
  }

  /**
   * Reads the checkpoint response from checkpoint_response.json
   */
  readCheckpointResponse(sessionId: string): PersistedCheckpointResponse | null {
    const responsePath = join(this.sessionsDir, sessionId, 'checkpoint_response.json');
    return this.readJson<PersistedCheckpointResponse>(responsePath);
  }

  /**
   * Clears the checkpoint response file
   */
  clearCheckpointResponse(sessionId: string): void {
    const responsePath = join(this.sessionsDir, sessionId, 'checkpoint_response.json');
    if (existsSync(responsePath)) {
      rmSync(responsePath);
    }
  }

  // ==================== Result Methods ====================

  /**
   * Writes the execution result to result.json
   */
  writeResult(sessionId: string, result: ExecutionResult): void {
    const resultPath = join(this.sessionsDir, sessionId, 'result.json');
    this.writeJson(resultPath, result);
  }

  /**
   * Reads the execution result from result.json
   */
  readResult(sessionId: string): ExecutionResult | null {
    const resultPath = join(this.sessionsDir, sessionId, 'result.json');
    return this.readJson<ExecutionResult>(resultPath);
  }

  // ==================== Dependency Graph Methods ====================

  /**
   * Reads the dependency graph state
   */
  readDependencyGraph(): DependencyGraphState | null {
    const graphPath = join(this.baseDir, 'dependency-graph.json');
    return this.readJson<DependencyGraphState>(graphPath);
  }

  /**
   * Writes the dependency graph state
   */
  writeDependencyGraph(state: DependencyGraphState): void {
    const graphPath = join(this.baseDir, 'dependency-graph.json');
    this.writeJson(graphPath, state);
  }

  /**
   * Updates the dependency graph with new status
   */
  updateDependencyGraph(updates: Partial<DependencyGraphState>): void {
    const current = this.readDependencyGraph();
    if (current) {
      const updated: DependencyGraphState = {
        ...current,
        ...updates,
        timestamp: new Date().toISOString(),
      };
      this.writeDependencyGraph(updated);
    }
  }

  // ==================== Active Files Methods ====================

  /**
   * Reads the active files state
   */
  readActiveFiles(): ActiveFilesState | null {
    const activePath = join(this.baseDir, 'active-files.json');
    return this.readJson<ActiveFilesState>(activePath);
  }

  /**
   * Writes the active files state
   */
  writeActiveFiles(state: ActiveFilesState): void {
    const activePath = join(this.baseDir, 'active-files.json');
    this.writeJson(activePath, state);
  }

  /**
   * Registers a file as being actively used by a session
   */
  registerActiveFile(
    path: string,
    sessionId: string,
    planId: string,
    operation: 'read' | 'write'
  ): void {
    const state = this.readActiveFiles() ?? { timestamp: '', files: [] };
    state.files.push({
      path,
      sessionId,
      planId,
      operation,
      startedAt: new Date().toISOString(),
    });
    state.timestamp = new Date().toISOString();
    this.writeActiveFiles(state);
  }

  /**
   * Unregisters all files for a session (when session completes)
   */
  unregisterSessionFiles(sessionId: string): void {
    const state = this.readActiveFiles();
    if (state) {
      state.files = state.files.filter((f) => f.sessionId !== sessionId);
      state.timestamp = new Date().toISOString();
      this.writeActiveFiles(state);
    }
  }

  /**
   * Checks if a file has a write conflict
   * Returns the conflicting session ID if there's a conflict, null otherwise
   */
  checkFileConflict(path: string, excludeSessionId?: string): string | null {
    const state = this.readActiveFiles();
    if (!state) return null;

    const conflict = state.files.find(
      (f) => f.path === path && f.operation === 'write' && f.sessionId !== excludeSessionId
    );

    return conflict?.sessionId ?? null;
  }

  // ==================== Config Methods ====================

  /**
   * Reads the orchestration config
   */
  readConfig(): OrchestrationConfig | null {
    const configPath = join(this.baseDir, 'config.yaml');
    return this.readYaml<OrchestrationConfig>(configPath);
  }

  /**
   * Writes the orchestration config
   */
  writeConfig(config: OrchestrationConfig): void {
    const configPath = join(this.baseDir, 'config.yaml');
    this.writeYaml(configPath, config);
  }

  // ==================== Recovery Methods ====================

  /**
   * Gets all session IDs that have protocol directories
   */
  listSessionDirs(): string[] {
    if (!existsSync(this.sessionsDir)) return [];

    const entries = readdirSync(this.sessionsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  }

  /**
   * Recovers state for all sessions that were running when the harness crashed
   */
  recoverSessions(): Array<{
    sessionId: string;
    status: WorkerStatus | null;
    checkpoint: PersistedCheckpoint | null;
    result: ExecutionResult | null;
  }> {
    const sessionIds = this.listSessionDirs();
    return sessionIds.map((sessionId) => ({
      sessionId,
      status: this.readStatus(sessionId),
      checkpoint: this.readCheckpoint(sessionId),
      result: this.readResult(sessionId),
    }));
  }

  // ==================== Helper Methods ====================

  private writeJson<T>(path: string, data: T): void {
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  }

  private readJson<T>(path: string): T | null {
    if (!existsSync(path)) return null;
    try {
      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private writeYaml<T>(path: string, data: T): void {
    // Simple YAML serialization for config
    const lines: string[] = [];
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (typeof value === 'string') {
        lines.push(`${key}: "${value}"`);
      } else if (typeof value === 'boolean') {
        lines.push(`${key}: ${value}`);
      } else if (typeof value === 'number') {
        lines.push(`${key}: ${value}`);
      }
    }
    writeFileSync(path, lines.join('\n'), 'utf-8');
  }

  private readYaml<T>(path: string): T | null {
    if (!existsSync(path)) return null;
    try {
      const content = readFileSync(path, 'utf-8');
      const result: Record<string, unknown> = {};
      for (const line of content.split('\n')) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match && match[1] && match[2]) {
          const key = match[1];
          const rawValue = match[2];
          let value: unknown = rawValue;
          // Parse strings
          if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
            value = rawValue.slice(1, -1);
          }
          // Parse booleans
          else if (rawValue === 'true') {
            value = true;
          } else if (rawValue === 'false') {
            value = false;
          }
          // Parse numbers
          else if (!isNaN(Number(rawValue))) {
            value = Number(rawValue);
          }
          result[key] = value;
        }
      }
      return result as T;
    } catch {
      return null;
    }
  }
}
