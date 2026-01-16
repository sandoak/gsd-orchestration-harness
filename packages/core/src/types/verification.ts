/**
 * Verification Types for Harness Orchestrator
 *
 * Defines structured verification specifications that can be embedded in PLAN.md
 * frontmatter. These specs enable automated verification after plan execution.
 *
 * Three categories:
 * 1. Fully automatable - Can run without human or browser
 * 2. Playwright automatable - Requires browser automation
 * 3. Human required - Cannot be automated, needs human judgment
 */

/**
 * Verification categories for routing
 */
export type VerificationCategory = 'auto' | 'playwright' | 'human';

/**
 * All verification types
 */
export type VerificationType =
  // Fully automatable (no browser, no human)
  | 'file_exists' // Check if a file exists
  | 'file_contains' // Check if file contains text/pattern
  | 'file_not_contains' // Check file doesn't contain text/pattern
  | 'command_succeeds' // Run command, check exit code 0
  | 'command_output' // Run command, check output matches
  | 'api_response' // HTTP request, check response
  | 'build_succeeds' // Run build command, check success
  | 'tests_pass' // Run test command, check all pass
  | 'type_check' // Run TypeScript type check
  | 'lint_clean' // Run linter, check no errors
  | 'json_valid' // Check JSON file is valid
  | 'env_var_set' // Check environment variable is set
  | 'port_available' // Check port is available/in-use
  | 'process_running' // Check process is running
  // Playwright automatable (requires browser)
  | 'ui_element_exists' // Check element exists on page
  | 'ui_element_text' // Check element has specific text
  | 'ui_element_visible' // Check element is visible
  | 'ui_element_enabled' // Check element is enabled/clickable
  | 'ui_navigation' // Click element, verify navigation
  | 'ui_form_submit' // Fill form, submit, check result
  | 'ui_screenshot_match' // Compare screenshot to baseline
  | 'ui_no_console_errors' // Check no console errors on page
  | 'ui_accessibility' // Run accessibility audit
  // Human required (cannot automate)
  | 'visual_quality' // Human judges visual appearance
  | 'ux_flow' // Human judges user experience flow
  | 'content_review' // Human reviews content quality
  | 'security_review'; // Human reviews security implications

/**
 * Maps verification types to categories
 */
export const VERIFICATION_CATEGORIES: Record<VerificationType, VerificationCategory> = {
  // Auto
  file_exists: 'auto',
  file_contains: 'auto',
  file_not_contains: 'auto',
  command_succeeds: 'auto',
  command_output: 'auto',
  api_response: 'auto',
  build_succeeds: 'auto',
  tests_pass: 'auto',
  type_check: 'auto',
  lint_clean: 'auto',
  json_valid: 'auto',
  env_var_set: 'auto',
  port_available: 'auto',
  process_running: 'auto',
  // Playwright
  ui_element_exists: 'playwright',
  ui_element_text: 'playwright',
  ui_element_visible: 'playwright',
  ui_element_enabled: 'playwright',
  ui_navigation: 'playwright',
  ui_form_submit: 'playwright',
  ui_screenshot_match: 'playwright',
  ui_no_console_errors: 'playwright',
  ui_accessibility: 'playwright',
  // Human
  visual_quality: 'human',
  ux_flow: 'human',
  content_review: 'human',
  security_review: 'human',
};

// ==================== Verification Spec Interfaces ====================

/**
 * Base verification spec (all specs have these fields)
 */
export interface BaseVerificationSpec {
  /** Unique identifier within the plan */
  id: string;
  /** Human-readable description */
  description?: string;
  /** Verification type */
  type: VerificationType;
  /** Whether this is a critical verification (blocks progress if fails) */
  critical?: boolean;
  /** Timeout in milliseconds (default varies by type) */
  timeout?: number;
  /** Number of retry attempts on failure */
  retries?: number;
}

// ==================== Auto Verification Specs ====================

export interface FileExistsSpec extends BaseVerificationSpec {
  type: 'file_exists';
  /** Path to file (relative to project root) */
  path: string;
}

