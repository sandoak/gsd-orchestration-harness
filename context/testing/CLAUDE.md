# Testing Context

**Last Updated**: 2026-01-11
**Domain**: Testing
**Status**: Active

## Overview

Test strategies, patterns, and best practices.

## Quick Navigation

| Topic          | File               | Description            |
| -------------- | ------------------ | ---------------------- |
| Unit Tests     | _To be documented_ | Unit testing patterns  |
| Integration    | _To be documented_ | Integration test setup |
| Test Utilities | _To be documented_ | Shared test helpers    |

## Test Framework

This project uses **Vitest** for testing.

```bash
# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage
```

## Test Organization

```
src/
├── feature/
│   ├── feature.ts
│   └── feature.test.ts  # Co-located tests
tests/
├── integration/         # Integration tests
└── fixtures/            # Test fixtures
```

## Testing Standards

- Co-locate unit tests with source files
- Use descriptive test names
- Follow Arrange-Act-Assert pattern

## Related Context

- [/context/development/CLAUDE.md](/context/development/CLAUDE.md) - Development workflows

---

_For updates, use `/context-update` command_
