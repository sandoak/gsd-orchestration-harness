# Development Context

**Last Updated**: 2026-01-11
**Domain**: Development
**Status**: Active

## Overview

Development workflows, coding standards, and setup instructions.

## Quick Navigation

| Topic            | File               | Description                   |
| ---------------- | ------------------ | ----------------------------- |
| Setup Guide      | _To be documented_ | Getting started instructions  |
| Coding Standards | _To be documented_ | Code style and conventions    |
| Workflows        | _To be documented_ | Development process and CI/CD |

## Development Setup

```bash
# Clone the repository
git clone <repo-url>
cd gsd-orchestration-harness

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start development
npm run dev
```

## Available Scripts

| Script           | Purpose                           |
| ---------------- | --------------------------------- |
| `npm run dev`    | Start development with hot reload |
| `npm run build`  | Build for production              |
| `npm run test`   | Run tests in watch mode           |
| `npm run lint`   | Check code style                  |
| `npm run format` | Format code with Prettier         |

## Coding Standards

- **Files**: `kebab-case.ts`
- **Classes**: `PascalCase`
- **Functions/Variables**: `camelCase`
- **Constants**: `SCREAMING_SNAKE_CASE`

## Pre-commit Hooks

This project uses Husky for pre-commit hooks:

- ESLint checking
- Prettier formatting
- Context file size validation

## Related Context

- [/context/architecture/CLAUDE.md](/context/architecture/CLAUDE.md) - System architecture
- [/context/testing/CLAUDE.md](/context/testing/CLAUDE.md) - Testing strategies

---

_For updates, use `/context-update` command_
