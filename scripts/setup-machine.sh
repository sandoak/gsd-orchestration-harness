#!/bin/bash
#
# GSD Orchestration Harness - Machine Setup Script
#
# This script sets up the harness on a dev machine:
# 1. Checks system prerequisites (Node.js, Python, C++ compiler)
# 2. Clones/updates the harness from GitHub
# 3. Installs dependencies and builds
# 4. Configures MCP for Claude Code
# 5. Sets up auto-start service (systemd/launchd)
#
# Usage:
#   First time:  gh repo clone sandoak/gsd-orchestration-harness ~/.gsd-harness && ~/.gsd-harness/scripts/setup-machine.sh
#   Updates:     ~/.gsd-harness/scripts/setup-machine.sh
#
# Or run directly from GitHub:
#   bash <(gh api repos/sandoak/gsd-orchestration-harness/contents/scripts/setup-machine.sh --jq '.content' | base64 -d)
#
# Environment variables (optional):
#   GSD_HARNESS_DIR   - Installation directory (default: ~/.gsd-harness)
#   GSD_HARNESS_REPO  - GitHub repo to clone (default: sandoak/gsd-orchestration-harness)
#   GSD_HARNESS_PORT  - Port for harness server (default: 3333)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - can be overridden via environment variables
HARNESS_DIR="${GSD_HARNESS_DIR:-$HOME/.gsd-harness}"
REPO="${GSD_HARNESS_REPO:-sandoak/gsd-orchestration-harness}"
MIN_NODE_VERSION=22
HARNESS_PORT="${GSD_HARNESS_PORT:-3333}"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Detect OS
detect_os() {
  case "$(uname -s)" in
    Linux*)   OS="linux";;
    Darwin*)  OS="macos";;
    MINGW*|MSYS*|CYGWIN*) OS="windows";;
    *)        OS="unknown";;
  esac
  echo "$OS"
}

# Check Node.js version
check_node() {
  if ! command -v node &>/dev/null; then
    log_error "Node.js is not installed"
    echo ""
    echo "Install Node.js >= $MIN_NODE_VERSION from:"
    echo "  https://nodejs.org/"
    echo "  or use nvm: nvm install $MIN_NODE_VERSION"
    return 1
  fi

  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt "$MIN_NODE_VERSION" ]; then
    log_error "Node.js version $NODE_VERSION is too old (need >= $MIN_NODE_VERSION)"
    echo ""
    echo "Update Node.js:"
    echo "  nvm install $MIN_NODE_VERSION"
    echo "  or download from https://nodejs.org/"
    return 1
  fi

  log_success "Node.js v$(node -v | sed 's/v//') found"
}

# Check Python (required for node-gyp)
check_python() {
  if command -v python3 &>/dev/null; then
    log_success "Python 3 found: $(python3 --version)"
    return 0
  elif command -v python &>/dev/null; then
    PYTHON_VERSION=$(python --version 2>&1 | cut -d' ' -f2 | cut -d. -f1)
    if [ "$PYTHON_VERSION" -ge 3 ]; then
      log_success "Python found: $(python --version)"
      return 0
    fi
  fi

  log_error "Python 3 is required for native module compilation"
  echo ""
  OS=$(detect_os)
  case "$OS" in
    linux)
      echo "Install with:"
      echo "  Ubuntu/Debian: sudo apt-get install python3"
      echo "  Fedora/RHEL:   sudo dnf install python3"
      ;;
    macos)
      echo "Install with:"
      echo "  brew install python3"
      echo "  or: xcode-select --install (includes Python)"
      ;;
    *)
      echo "Install Python 3 from https://python.org/"
      ;;
  esac
  return 1
}

