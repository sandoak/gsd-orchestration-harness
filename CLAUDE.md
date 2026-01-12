# CLAUDE.md

This file provides guidance to Claude Code when working with the GSD Orchestration Harness repository.

## Context System

This project uses the **UFC (User-First Context) system** with hub-and-spoke architecture for progressive disclosure. This file should remain concise (~250 lines max). Detailed documentation lives in `/context/` subdirectories.

**Context Navigation**: See `/context/CLAUDE.md` for full documentation structure.

## Project Overview

GSD Orchestration Harness - [Add project description here]

**Tech Stack**:

- Node.js >=22.0.0 <25.0.0 / TypeScript 5.x (strict mode)
- Vitest for testing
- ESLint + Prettier for code quality

**Node Version Note**: Exclude Node.js v25 due to glob pattern bug in JSDoc. Use `>=22.0.0 <25.0.0` in engines.

## Code Quality Standards

### Fix Problems Properly

- **Never take shortcuts** - Address root causes, not symptoms
- **Don't paper over issues** - If something is broken, fix it correctly
- **No quick hacks** - Temporary fixes become permanent technical debt
- **Understand before fixing** - Read and comprehend the code before changing it

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `user-service.ts`, `auth-middleware.ts`)
- **Directories**: `kebab-case/` (e.g., `api-handlers/`, `data-models/`)
- **Classes**: `PascalCase` (e.g., `UserService`, `AuthMiddleware`)
- **Functions/Variables**: `camelCase` (e.g., `getUserById`, `isAuthenticated`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `MAX_RETRIES`, `DEFAULT_TIMEOUT`)

### File Organization

- **Descriptive names** - File names should clearly indicate contents
- **One concept per file** - Don't mix unrelated functionality
- **Group by feature** - Prefer feature-based organization over type-based

## Development Principles

### Before Writing Code

1. **Read existing code first** - Understand patterns before adding new code
2. **Check for existing solutions** - Don't reinvent what already exists
3. **Understand the context** - Use `/context-check` before major tasks

### While Writing Code

1. **Keep it simple** - Don't over-engineer; solve the current problem
2. **No premature abstraction** - Three similar lines > one premature helper
3. **Minimal changes** - Only modify what's necessary for the task
4. **Security first** - Never introduce OWASP vulnerabilities

### After Writing Code

1. **Test your changes** - Run tests before considering done
2. **Update documentation** - Use `/context-update` to capture learnings
3. **Clean commits** - Atomic commits with clear messages

## Quick Start

```bash
# Setup
npm install
cp .env.example .env

# Development
npm run dev

# Testing
npm test

# Build
npm run build

# Lint
npm run lint
npm run lint:fix
```

## Context Navigation

**Core Areas** (see `/context/` for details):

- **Architecture**: `/context/architecture/` - System design
- **Development**: `/context/development/` - Workflows, standards
- **Operations**: `/context/operations/` - Deployment, monitoring

**Cross-Cutting**:

- **Testing**: `/context/testing/` - Test strategies
- **Security**: `/context/security/` - Security policies
- **Troubleshooting**: `/context/troubleshooting/` - Common issues

## Critical Reminders

- **Never commit `.env`** - Use `.env.example` for templates
- **Never commit secrets** - API keys, passwords, tokens stay out of git
- **Run tests before PR** - `npm test` must pass
- **Build before deploy** - Verify TypeScript compiles locally first

## Key Files

- **Entry Point**: `src/index.ts`
- **Configuration**: `tsconfig.json`, `.eslintrc.cjs`, `.prettierrc`
- **Environment**: `.env` (not committed), `.env.example` (template)

## Current Status

- **Branch**: main
- **Phase**: Initial setup

---

For detailed information on any topic, navigate to the appropriate context directory.
