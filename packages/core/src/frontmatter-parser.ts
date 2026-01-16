/**
 * YAML Frontmatter Parser
 *
 * Parses and writes YAML frontmatter in markdown files.
 * Simple implementation for harness-specific frontmatter schemas.
 */

import type { RoadmapFrontmatter } from './types/roadmap-frontmatter.js';

/**
 * Extracts YAML frontmatter from markdown content.
 * Frontmatter must be between --- delimiters at the start of the file.
 *
 * @param content - Full markdown content
 * @returns Parsed frontmatter object or null if no frontmatter found
 */
export function parseFrontmatter<T = Record<string, unknown>>(content: string): T | null {
  // Frontmatter must start at the beginning of the file
  if (!content.startsWith('---')) {
    return null;
  }

  // Find the closing ---
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return null;
  }

  // Extract the YAML content
  const yamlContent = content.slice(4, endIndex);

  // Parse YAML (simple key: value parser)
  return parseYaml<T>(yamlContent);
}

/**
 * Extracts markdown content after frontmatter.
 *
 * @param content - Full markdown content with frontmatter
 * @returns Markdown content without frontmatter
 */
export function extractContentAfterFrontmatter(content: string): string {
  if (!content.startsWith('---')) {
    return content;
  }

  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return content;
  }

  // Return content after the closing --- (skip the newline after ---)
  return content.slice(endIndex + 4).trimStart();
}

/**
 * Creates frontmatter string from an object.
 *
 * @param data - Object to serialize as frontmatter
 * @returns YAML frontmatter string with --- delimiters
 */
export function createFrontmatter(data: Record<string, unknown>): string {
  const yaml = serializeYaml(data);
  return `---\n${yaml}---\n`;
}

/**
 * Updates frontmatter in existing markdown content.
 *
 * @param content - Full markdown content
 * @param updates - Partial updates to apply to frontmatter
 * @returns Updated markdown content
 */
export function updateFrontmatter<T extends Record<string, unknown>>(
  content: string,
  updates: Partial<T>
): string {
  const existing = parseFrontmatter<T>(content);
  const markdown = extractContentAfterFrontmatter(content);

  const newFrontmatter = {
    ...(existing ?? {}),
    ...updates,
  };

  return createFrontmatter(newFrontmatter) + '\n' + markdown;
}

/**
 * Parses ROADMAP.md frontmatter specifically.
 * Validates and returns typed RoadmapFrontmatter.
 *
 * @param content - Full ROADMAP.md content
 * @returns Parsed RoadmapFrontmatter or null
 */
export function parseRoadmapFrontmatter(content: string): RoadmapFrontmatter | null {
  const raw = parseFrontmatter<Record<string, unknown>>(content);
  if (!raw) return null;

  // Convert to typed frontmatter with defaults
  const frontmatter: RoadmapFrontmatter = {
    version: typeof raw.version === 'number' ? raw.version : 1,
    project: typeof raw.project === 'string' ? raw.project : '',
    milestone: typeof raw.milestone === 'string' ? raw.milestone : 'v1.0',
    current_phase: typeof raw.current_phase === 'number' ? raw.current_phase : 0,
    current_plan: typeof raw.current_plan === 'number' ? raw.current_plan : 0,
    status: isValidStatus(raw.status) ? raw.status : 'planning',
    total_phases: typeof raw.total_phases === 'number' ? raw.total_phases : 0,
    completed_phases: typeof raw.completed_phases === 'number' ? raw.completed_phases : 0,
    total_plans: typeof raw.total_plans === 'number' ? raw.total_plans : 0,
    completed_plans: typeof raw.completed_plans === 'number' ? raw.completed_plans : 0,
  };

  // Parse velocity if present
  if (raw.velocity && typeof raw.velocity === 'object') {
    const v = raw.velocity as Record<string, unknown>;
    frontmatter.velocity = {
      total_plans_completed:
        typeof v.total_plans_completed === 'number' ? v.total_plans_completed : 0,
      total_execution_minutes:
        typeof v.total_execution_minutes === 'number' ? v.total_execution_minutes : 0,
      average_minutes_per_plan:
        typeof v.average_minutes_per_plan === 'number' ? v.average_minutes_per_plan : 0,
    };
  }

  // Parse spec-centric fields if present
  if (typeof raw.spec_dir === 'string') {
    frontmatter.spec_dir = raw.spec_dir;
  }
  if (typeof raw.spec_id === 'string') {
    frontmatter.spec_id = raw.spec_id;
  }

  return frontmatter;
}