# Check C++ compiler (required for native modules)
check_compiler() {
  if command -v gcc &>/dev/null; then
    log_success "GCC found: $(gcc --version | head -1)"
    return 0
  elif command -v clang &>/dev/null; then
    log_success "Clang found: $(clang --version | head -1)"
    return 0
  fi

  log_error "C++ compiler required for native modules (better-sqlite3, node-pty)"
  echo ""
  OS=$(detect_os)
  case "$OS" in
    linux)
      echo "Install build tools:"
      echo "  Ubuntu/Debian: sudo apt-get install build-essential"
      echo "  Fedora/RHEL:   sudo dnf groupinstall 'Development Tools'"
      ;;
    macos)
      echo "Install Xcode Command Line Tools:"
      echo "  xcode-select --install"
      ;;
    windows)
      echo "Install Visual Studio Build Tools:"
      echo "  npm install -g windows-build-tools"
      echo "  (run as Administrator)"
      ;;
    *)
      echo "Install a C++ compiler (gcc or clang)"
      ;;
  esac
  return 1
}

# Check pnpm
check_pnpm() {
  if ! command -v pnpm &>/dev/null; then
    log_warn "pnpm not found, installing..."
    npm install -g pnpm
  fi
  log_success "pnpm found: $(pnpm --version)"
}

# Check GitHub CLI (optional but recommended)
check_gh() {
  if ! command -v gh &>/dev/null; then
    log_warn "GitHub CLI (gh) not found - will use git clone instead"
    return 1
  fi

  if ! gh auth status &>/dev/null 2>&1; then
    log_warn "GitHub CLI not authenticated - will use git clone instead"
    return 1
  fi

  log_success "GitHub CLI authenticated"
  return 0
}

# Clone or update harness
install_harness() {
  if [ -d "$HARNESS_DIR" ]; then
    log_info "Updating harness from GitHub..."
    cd "$HARNESS_DIR"
    git pull --ff-only
  else
    log_info "Cloning harness from GitHub..."
    if check_gh; then
      gh repo clone "$REPO" "$HARNESS_DIR"
    else
      git clone "https://github.com/$REPO.git" "$HARNESS_DIR"
    fi
  fi
  log_success "Harness code ready at $HARNESS_DIR"
}

# Build harness
build_harness() {
  log_info "Installing dependencies (this may take a minute for native modules)..."
  cd "$HARNESS_DIR"
  pnpm install

  log_info "Building harness..."
  pnpm build

  log_success "Harness built successfully"
}

# Configure Claude Code MCP
configure_mcp() {
  CLAUDE_SETTINGS="$HOME/.claude/settings.json"
  CLAUDE_DIR="$HOME/.claude"

  log_info "Configuring Claude Code MCP..."

  # Create .claude directory if needed
  mkdir -p "$CLAUDE_DIR"

  # Create or update settings.json
  if [ -f "$CLAUDE_SETTINGS" ]; then
    # Check if gsd-harness already configured
    if grep -q "gsd-harness" "$CLAUDE_SETTINGS" 2>/dev/null; then
      log_success "MCP already configured in $CLAUDE_SETTINGS"
      return 0
    fi

    # Backup existing settings
    cp "$CLAUDE_SETTINGS" "$CLAUDE_SETTINGS.backup"
    log_info "Backed up existing settings to $CLAUDE_SETTINGS.backup"

    # Add gsd-harness to existing mcpServers (using node for JSON manipulation)
    node -e "
      const fs = require('fs');
      const settings = JSON.parse(fs.readFileSync('$CLAUDE_SETTINGS', 'utf8'));
      settings.mcpServers = settings.mcpServers || {};
      settings.mcpServers['gsd-harness'] = {
        type: 'http',
        url: 'http://localhost:$HARNESS_PORT/mcp'
      };
      fs.writeFileSync('$CLAUDE_SETTINGS', JSON.stringify(settings, null, 2));
    "
  else
    # Create new settings file
    cat > "$CLAUDE_SETTINGS" << EOF
{
  "mcpServers": {
    "gsd-harness": {
      "type": "http",
      "url": "http://localhost:$HARNESS_PORT/mcp"
    }
  }
}
EOF
  fi

  log_success "MCP configured at $CLAUDE_SETTINGS"
}

