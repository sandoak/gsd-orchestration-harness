#!/usr/bin/env node

// Context File Size Checker
//
// Enforces UFC (User-First Context) best practices:
// - Warning if context files exceed 500 lines
// - Error if context files exceed 1000 lines
//
// Usage: node check-context-size.cjs [files...]
// Called automatically by lint-staged for context markdown files

const fs = require('fs');
const path = require('path');

const WARNING_THRESHOLD = 500;
const ERROR_THRESHOLD = 1000;

// ANSI color codes
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

let hasErrors = false;
let hasWarnings = false;

// Get files from command line arguments (passed by lint-staged)
const files = process.argv.slice(2);

if (files.length === 0) {
  console.log('No context files to check.');
  process.exit(0);
}

files.forEach((file) => {
  // Skip if file doesn't exist (might have been deleted)
  if (!fs.existsSync(file)) {
    return;
  }

  const content = fs.readFileSync(file, 'utf8');
  const lineCount = content.split('\n').length;
  const relativePath = path.relative(process.cwd(), file);

  if (lineCount > ERROR_THRESHOLD) {
    console.error(
      `${RED}ERROR: ${relativePath} is ${lineCount} lines (max ${ERROR_THRESHOLD})${RESET}`
    );
    console.error(`  This file is too large and must be split.`);
    console.error(`  Consider using the hub-and-spoke pattern:`);
    console.error(`    1. Keep overview and navigation in the hub (CLAUDE.md)`);
    console.error(`    2. Move detailed content to spoke files (topic.md)`);
    console.error(`    3. Link from hub to spokes`);
    hasErrors = true;
  } else if (lineCount > WARNING_THRESHOLD) {
    console.warn(
      `${YELLOW}WARNING: ${relativePath} is ${lineCount} lines (target <${WARNING_THRESHOLD})${RESET}`
    );
    console.warn(`  Consider splitting this file to improve maintainability.`);
    hasWarnings = true;
  }
});

// Final summary
if (hasErrors) {
  console.error(`\n${RED}✗ Context size check FAILED${RESET}`);
  console.error(`  Files exceeding ${ERROR_THRESHOLD} lines must be split before committing.`);
  process.exit(1);
}

if (hasWarnings) {
  console.warn(`\n${YELLOW}⚠ Context size check passed with warnings${RESET}`);
  console.warn(`  Consider refactoring files over ${WARNING_THRESHOLD} lines.`);
} else {
  console.log(`${GREEN}✓ Context size check passed${RESET}`);
}

process.exit(0);
