# GSD Orchestration Harness - Update Guide

This guide explains how to update the GSD Orchestration Harness when new versions are released.

## Quick Update (One Command)

From any project using the harness:

```bash
cd ~/.gsd-harness && git pull && pnpm install && pnpm build
```

Then restart Claude Code to reload the MCP server.

---

## Step-by-Step Update Process

### Step 1: Stop Any Running Sessions

Before updating, ensure no GSD sessions are running:

1. Check the dashboard at http://localhost:3333
2. Or in Claude Code, run: `gsd_list_sessions`
3. End any running sessions: `gsd_end_session(sessionId)`

### Step 2: Pull Latest Changes

```bash
cd ~/.gsd-harness
git fetch origin
git pull origin main
```

**If you have local changes:**

```bash
git stash
git pull origin main
git stash pop  # Re-apply your changes
```

### Step 3: Rebuild the Harness

```bash
cd ~/.gsd-harness
pnpm install      # Update dependencies
pnpm build        # Rebuild all packages
```

**Verify build succeeded:**

```bash
ls packages/harness/dist/index.js && echo "Build successful"
ls packages/dashboard/dist/index.html && echo "Dashboard built"
```

### Step 4: Restart Claude Code

The MCP server runs as part of Claude Code. To reload:

1. **Quit Claude Code completely** (not just close window)
2. **Restart Claude Code**
3. **Verify harness is running:**
   ```bash
   curl -s http://localhost:3333/health
   # Should return: {"status":"ok"}
   ```

### Step 5: Verify MCP Tools Available

In Claude Code, the harness tools should now be available:

- `gsd_list_sessions`
- `gsd_start_session`
- `gsd_end_session`
- `gsd_get_output`
- `gsd_get_state`
- `gsd_get_checkpoint`
- `gsd_respond_checkpoint`

---

## Updating Projects Using the Harness

If your project's `.mcp.json` points to `~/.gsd-harness`, no project-level changes are needed after updating the harness.

**Check your project's `.mcp.json`:**

```bash
cat .mcp.json | grep gsd-harness
```

Should show:

```json
"gsd-harness": {
  "command": "node",
  "args": ["/home/username/.gsd-harness/packages/harness/dist/index.js"]
}
```

---

## Troubleshooting Updates

### Build Fails After Update

```bash
cd ~/.gsd-harness
rm -rf node_modules
rm -rf packages/*/dist
rm -rf packages/*/node_modules
pnpm install
pnpm build
```

### MCP Server Not Starting

Check if the harness process is running:

```bash
ps aux | grep gsd-harness
```

Check if port 3333 is in use:

```bash
lsof -i :3333
```

Kill stale processes:

```bash
lsof -i :3333 | awk 'NR>1 {print $2}' | xargs kill -9
```

### Dashboard Not Loading

Verify dashboard was built:

```bash
ls ~/.gsd-harness/packages/dashboard/dist/
```

Rebuild if missing:

```bash
cd ~/.gsd-harness && pnpm build
```

### "Module not found" Errors

Usually means dependencies need updating:

```bash
cd ~/.gsd-harness
pnpm install
pnpm build
```

---

## Version Checking

Check current version:

```bash
cd ~/.gsd-harness
git log -1 --format="%h %s"
```

Check for available updates:

```bash
cd ~/.gsd-harness
git fetch origin
git log HEAD..origin/main --oneline
```

---

## Rollback to Previous Version

If an update causes issues:

```bash
cd ~/.gsd-harness

# List recent commits
git log --oneline -10

# Rollback to a specific commit
git checkout <commit-hash>

# Rebuild
pnpm install
pnpm build

# Restart Claude Code
```

To return to latest:

```bash
git checkout main
git pull origin main
pnpm install
pnpm build
```

---

## Automated Update Script

Save this as `~/.gsd-harness/update.sh`:

```bash
#!/bin/bash
set -e

echo "Updating GSD Orchestration Harness..."

cd ~/.gsd-harness

# Check for local changes
if [[ -n $(git status --porcelain) ]]; then
    echo "Warning: Local changes detected. Stashing..."
    git stash
    STASHED=1
fi

# Pull latest
git fetch origin
git pull origin main

# Restore local changes if any
if [[ $STASHED -eq 1 ]]; then
    echo "Restoring local changes..."
    git stash pop
fi

# Rebuild
echo "Installing dependencies..."
pnpm install

echo "Building packages..."
pnpm build

# Verify
if [[ -f "packages/harness/dist/index.js" ]]; then
    echo ""
    echo "Update complete!"
    echo "Please restart Claude Code to load the updated harness."
else
    echo "Build failed - dist files not found"
    exit 1
fi
```

Make it executable:

```bash
chmod +x ~/.gsd-harness/update.sh
```

Run updates:

```bash
~/.gsd-harness/update.sh
```

---

## Syncing GSD Workflow Updates

The orchestration workflow may also be updated. To sync:

### If Using Project-Local GSD

```bash
cd /your/project
npx get-shit-done-cc --upgrade
```

### If Using Global GSD

```bash
npx get-shit-done-cc --global --upgrade
```

### If Using Shared Commands

```bash
cd /mnt/dev-linux/projects/general-reference/claude-shared-commands-agents-skills
git pull
```

---

## After Major Updates

After significant updates, consider:

1. **Check Release Notes**: Look at commit history for breaking changes
2. **Test in a Sample Project**: Run `/gsd:orchestrate` on a test project first
3. **Verify Dashboard Works**: Open http://localhost:3333
4. **Check Session Management**: Start/stop a test session

---

## Getting Help

- **Repository**: https://github.com/sandoak/gsd-orchestration-harness
- **Recovery Guide**: See `HARNESS-RECOVERY.md` for detailed troubleshooting
- **Setup Guide**: See `HARNESS-SETUP.md` for fresh installations