# Setup systemd service (Linux)
setup_systemd() {
  SERVICE_DIR="$HOME/.config/systemd/user"
  SERVICE_FILE="$SERVICE_DIR/gsd-harness.service"

  mkdir -p "$SERVICE_DIR"

  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=GSD Orchestration Harness
After=network.target

[Service]
Type=simple
ExecStart=$(which node) $HARNESS_DIR/packages/harness/dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$HARNESS_PORT

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable gsd-harness
  systemctl --user start gsd-harness

  log_success "systemd service installed and started"
  echo "  Status:  systemctl --user status gsd-harness"
  echo "  Logs:    journalctl --user -u gsd-harness -f"
  echo "  Stop:    systemctl --user stop gsd-harness"
  echo "  Start:   systemctl --user start gsd-harness"
}

# Setup launchd service (macOS)
setup_launchd() {
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST_FILE="$PLIST_DIR/com.sandoak.gsd-harness.plist"
  LOG_DIR="$HOME/.gsd-harness/logs"

  mkdir -p "$PLIST_DIR"
  mkdir -p "$LOG_DIR"

  cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sandoak.gsd-harness</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>$HARNESS_DIR/packages/harness/dist/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PORT</key>
        <string>$HARNESS_PORT</string>
    </dict>
</dict>
</plist>
EOF

  # Unload if already loaded, then load
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  launchctl load "$PLIST_FILE"

  log_success "launchd service installed and started"
  echo "  Logs:    tail -f $LOG_DIR/*.log"
  echo "  Stop:    launchctl unload $PLIST_FILE"
  echo "  Start:   launchctl load $PLIST_FILE"
}

# Setup auto-start service
setup_service() {
  OS=$(detect_os)

  log_info "Setting up auto-start service..."

  case "$OS" in
    linux)
      setup_systemd
      ;;
    macos)
      setup_launchd
      ;;
    *)
      log_warn "Auto-start service not supported on $OS"
      echo "Start manually with: node $HARNESS_DIR/packages/harness/dist/index.js"
      ;;
  esac
}

# Create data directory
setup_data_dir() {
  DATA_DIR="$HARNESS_DIR/data"
  mkdir -p "$DATA_DIR"
  log_success "Data directory ready at $DATA_DIR"
}

# Install CLI to PATH
install_cli() {
  log_info "Installing gsd-harness CLI..."

  # Create ~/.local/bin if it doesn't exist
  LOCAL_BIN="$HOME/.local/bin"
  mkdir -p "$LOCAL_BIN"

  # Create symlink
  CLI_SOURCE="$HARNESS_DIR/bin/gsd-harness"
  CLI_TARGET="$LOCAL_BIN/gsd-harness"

  if [ -L "$CLI_TARGET" ] || [ -f "$CLI_TARGET" ]; then
    rm -f "$CLI_TARGET"
  fi

  ln -s "$CLI_SOURCE" "$CLI_TARGET"
  log_success "CLI installed at $CLI_TARGET"

  # Check if ~/.local/bin is in PATH
  if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
    log_warn "$LOCAL_BIN is not in your PATH"
    echo ""
    echo "Add to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
  fi
}

# Main
main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║       GSD Orchestration Harness - Machine Setup            ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  log_info "Checking prerequisites..."
  echo ""

  PREREQ_FAILED=0

  check_node || PREREQ_FAILED=1
  check_python || PREREQ_FAILED=1
  check_compiler || PREREQ_FAILED=1

  if [ "$PREREQ_FAILED" -eq 1 ]; then
    echo ""
    log_error "Prerequisites check failed. Please install missing dependencies and retry."
    exit 1
  fi

  check_pnpm

  echo ""
  log_info "Prerequisites OK. Proceeding with installation..."
  echo ""

  install_harness
  setup_data_dir
  build_harness
  install_cli
  configure_mcp
  setup_service

  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║                    Setup Complete!                         ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "The GSD harness is now running and configured for Claude Code."
  echo ""
  echo "Dashboard:  http://localhost:$HARNESS_PORT"
  echo "MCP:        http://localhost:$HARNESS_PORT/mcp"
  echo ""
  echo "CLI Commands:"
  echo "  gsd-harness status   - Show harness status"
  echo "  gsd-harness update   - Pull latest and rebuild"
  echo "  gsd-harness logs     - View harness logs"
  echo "  gsd-harness help     - Show all commands"
  echo ""
}

main "$@"
