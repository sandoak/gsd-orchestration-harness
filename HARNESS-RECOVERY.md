# GSD Orchestration Harness - Recovery Guide

This guide provides step-by-step procedures for recovering from common installation and runtime issues.

## Issue: Stuck or Orphaned Sessions

**Symptoms:**

- Claude CLI processes running but not responding
- Sessions show as "running" but produce no output
- Dashboard shows stale sessions
- "No available slots" error when starting new sessions

**Recovery:**

The harness automatically cleans up orphaned sessions on restart. Simply:

```bash
# Restart Claude Code - harness will kill orphaned processes on startup
```

**Manual Cleanup (if restart isn't an option):**

```bash
# In Claude Code - list and terminate sessions
gsd_list_sessions  # Check for running sessions
gsd_end_session("session-id")  # Terminate each one
```

**Check for Stale Sessions:**

```bash
curl -s http://localhost:3333/api/sessions/stale
```

**Note:** Sessions not polled for 10+ minutes are automatically terminated.

---

## Quick Recovery (Try First)

The setup script now auto-repairs most issues. Try this first:

```bash
curl -sSL https://raw.githubusercontent.com/sandoak/gsd-orchestration-harness/main/scripts/setup-gsd-harness.sh | bash
```

If the quick recovery doesn't work, use the specific procedures below.

---

## Issue: Corrupted or Partial Installation

**Symptoms:**

- "No package.json found" error
- Empty `~/.gsd-harness` directory
- Missing `dist/` files after build

**Recovery:**

```bash
# Step 1: Remove corrupted installation completely
rm -rf ~/.gsd-harness

# Step 2: Fresh clone from GitHub
git clone https://github.com/sandoak/gsd-orchestration-harness.git ~/.gsd-harness

# Step 3: Install dependencies and build
cd ~/.gsd-harness
pnpm install
pnpm build

# Step 4: Verify build succeeded
ls packages/harness/dist/index.js && echo "Build successful"

# Step 5: Return to your project and re-run setup
cd /path/to/your/project
curl -sSL https://raw.githubusercontent.com/sandoak/gsd-orchestration-harness/main/scripts/setup-gsd-harness.sh | bash
```

---

## Issue: Git Clone Fails or Times Out

**Symptoms:**

- Clone hangs or times out
- "Connection refused" or network errors
- Interrupted download

**Recovery:**

```bash
# Step 1: Clean up any partial clone
rm -rf ~/.gsd-harness

# Step 2: Try HTTPS clone with increased timeout
GIT_HTTP_TIMEOUT=300 git clone https://github.com/sandoak/gsd-orchestration-harness.git ~/.gsd-harness

# Alternative: Clone with depth 1 (faster, smaller)
git clone --depth 1 https://github.com/sandoak/gsd-orchestration-harness.git ~/.gsd-harness

# Step 3: Build
cd ~/.gsd-harness && pnpm install && pnpm build
```

---

## Issue: pnpm Not Found or Install Fails

**Symptoms:**

- "pnpm: command not found"
- npm permission errors
- Package installation failures

**Recovery:**

```bash
# Step 1: Install pnpm globally
npm install -g pnpm

# If npm fails, try corepack (Node 16.13+)
corepack enable
corepack prepare pnpm@latest --activate

# Step 2: Verify pnpm works
pnpm --version

# Step 3: Clear any cached packages and retry
cd ~/.gsd-harness
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm build
```

---

## Issue: Build Fails

**Symptoms:**

- TypeScript compilation errors
- "Cannot find module" errors
- Build hangs or crashes

**Recovery:**

```bash
# Step 1: Clean build artifacts
cd ~/.gsd-harness
rm -rf node_modules
rm -rf packages/*/dist
rm -rf packages/*/node_modules

# Step 2: Fresh install
pnpm install

# Step 3: Build with verbose output
pnpm build 2>&1 | tee build.log

# If still failing, check Node version (requires >=22.0.0 <25.0.0)
node --version
```

---

## Issue: MCP Configuration Problems

**Symptoms:**

- "gsd-harness" tools not appearing in Claude Code
- Wrong path in `.mcp.json`
- MCP server won't start

**Recovery:**

```bash
# Step 1: Check current config
cat .mcp.json

# Step 2: Verify harness path exists
ls ~/.gsd-harness/packages/harness/dist/index.js

# Step 3: Fix .mcp.json manually if needed
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "gsd-harness": {
      "command": "node",
      "args": ["$HOME/.gsd-harness/packages/harness/dist/index.js"]
    }
  }
}
EOF

# Note: Replace $HOME with actual path like /home/username

# Step 4: Restart Claude Code completely
```

---

## Issue: Port 3333 Already in Use

**Symptoms:**

- "EADDRINUSE" error
- Dashboard won't load
- Multiple harness instances running

**Recovery:**

```bash
# Step 1: Find what's using port 3333
lsof -i :3333

# Step 2: Kill the process
lsof -i :3333 | awk 'NR>1 {print $2}' | xargs kill -9

# Step 3: Or use a different port
GSD_HARNESS_PORT=3334 node ~/.gsd-harness/packages/harness/dist/index.js

# Step 4: Restart Claude Code to restart MCP server
```

---

## Issue: Dashboard Shows Only JSON / No UI

**Symptoms:**

- http://localhost:3333 shows JSON instead of dashboard
- Dashboard returns 404
- Static files not served

**Recovery:**

```bash
# Step 1: Check dashboard was built
ls ~/.gsd-harness/packages/dashboard/dist/index.html

# Step 2: If missing, rebuild
cd ~/.gsd-harness
pnpm build

# Step 3: Verify web-server has static serving
grep -r "fastifyStatic" packages/web-server/

# Step 4: Restart Claude Code
```

---

## Issue: GSD Commands Not Found

**Symptoms:**

- `/gsd:orchestrate` not recognized
- GSD workflows missing
- `.claude/get-shit-done/` doesn't exist

**Recovery:**

```bash
# Step 1: Install GSD
npx get-shit-done-cc --global

# Step 2: Verify installation
ls ~/.claude/get-shit-done/

# Step 3: If using shared commands, verify path
ls /mnt/dev-linux/projects/general-reference/claude-shared-commands-agents-skills/commands/gsd/

# Step 4: Initialize project if needed
# In Claude Code: /gsd:new-project
```

---

## Complete Fresh Start

If nothing else works, do a complete clean installation:

```bash
# Step 1: Remove all harness files
rm -rf ~/.gsd-harness

# Step 2: Remove project MCP config (will be recreated)
rm .mcp.json

# Step 3: Verify GSD is installed
npx get-shit-done-cc --global

# Step 4: Run setup script
curl -sSL https://raw.githubusercontent.com/sandoak/gsd-orchestration-harness/main/scripts/setup-gsd-harness.sh | bash

# Step 5: Restart Claude Code completely (quit and reopen)
```

---

## Verification Checklist

After recovery, verify everything works:

```bash
# 1. Harness is built
ls ~/.gsd-harness/packages/harness/dist/index.js && echo "✓ Harness built"

# 2. Dashboard is built
ls ~/.gsd-harness/packages/dashboard/dist/index.html && echo "✓ Dashboard built"

# 3. MCP config exists and has harness
grep -q "gsd-harness" .mcp.json && echo "✓ MCP configured"

# 4. GSD is installed
ls .claude/get-shit-done/workflows/ 2>/dev/null && echo "✓ GSD installed"

# 5. Port 3333 is free
! lsof -i :3333 >/dev/null 2>&1 && echo "✓ Port 3333 available"
```

Then restart Claude Code and run `/gsd:orchestrate` to test.

---

## Getting Help

If issues persist:

1. Check the GitHub repository: https://github.com/sandoak/gsd-orchestration-harness
2. Review build logs: `cd ~/.gsd-harness && pnpm build 2>&1 | tee build.log`
3. Check Node version: `node --version` (requires >=22.0.0 <25.0.0)