export interface FileContainsSpec extends BaseVerificationSpec {
  type: 'file_contains';
  /** Path to file */
  path: string;
  /** Text or regex pattern to find */
  pattern: string;
  /** Whether pattern is a regex */
  regex?: boolean;
}

export interface FileNotContainsSpec extends BaseVerificationSpec {
  type: 'file_not_contains';
  /** Path to file */
  path: string;
  /** Text or regex pattern that should NOT exist */
  pattern: string;
  /** Whether pattern is a regex */
  regex?: boolean;
}

export interface CommandSucceedsSpec extends BaseVerificationSpec {
  type: 'command_succeeds';
  /** Command to run */
  command: string;
  /** Working directory (relative to project root) */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

export interface CommandOutputSpec extends BaseVerificationSpec {
  type: 'command_output';
  /** Command to run */
  command: string;
  /** Expected output (text or regex) */
  expects: string;
  /** Whether expects is a regex */
  regex?: boolean;
  /** Match stdout, stderr, or combined */
  stream?: 'stdout' | 'stderr' | 'combined';
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

export interface ApiResponseSpec extends BaseVerificationSpec {
  type: 'api_response';
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** URL or path (paths resolved relative to base URL) */
  url: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (for POST/PUT/PATCH) */
  body?: unknown;
  /** Expected response */
  expects: {
    /** Expected status code */
    status?: number;
    /** Expected headers (partial match) */
    headers?: Record<string, string>;
    /** Expected body (exact match, partial, or regex) */
    body?: unknown;
    /** Body match mode */
    bodyMatch?: 'exact' | 'partial' | 'regex';
  };
}

export interface BuildSucceedsSpec extends BaseVerificationSpec {
  type: 'build_succeeds';
  /** Build command (default: npm run build) */
  command?: string;
  /** Working directory */
  cwd?: string;
}

export interface TestsPassSpec extends BaseVerificationSpec {
  type: 'tests_pass';
  /** Test command (default: npm test) */
  command?: string;
  /** Specific test file or pattern */
  testPattern?: string;
  /** Working directory */
  cwd?: string;
}

export interface TypeCheckSpec extends BaseVerificationSpec {
  type: 'type_check';
  /** TypeScript config path */
  tsconfig?: string;
  /** Working directory */
  cwd?: string;
}

export interface LintCleanSpec extends BaseVerificationSpec {
  type: 'lint_clean';
  /** Lint command (default: npm run lint) */
  command?: string;
  /** Specific files to lint */
  files?: string[];
  /** Working directory */
  cwd?: string;
}

export interface JsonValidSpec extends BaseVerificationSpec {
  type: 'json_valid';
  /** Path to JSON file */
  path: string;
  /** Optional JSON schema to validate against */
  schema?: object;
}

export interface EnvVarSetSpec extends BaseVerificationSpec {
  type: 'env_var_set';
  /** Environment variable name */
  name: string;
  /** Expected value (optional, just checks existence if omitted) */
  value?: string;
}

export interface PortAvailableSpec extends BaseVerificationSpec {
  type: 'port_available';
  /** Port number */
  port: number;
  /** Whether port should be available (true) or in use (false) */
  available?: boolean;
}

export interface ProcessRunningSpec extends BaseVerificationSpec {
  type: 'process_running';
  /** Process name or pattern */
  process: string;
  /** Whether process should be running (true) or not (false) */
  running?: boolean;
}

// ==================== Playwright Verification Specs ====================

export interface UiElementExistsSpec extends BaseVerificationSpec {
  type: 'ui_element_exists';
  /** Page URL */
  url: string;
  /** Element selector (CSS or Playwright locator) */
  selector: string;
  /** Wait for element timeout */
  waitTimeout?: number;
}

export interface UiElementTextSpec extends BaseVerificationSpec {
  type: 'ui_element_text';
  /** Page URL */
  url: string;
  /** Element selector */
  selector: string;
  /** Expected text content */
  text: string;
  /** Text match mode */
  match?: 'exact' | 'contains' | 'regex';
}

export interface UiElementVisibleSpec extends BaseVerificationSpec {
  type: 'ui_element_visible';
  /** Page URL */
  url: string;
  /** Element selector */
  selector: string;
  /** Whether element should be visible (true) or hidden (false) */
  visible?: boolean;
}

export interface UiElementEnabledSpec extends BaseVerificationSpec {
  type: 'ui_element_enabled';
  /** Page URL */
  url: string;
  /** Element selector */
  selector: string;
  /** Whether element should be enabled (true) or disabled (false) */
  enabled?: boolean;
}

export interface UiNavigationSpec extends BaseVerificationSpec {
  type: 'ui_navigation';
  /** Starting URL */
  url: string;
  /** Element to click */
  clickSelector: string;
  /** Expected URL after navigation (can be partial or regex) */
  expectUrl: string;
  /** URL match mode */
  urlMatch?: 'exact' | 'contains' | 'regex';
}

export interface UiFormSubmitSpec extends BaseVerificationSpec {
  type: 'ui_form_submit';
  /** Form page URL */
  url: string;
  /** Form fields to fill */
  fields: Array<{
    selector: string;
    value: string;
    type?: 'text' | 'select' | 'checkbox' | 'radio';
  }>;
  /** Submit button selector */
  submitSelector: string;
  /** Expected result after submit */
  expects: {
    /** Expected URL after submit */
    url?: string;
    /** Expected element on success page */
    successSelector?: string;
    /** Expected error selector (should NOT appear) */
    errorSelector?: string;
  };
}

export interface UiScreenshotMatchSpec extends BaseVerificationSpec {
  type: 'ui_screenshot_match';
  /** Page URL */
  url: string;
  /** Baseline screenshot path */
  baseline: string;
  /** Element to screenshot (full page if omitted) */
  selector?: string;
  /** Allowed pixel difference percentage */
  threshold?: number;
}

export interface UiNoConsoleErrorsSpec extends BaseVerificationSpec {
  type: 'ui_no_console_errors';
  /** Page URL */
  url: string;
  /** Actions to perform before checking */
  actions?: Array<{
    type: 'click' | 'type' | 'wait';
    selector?: string;
    value?: string;
    timeout?: number;
  }>;
  /** Ignore patterns (console errors matching these are OK) */
  ignorePatterns?: string[];
}

export interface UiAccessibilitySpec extends BaseVerificationSpec {
  type: 'ui_accessibility';
  /** Page URL */
  url: string;
  /** Accessibility rules to check */
  rules?: string[];
  /** Minimum passing score (0-100) */
  minScore?: number;
}

// ==================== Human Verification Specs ====================

export interface VisualQualitySpec extends BaseVerificationSpec {
  type: 'visual_quality';
  /** What to review */
  target: string;
  /** Specific aspects to check */
  aspects?: string[];
  /** Reference design or screenshot */
  reference?: string;
}

export interface UxFlowSpec extends BaseVerificationSpec {
  type: 'ux_flow';
  /** Flow to test */
  flow: string;
  /** Steps to perform */
  steps: string[];
  /** Expected outcome */
  expectedOutcome: string;
}

export interface ContentReviewSpec extends BaseVerificationSpec {
  type: 'content_review';
  /** Content location */
  location: string;
  /** Review criteria */
  criteria: string[];
}

export interface SecurityReviewSpec extends BaseVerificationSpec {
  type: 'security_review';
  /** What to review */
  target: string;
  /** Security concerns to check */
  concerns: string[];
}

// ==================== Union Type ====================

/**
 * All verification specs
 */
export type VerificationSpec =
  // Auto
  | FileExistsSpec
  | FileContainsSpec
  | FileNotContainsSpec
  | CommandSucceedsSpec
  | CommandOutputSpec
  | ApiResponseSpec
  | BuildSucceedsSpec
  | TestsPassSpec
  | TypeCheckSpec
  | LintCleanSpec
  | JsonValidSpec
  | EnvVarSetSpec
  | PortAvailableSpec
  | ProcessRunningSpec
  // Playwright
  | UiElementExistsSpec
  | UiElementTextSpec
  | UiElementVisibleSpec
  | UiElementEnabledSpec
  | UiNavigationSpec
  | UiFormSubmitSpec
  | UiScreenshotMatchSpec
  | UiNoConsoleErrorsSpec
  | UiAccessibilitySpec
  // Human
  | VisualQualitySpec
  | UxFlowSpec
  | ContentReviewSpec
  | SecurityReviewSpec;

// ==================== Results ====================

/**
 * Result of running a verification
 */
export interface VerificationResult {
  /** Spec that was verified */
  specId: string;
  /** Verification type */
  type: VerificationType;
  /** Whether it passed */
  passed: boolean;
  /** Error message if failed */
  error?: string;
  /** Detailed output */
  output?: string;
  /** Duration in milliseconds */
  duration: number;
  /** Timestamp */
  timestamp: string;
  /** For human verifications, who verified */
  verifiedBy?: 'auto' | 'playwright' | 'human';
  /** Human verification notes */
  notes?: string;
}

/**
 * Plan verification manifest (from PLAN.md frontmatter)
 */
export interface PlanVerificationManifest {
  /** Verifications that must pass to consider plan complete */
  must_pass: VerificationSpec[];
  /** Optional verifications (run but don't block) */
  should_pass?: VerificationSpec[];
  /** Base URL for API verifications */
  api_base_url?: string;
  /** Base URL for UI verifications */
  ui_base_url?: string;
  /** Global timeout for all verifications */
  timeout?: number;
}

/**
 * Phase verification manifest
 */
export interface PhaseVerificationManifest {
  /** Phase-level verifications (integration tests) */
  must_pass: VerificationSpec[];
  /** Optional phase verifications */
  should_pass?: VerificationSpec[];
  /** Base URLs */
  api_base_url?: string;
  ui_base_url?: string;
}

/**
 * Complete verification report for a plan or phase
 */
export interface VerificationReport {
  /** Plan or phase identifier */
  target: string;
  /** Overall result */
  passed: boolean;
  /** Total verifications run */
  total: number;
  /** Number passed */
  passedCount: number;
  /** Number failed */
  failedCount: number;
  /** Number skipped */
  skippedCount: number;
  /** Individual results */
  results: VerificationResult[];
  /** Start time */
  startedAt: string;
  /** End time */
  completedAt: string;
  /** Total duration */
  durationMs: number;
}

// ==================== Helper Functions ====================

/**
 * Get category for a verification type
 */
export function getVerificationCategory(type: VerificationType): VerificationCategory {
  return VERIFICATION_CATEGORIES[type];
}

/**
 * Check if a verification spec requires Playwright
 */
export function requiresPlaywright(spec: VerificationSpec): boolean {
  return getVerificationCategory(spec.type) === 'playwright';
}

/**
 * Check if a verification spec requires human judgment
 */
export function requiresHuman(spec: VerificationSpec): boolean {
  return getVerificationCategory(spec.type) === 'human';
}

/**
 * Filter specs by category
 */
export function filterByCategory(
  specs: VerificationSpec[],
  category: VerificationCategory
): VerificationSpec[] {
  return specs.filter((spec) => getVerificationCategory(spec.type) === category);
}

/**
 * Get default timeout for a verification type
 */
export function getDefaultTimeout(type: VerificationType): number {
  switch (getVerificationCategory(type)) {
    case 'auto':
      // Most auto checks are fast, but builds/tests need more time
      if (type === 'build_succeeds') return 300000; // 5 min
      if (type === 'tests_pass') return 600000; // 10 min
      if (type === 'api_response') return 30000; // 30 sec
      return 60000; // 1 min default
    case 'playwright':
      // UI checks need time for page loads and interactions
      return 60000; // 1 min
    case 'human':
      // Human checks have no timeout (orchestrator handles)
      return 0;
    default:
      return 60000;
  }
}
