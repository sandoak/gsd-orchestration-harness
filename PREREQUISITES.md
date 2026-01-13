# Prerequisites

System requirements for running the GSD Orchestration Harness.

## Required Software

### Node.js

**Version**: >= 22.0.0, < 25.0.0

```bash
# Check version
node --version

# Install via nvm (recommended)
nvm install 22
nvm use 22

# Or download from https://nodejs.org/
```

### Python 3

Required for compiling native Node.js modules (node-gyp).

```bash
# Check if installed
python3 --version

# Install
# Ubuntu/Debian
sudo apt-get install python3

# Fedora/RHEL
sudo dnf install python3

# macOS (usually pre-installed, or)
brew install python3
```

### C++ Compiler

Required for native modules: `better-sqlite3` (SQLite bindings) and `node-pty` (PTY support).

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get install build-essential
```

**Linux (Fedora/RHEL):**

```bash
sudo dnf groupinstall "Development Tools"
```

**macOS:**

```bash
xcode-select --install
```

**Windows (WSL recommended, or):**

```powershell
# Run as Administrator
npm install -g windows-build-tools
```

### pnpm (Package Manager)

```bash
# Install globally
npm install -g pnpm

# Or via corepack (Node.js 16.13+)
corepack enable
corepack prepare pnpm@latest --activate
```

### GitHub CLI (Optional)

Recommended for authenticated repo access during setup.

```bash
# Install
# macOS
brew install gh

# Linux (Debian/Ubuntu)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Authenticate
gh auth login
```

## Native Modules

The harness uses two native Node.js modules that require compilation:

### better-sqlite3

Synchronous SQLite3 bindings for Node.js. Used for session and orchestration state persistence.

- **Why**: Synchronous API is simpler for state management
- **Requires**: Python 3, C++ compiler

### node-pty

Fork pseudoterminals (PTY) in Node.js. Used for spawning Claude CLI sessions with full terminal emulation.

- **Why**: Claude CLI requires PTY for interactive features
- **Requires**: Python 3, C++ compiler

## Quick Check

Run this to verify all prerequisites:

```bash
# Node.js
node --version  # Should be >= 22

# Python
python3 --version  # Should be >= 3.6

# C++ compiler
gcc --version || clang --version  # Either one

# pnpm
pnpm --version

# GitHub CLI (optional)
gh --version
gh auth status
```

## Automated Setup

The setup script checks all prerequisites automatically:

```bash
~/.gsd-harness/scripts/setup-machine.sh
```

If any prerequisite is missing, the script will display installation instructions for your OS.

## Platform Support

| Platform              | Status             | Notes                           |
| --------------------- | ------------------ | ------------------------------- |
| Linux (Ubuntu/Debian) | ✅ Fully supported | Primary development platform    |
| Linux (Fedora/RHEL)   | ✅ Fully supported |                                 |
| macOS                 | ✅ Fully supported | Requires Xcode CLI tools        |
| Windows (WSL)         | ✅ Supported       | Recommended over native Windows |
| Windows (Native)      | ⚠️ Experimental    | May have path issues            |

## Troubleshooting

### "node-gyp rebuild failed"

Missing C++ compiler or Python:

```bash
# Linux
sudo apt-get install build-essential python3

# macOS
xcode-select --install
```

### "better-sqlite3: Cannot find module"

Native module not compiled for your Node.js version:

```bash
cd ~/.gsd-harness
pnpm rebuild better-sqlite3
```

### "node-pty: PTY could not be started"

Usually a permissions issue on Linux:

```bash
# Check PTY permissions
ls -la /dev/pts/

# May need to add user to tty group
sudo usermod -a -G tty $USER
# Then log out and back in
```

## Environment Variables

Optional configuration for the setup script:

| Variable           | Default                             | Description            |
| ------------------ | ----------------------------------- | ---------------------- |
| `GSD_HARNESS_DIR`  | `~/.gsd-harness`                    | Installation directory |
| `GSD_HARNESS_REPO` | `sandoak/gsd-orchestration-harness` | GitHub repo            |
| `GSD_HARNESS_PORT` | `3333`                              | HTTP server port       |

Example:

```bash
GSD_HARNESS_PORT=4000 ~/.gsd-harness/scripts/setup-machine.sh
```
