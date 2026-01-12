# GSD Orchestration Harness Setup Guide

This guide enables Claude Code to orchestrate multiple GSD sessions in parallel using the GSD Orchestration Harness MCP server.

## Prerequisites

The harness extends GSD functionality. **You must have GSD installed first.**

### Check GSD Installation

```bash
# Check if GSD workflows exist
ls .claude/get-shit-done/workflows/ 2>/dev/null || echo "GSD not installed"
```

### Install GSD if Missing

```bash
# Install GSD globally (recommended)
npx get-shit-done-cc --global
```

After installation, run `/gsd:new-project` in Claude Code to initialize the project.

## Quick Setup (One Command)

The setup script handles everything automatically:

```bash
curl -sSL https://raw.githubusercontent.com/sandoak/gsd-orchestration-harness/main/scripts/setup-gsd-harness.sh | bash
```

**The script will automatically:**

- Clone the harness to `~/.gsd-harness` if not installed
- Detect and repair corrupted installations
- Install pnpm if not available
- Build all packages
- Create/update `.mcp.json` in your project
- Verify GSD installation

## What Gets Installed

| Location          | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `~/.gsd-harness/` | Harness source and built packages           |
| `.mcp.json`       | Project MCP configuration (created/updated) |

## After Setup

1. **Restart Claude Code** to load the MCP configuration

2. **Verify harness tools are available** - Look for `gsd_*` tools

3. **Start orchestrating:**

   ```bash
   /gsd:orchestrate
   ```

4. **View dashboard:** http://localhost:3333

## MCP Tools Available

| Tool                     | Purpose                               |
| ------------------------ | ------------------------------------- |
| `gsd_list_sessions`      | Get status of all 3 session slots     |
| `gsd_start_session`      | Start session in available slot       |
| `gsd_end_session`        | Terminate a running session           |
| `gsd_get_output`         | Get recent output from session        |
| `gsd_get_state`          | Parse .planning/ and return GSD state |
| `gsd_get_checkpoint`     | Get checkpoint info if waiting        |
| `gsd_respond_checkpoint` | Send response to checkpoint           |

## Usage

### Start Orchestrating

```bash
# In Claude Code
/gsd:orchestrate
```

Claude will:

1. Load your ROADMAP.md to identify work
2. Assign phases/plans to idle session slots
3. Monitor progress across all sessions
4. Handle checkpoints automatically
5. Report completion status

### View Dashboard

The harness serves a web dashboard at http://localhost:3333 with:

- 3 session slots displayed simultaneously
- Real-time terminal output with ANSI colors
- Session state indicators
- WebSocket live updates

### Session States

```
idle → running → waiting_checkpoint → running → completed
                       ↓
                    failed
```

## Checkpoint Handling

| Type           | Frequency | Auto-Handle?                  |
| -------------- | --------- | ----------------------------- |
| `human-verify` | 90%       | Yes - automated verification  |
| `decision`     | 9%        | No - presents options to user |
| `human-action` | 1%        | No - alerts for manual steps  |

## Troubleshooting

**See `HARNESS-RECOVERY.md` for detailed recovery procedures.**

### Quick Fixes

**"Harness not available" error:**

```bash
# Re-run setup script (auto-repairs)
curl -sSL https://raw.githubusercontent.com/sandoak/gsd-orchestration-harness/main/scripts/setup-gsd-harness.sh | bash
```

**Port 3333 in use:**

```bash
lsof -i :3333 | awk 'NR>1 {print $2}' | xargs kill
```

**Dashboard not loading:**

```bash
cd ~/.gsd-harness && pnpm build
```

## When to Use Orchestration

**Use orchestration when:**

- Multiple independent phases can run in parallel
- You want hands-off execution with checkpoint handling
- You're running through a large ROADMAP with many plans

**Use single execution (`/gsd:execute-plan`) when:**

- Working on a single plan
- Plans have complex dependencies
- Every checkpoint needs human judgment

## Full Documentation

- **Harness Repository**: https://github.com/sandoak/gsd-orchestration-harness
- **GSD Core**: https://github.com/glittercowboy/get-shit-done
- **GSD Quick Start**: See `GSD-QUICK-START.md` in parent directory

---

_The harness turns Claude into a session coordinator, enabling parallel execution of GSD plans while maintaining quality through automated checkpoint handling._
