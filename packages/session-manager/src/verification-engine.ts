/**
 * Verification Engine
 *
 * Executes verification specs and produces verification reports.
 * Handles three categories:
 * - auto: Run directly via Node.js
 * - playwright: Run via Playwright MCP or direct API
 * - human: Queue for human review via orchestrator messages
 *
 * The engine is designed to be called by the orchestrator after plan execution.
 */

import { exec } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { promisify } from 'node:util';

import type {
  VerificationSpec,
  VerificationResult,
  VerificationReport,
  PlanVerificationManifest,
  FileExistsSpec,
  FileContainsSpec,
  FileNotContainsSpec,
  CommandSucceedsSpec,
  CommandOutputSpec,
  BuildSucceedsSpec,
  TestsPassSpec,
  TypeCheckSpec,
  LintCleanSpec,
  JsonValidSpec,
  EnvVarSetSpec,
  PortAvailableSpec,
} from '@gsd/core';
import { getVerificationCategory, getDefaultTimeout, filterByCategory } from '@gsd/core';

const execAsync = promisify(exec);

/**
 * Options for the verification engine
 */
export interface VerificationEngineOptions {
  /** Project root directory */
  projectRoot: string;
  /** API base URL for api_response verifications */
  apiBaseUrl?: string;
  /** UI base URL for Playwright verifications */
  uiBaseUrl?: string;
  /** Global timeout override */
  timeout?: number;
  /** Callback for progress updates */
  onProgress?: (result: VerificationResult) => void;
  /** Callback to request human verification */
  onHumanRequired?: (spec: VerificationSpec) => Promise<VerificationResult>;
  /** Callback to run Playwright verification */
  onPlaywrightRequired?: (spec: VerificationSpec) => Promise<VerificationResult>;
}

/**
 * Verification Engine - runs verification specs and produces reports
 */
export class VerificationEngine {
  private readonly options: VerificationEngineOptions;

  constructor(options: VerificationEngineOptions) {
    this.options = options;
  }

  /**
   * Run all verifications in a manifest and produce a report
   */
  async verify(manifest: PlanVerificationManifest): Promise<VerificationReport> {
    const startedAt = new Date().toISOString();
    const results: VerificationResult[] = [];

    // Combine must_pass and should_pass specs
    const allSpecs = [...manifest.must_pass, ...(manifest.should_pass ?? [])];

    // Run verifications by category for efficiency
    const autoSpecs = filterByCategory(allSpecs, 'auto');
    const playwrightSpecs = filterByCategory(allSpecs, 'playwright');
    const humanSpecs = filterByCategory(allSpecs, 'human');

    // Run auto verifications (can run in parallel)
    const autoResults = await Promise.all(autoSpecs.map((spec) => this.runAutoVerification(spec)));
    results.push(...autoResults);

    // Run Playwright verifications
    for (const spec of playwrightSpecs) {
      const result = await this.runPlaywrightVerification(spec);
      results.push(result);
      this.options.onProgress?.(result);
    }

    // Queue human verifications
    for (const spec of humanSpecs) {
      const result = await this.runHumanVerification(spec);
      results.push(result);
      this.options.onProgress?.(result);
    }

    const completedAt = new Date().toISOString();
    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    // Determine overall pass/fail (only must_pass specs affect this)
    const mustPassIds = new Set(manifest.must_pass.map((s) => s.id));
    const criticalResults = results.filter((r) => mustPassIds.has(r.specId));
    const passed = criticalResults.every((r) => r.passed);

    return {
      target: 'plan', // Caller should update this
      passed,
      total: results.length,
      passedCount,
      failedCount,
      skippedCount: 0,
      results,
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };
  }

