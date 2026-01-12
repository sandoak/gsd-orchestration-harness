# Security Context

**Last Updated**: 2026-01-11
**Domain**: Security
**Status**: Active

## Overview

Security policies, practices, and guidelines.

## Quick Navigation

| Topic          | File               | Description             |
| -------------- | ------------------ | ----------------------- |
| Authentication | _To be documented_ | Auth implementation     |
| Authorization  | _To be documented_ | Access control patterns |
| Secrets        | _To be documented_ | Secret management       |

## Critical Security Rules

1. **Never commit `.env`** - Use `.env.example` for templates
2. **Never commit secrets** - API keys, passwords, tokens stay out of git
3. **Validate all input** - Never trust user input
4. **Use parameterized queries** - Prevent SQL injection
5. **Escape output** - Prevent XSS attacks

## Secrets Management

- Store secrets in environment variables
- Use `.env.example` to document required variables
- Never log sensitive data

## Related Context

- [/context/development/CLAUDE.md](/context/development/CLAUDE.md) - Development setup

---

_For updates, use `/context-update` command_
