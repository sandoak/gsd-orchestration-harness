# Context Hub

**Last Updated**: 2026-01-11
**Status**: Active

This is the central navigation hub for all project documentation.

## Quick Navigation

### Core Areas

| Domain       | Hub                                                                | Description                 |
| ------------ | ------------------------------------------------------------------ | --------------------------- |
| Architecture | [/context/architecture/CLAUDE.md](/context/architecture/CLAUDE.md) | System design and patterns  |
| Development  | [/context/development/CLAUDE.md](/context/development/CLAUDE.md)   | Setup, workflows, standards |
| Operations   | [/context/operations/CLAUDE.md](/context/operations/CLAUDE.md)     | Deployment and monitoring   |

### Cross-Cutting Concerns

| Domain          | Hub                                                                      | Description                  |
| --------------- | ------------------------------------------------------------------------ | ---------------------------- |
| Testing         | [/context/testing/CLAUDE.md](/context/testing/CLAUDE.md)                 | Test strategies and patterns |
| Security        | [/context/security/CLAUDE.md](/context/security/CLAUDE.md)               | Security policies            |
| Troubleshooting | [/context/troubleshooting/CLAUDE.md](/context/troubleshooting/CLAUDE.md) | Common issues and fixes      |

## Documentation Standards

### File Types

- **Hub Files** (`CLAUDE.md`): Navigation and overview for each domain
- **Spoke Files** (`topic.md`): Detailed documentation on specific topics

### Size Limits

| File Type   | Target    | Maximum   |
| ----------- | --------- | --------- |
| This file   | 200 lines | 400 lines |
| Domain hubs | 300 lines | 750 lines |
| Spoke files | 500 lines | No limit  |

### Naming Conventions

- Directories: `kebab-case/`
- Hub files: `CLAUDE.md`
- Spoke files: `kebab-case-topic.md`

## Context Commands

| Command             | Purpose                   | Frequency |
| ------------------- | ------------------------- | --------- |
| `/context-check`    | Load context before task  | Per task  |
| `/context-update`   | Update docs after session | Daily     |
| `/context-validate` | Verify docs match code    | Monthly   |

---

_For updates, use `/context-update` command_