  /**
   * Run a single auto verification
   */
  private async runAutoVerification(spec: VerificationSpec): Promise<VerificationResult> {
    const startTime = Date.now();
    const timeout = spec.timeout ?? getDefaultTimeout(spec.type);

    try {
      switch (spec.type) {
        case 'file_exists':
          return this.verifyFileExists(spec as FileExistsSpec, startTime);
        case 'file_contains':
          return this.verifyFileContains(spec as FileContainsSpec, startTime);
        case 'file_not_contains':
          return this.verifyFileNotContains(spec as FileNotContainsSpec, startTime);
        case 'command_succeeds':
          return await this.verifyCommandSucceeds(spec as CommandSucceedsSpec, startTime, timeout);
        case 'command_output':
          return await this.verifyCommandOutput(spec as CommandOutputSpec, startTime, timeout);
        case 'build_succeeds':
          return await this.verifyBuildSucceeds(spec as BuildSucceedsSpec, startTime, timeout);
        case 'tests_pass':
          return await this.verifyTestsPass(spec as TestsPassSpec, startTime, timeout);
        case 'type_check':
          return await this.verifyTypeCheck(spec as TypeCheckSpec, startTime, timeout);
        case 'lint_clean':
          return await this.verifyLintClean(spec as LintCleanSpec, startTime, timeout);
        case 'json_valid':
          return this.verifyJsonValid(spec as JsonValidSpec, startTime);
        case 'env_var_set':
          return this.verifyEnvVarSet(spec as EnvVarSetSpec, startTime);
        case 'port_available':
          return await this.verifyPortAvailable(spec as PortAvailableSpec, startTime);
        default:
          return this.createResult(
            spec,
            false,
            startTime,
            `Unknown auto verification type: ${spec.type}`
          );
      }
    } catch (error) {
      return this.createResult(
        spec,
        false,
        startTime,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Run a Playwright verification
   */
  private async runPlaywrightVerification(spec: VerificationSpec): Promise<VerificationResult> {
    const startTime = Date.now();

    if (this.options.onPlaywrightRequired) {
      return this.options.onPlaywrightRequired(spec);
    }

    // No Playwright handler provided - mark as skipped
    return this.createResult(
      spec,
      false,
      startTime,
      'Playwright verification handler not provided',
      undefined,
      'playwright'
    );
  }

  /**
   * Run a human verification
   */
  private async runHumanVerification(spec: VerificationSpec): Promise<VerificationResult> {
    const startTime = Date.now();

    if (this.options.onHumanRequired) {
      return this.options.onHumanRequired(spec);
    }

    // No human handler provided - mark as requiring human
    return this.createResult(
      spec,
      false,
      startTime,
      'Human verification required',
      undefined,
      'human'
    );
  }

  // ==================== Auto Verification Implementations ====================

  private verifyFileExists(spec: FileExistsSpec, startTime: number): VerificationResult {
    const fullPath = this.resolvePath(spec.path);
    const exists = existsSync(fullPath);

    return this.createResult(
      spec,
      exists,
      startTime,
      exists ? undefined : `File not found: ${spec.path}`,
      `Checked: ${fullPath}`
    );
  }

  private verifyFileContains(spec: FileContainsSpec, startTime: number): VerificationResult {
    const fullPath = this.resolvePath(spec.path);

    if (!existsSync(fullPath)) {
      return this.createResult(spec, false, startTime, `File not found: ${spec.path}`);
    }

    const content = readFileSync(fullPath, 'utf-8');
    const pattern = spec.regex ? new RegExp(spec.pattern) : spec.pattern;
    const found = spec.regex
      ? (pattern as RegExp).test(content)
      : content.includes(pattern as string);

    return this.createResult(
      spec,
      found,
      startTime,
      found ? undefined : `Pattern not found in ${spec.path}: ${spec.pattern}`
    );
  }

  private verifyFileNotContains(spec: FileNotContainsSpec, startTime: number): VerificationResult {
    const fullPath = this.resolvePath(spec.path);

    if (!existsSync(fullPath)) {
      return this.createResult(spec, false, startTime, `File not found: ${spec.path}`);
    }

    const content = readFileSync(fullPath, 'utf-8');
    const pattern = spec.regex ? new RegExp(spec.pattern) : spec.pattern;
    const found = spec.regex
      ? (pattern as RegExp).test(content)
      : content.includes(pattern as string);

    return this.createResult(
      spec,
      !found,
      startTime,
      !found ? undefined : `Unwanted pattern found in ${spec.path}: ${spec.pattern}`
    );
  }

  private async verifyCommandSucceeds(
    spec: CommandSucceedsSpec,
    startTime: number,
    timeout: number
  ): Promise<VerificationResult> {
    const cwd = spec.cwd ? this.resolvePath(spec.cwd) : this.options.projectRoot;

    try {
      const { stdout, stderr } = await execAsync(spec.command, {
        cwd,
        timeout,
        env: { ...process.env, ...spec.env },
      });

      return this.createResult(
        spec,
        true,
        startTime,
        undefined,
        `stdout: ${stdout}\nstderr: ${stderr}`
      );
    } catch (error) {
      const execError = error as { code?: number; stdout?: string; stderr?: string };
      return this.createResult(
        spec,
        false,
        startTime,
        `Command failed with code ${execError.code}`,
        `stdout: ${execError.stdout}\nstderr: ${execError.stderr}`
      );
    }
  }

  private async verifyCommandOutput(
    spec: CommandOutputSpec,
    startTime: number,
    timeout: number
  ): Promise<VerificationResult> {
    const cwd = spec.cwd ? this.resolvePath(spec.cwd) : this.options.projectRoot;

    try {
      const { stdout, stderr } = await execAsync(spec.command, {
        cwd,
        timeout,
        env: { ...process.env, ...spec.env },
      });

      const output =
        spec.stream === 'stderr' ? stderr : spec.stream === 'combined' ? stdout + stderr : stdout;

      const pattern = spec.regex ? new RegExp(spec.expects) : spec.expects;
      const matches = spec.regex
        ? (pattern as RegExp).test(output)
        : output.includes(pattern as string);

      return this.createResult(
        spec,
        matches,
        startTime,
        matches ? undefined : `Output did not match: ${spec.expects}`,
        output
      );
    } catch (error) {
      const execError = error as { message?: string };
      return this.createResult(spec, false, startTime, execError.message);
    }
  }

  private async verifyBuildSucceeds(
    spec: BuildSucceedsSpec,
    startTime: number,
    timeout: number
  ): Promise<VerificationResult> {
    const command = spec.command ?? 'npm run build';
    const cwd = spec.cwd ? this.resolvePath(spec.cwd) : this.options.projectRoot;

    try {
      const { stdout, stderr } = await execAsync(command, { cwd, timeout });
      return this.createResult(
        spec,
        true,
        startTime,
        undefined,
        `stdout: ${stdout}\nstderr: ${stderr}`
      );
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string };
      return this.createResult(
        spec,
        false,
        startTime,
        'Build failed',
        `stdout: ${execError.stdout}\nstderr: ${execError.stderr}`
      );
    }
  }

  private async verifyTestsPass(
    spec: TestsPassSpec,
    startTime: number,
    timeout: number
  ): Promise<VerificationResult> {
    let command = spec.command ?? 'npm test';
    if (spec.testPattern) {
      command += ` -- ${spec.testPattern}`;
    }
    const cwd = spec.cwd ? this.resolvePath(spec.cwd) : this.options.projectRoot;

    try {
      const { stdout, stderr } = await execAsync(command, { cwd, timeout });
      return this.createResult(
        spec,
        true,
        startTime,
        undefined,
        `stdout: ${stdout}\nstderr: ${stderr}`
      );
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string };
      return this.createResult(
        spec,
        false,
        startTime,
        'Tests failed',
        `stdout: ${execError.stdout}\nstderr: ${execError.stderr}`
      );
    }
  }

  private async verifyTypeCheck(
    spec: TypeCheckSpec,
    startTime: number,
    timeout: number
  ): Promise<VerificationResult> {
    const tsconfigArg = spec.tsconfig ? ` -p ${spec.tsconfig}` : '';
    const command = `npx tsc --noEmit${tsconfigArg}`;
    const cwd = spec.cwd ? this.resolvePath(spec.cwd) : this.options.projectRoot;

    try {
      const { stdout, stderr } = await execAsync(command, { cwd, timeout });
      return this.createResult(
        spec,
        true,
        startTime,
        undefined,
        `stdout: ${stdout}\nstderr: ${stderr}`
      );
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string };
      return this.createResult(
        spec,
        false,
        startTime,
        'Type check failed',
        `stdout: ${execError.stdout}\nstderr: ${execError.stderr}`
      );
    }
  }