/**
 * Type guard for valid project status
 */
function isValidStatus(value: unknown): value is RoadmapFrontmatter['status'] {
  return (
    typeof value === 'string' &&
    ['planning', 'executing', 'verifying', 'blocked', 'complete'].includes(value)
  );
}

// ==================== Internal YAML Parser ====================

/**
 * Simple YAML parser for frontmatter.
 * Handles basic types: strings, numbers, booleans, and nested objects.
 */
function parseYaml<T>(yaml: string): T {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let nestedObject: Record<string, unknown> | null = null;

  for (const line of lines) {
    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      continue;
    }

    // Calculate indentation
    const indent = line.search(/\S/);

    // Check if this is a nested key (indented)
    if (indent > 0 && currentKey && nestedObject) {
      const nestedMatch = line.match(/^\s+(\w+):\s*(.*)$/);
      if (nestedMatch && nestedMatch[1]) {
        const key = nestedMatch[1];
        const value = nestedMatch[2]?.trim() ?? '';
        nestedObject[key] = parseYamlValue(value);
      }
      continue;
    }

    // If we were in a nested object and hit a non-indented line, save it
    if (nestedObject && currentKey && indent === 0) {
      result[currentKey] = nestedObject;
      nestedObject = null;
      currentKey = null;
    }

    // Parse top-level key: value
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match && match[1]) {
      const key = match[1];
      const value = match[2]?.trim() ?? '';

      // Check if this starts a nested object (value is empty)
      if (value === '') {
        currentKey = key;
        nestedObject = {};
      } else {
        result[key] = parseYamlValue(value);
        currentKey = null;
        nestedObject = null;
      }
    }
  }

  // Save any remaining nested object
  if (nestedObject && currentKey) {
    result[currentKey] = nestedObject;
  }

  return result as T;
}

/**
 * Parses a single YAML value.
 */
function parseYamlValue(value: string): unknown {
  // Empty string
  if (value === '') return '';

  // Quoted strings
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Booleans
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Null
  if (value === 'null' || value === '~') return null;

  // Numbers
  const num = Number(value);
  if (!isNaN(num) && value !== '') {
    return num;
  }

  // Default to string
  return value;
}

// ==================== Internal YAML Serializer ====================

/**
 * Serializes an object to YAML format.
 */
function serializeYaml(data: Record<string, unknown>, indent: number = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    if (value === null) {
      lines.push(`${prefix}${key}: null`);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      lines.push(serializeYaml(value as Record<string, unknown>, indent + 1));
    } else if (Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      for (const item of value) {
        if (typeof item === 'object') {
          lines.push(`${prefix}  -`);
          lines.push(serializeYaml(item as Record<string, unknown>, indent + 2));
        } else {
          lines.push(`${prefix}  - ${serializeYamlValue(item)}`);
        }
      }
    } else {
      lines.push(`${prefix}${key}: ${serializeYamlValue(value)}`);
    }
  }

  return lines.join('\n') + (indent === 0 ? '\n' : '');
}

/**
 * Serializes a single YAML value.
 */
function serializeYamlValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // Quote strings that contain special characters
    if (
      value.includes(':') ||
      value.includes('#') ||
      value.includes('\n') ||
      value.startsWith(' ') ||
      value.endsWith(' ')
    ) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}