  private async verifyLintClean(
    spec: LintCleanSpec,
    startTime: number,
    timeout: number
  ): Promise<VerificationResult> {
    let command = spec.command ?? 'npm run lint';
    if (spec.files?.length) {
      command += ` -- ${spec.files.join(' ')}`;
    }
    const cwd = spec.cwd ? this.resolvePath(spec.cwd) : this.options.projectRoot;

    try {
      const { stdout, stderr } = await execAsync(command, { cwd, timeout });
      return this.createResult(
        spec,
        true,
        startTime,
        undefined,
        `stdout: ${stdout}\nstderr: ${stderr}`
      );
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string };
      return this.createResult(
        spec,
        false,
        startTime,
        'Lint errors found',
        `stdout: ${execError.stdout}\nstderr: ${execError.stderr}`
      );
    }
  }

  private verifyJsonValid(spec: JsonValidSpec, startTime: number): VerificationResult {
    const fullPath = this.resolvePath(spec.path);

    if (!existsSync(fullPath)) {
      return this.createResult(spec, false, startTime, `File not found: ${spec.path}`);
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      JSON.parse(content);
      // TODO: Add JSON schema validation if spec.schema provided
      return this.createResult(spec, true, startTime);
    } catch (error) {
      return this.createResult(
        spec,
        false,
        startTime,
        `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private verifyEnvVarSet(spec: EnvVarSetSpec, startTime: number): VerificationResult {
    const value = process.env[spec.name];
    const exists = value !== undefined;

    if (!exists) {
      return this.createResult(
        spec,
        false,
        startTime,
        `Environment variable not set: ${spec.name}`
      );
    }

    if (spec.value !== undefined && value !== spec.value) {
      return this.createResult(
        spec,
        false,
        startTime,
        `Environment variable ${spec.name} has wrong value: expected "${spec.value}", got "${value}"`
      );
    }

    return this.createResult(spec, true, startTime);
  }

  private async verifyPortAvailable(
    spec: PortAvailableSpec,
    startTime: number
  ): Promise<VerificationResult> {
    const checkAvailable = spec.available !== false;

    try {
      // Use lsof or netstat to check port
      const command =
        process.platform === 'win32'
          ? `netstat -an | findstr :${spec.port}`
          : `lsof -i :${spec.port}`;

      try {
        await execAsync(command, { timeout: 5000 });
        // Command succeeded = port is in use
        const passed = !checkAvailable;
        return this.createResult(
          spec,
          passed,
          startTime,
          passed ? undefined : `Port ${spec.port} is in use`
        );
      } catch {
        // Command failed = port is available
        const passed = checkAvailable;
        return this.createResult(
          spec,
          passed,
          startTime,
          passed ? undefined : `Port ${spec.port} is not in use`
        );
      }
    } catch (error) {
      return this.createResult(
        spec,
        false,
        startTime,
        `Failed to check port: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ==================== Helpers ====================

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(this.options.projectRoot, path);
  }

  private createResult(
    spec: VerificationSpec,
    passed: boolean,
    startTime: number,
    error?: string,
    output?: string,
    verifiedBy?: 'auto' | 'playwright' | 'human'
  ): VerificationResult {
    const category = getVerificationCategory(spec.type);
    return {
      specId: spec.id,
      type: spec.type,
      passed,
      error,
      output,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      verifiedBy: verifiedBy ?? (category as 'auto' | 'playwright' | 'human'),
    };
  }
}

/**
 * Parse verification manifest from PLAN.md frontmatter
 */
export function parseVerificationManifest(
  frontmatter: Record<string, unknown>
): PlanVerificationManifest | null {
  if (!frontmatter.must_pass || !Array.isArray(frontmatter.must_pass)) {
    return null;
  }

  return {
    must_pass: frontmatter.must_pass as VerificationSpec[],
    should_pass: (frontmatter.should_pass as VerificationSpec[] | undefined) ?? undefined,
    api_base_url: frontmatter.api_base_url as string | undefined,
    ui_base_url: frontmatter.ui_base_url as string | undefined,
    timeout: frontmatter.timeout as number | undefined,
  };
}
