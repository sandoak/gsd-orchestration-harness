#!/bin/bash
#
# setup-gsd-harness.sh - GSD Orchestration Harness Setup
#
# Run this script from any project directory to enable harness functionality.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/sandoak/gsd-orchestration-harness/main/scripts/setup-gsd-harness.sh | bash
#   OR
#   /path/to/gsd-orchestration-harness/scripts/setup-gsd-harness.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
HARNESS_REPO="https://github.com/sandoak/gsd-orchestration-harness.git"
HARNESS_DEFAULT_PATH="$HOME/.gsd-harness"
SHARED_COMMANDS_PATH="/mnt/dev-linux/projects/general-reference/claude-shared-commands-agents-skills"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  GSD Orchestration Harness - Project Setup                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get current project directory
PROJECT_DIR="$(pwd)"
echo -e "${GREEN}Project directory:${NC} $PROJECT_DIR"

# Step 1: Find, install, or repair harness
find_or_install_harness() {
    echo ""
    echo -e "${YELLOW}Step 1: Locating harness installation...${NC}"

    HARNESS_PATH=""

    # Check if running from within harness repo (highest priority)
    if [ -f "./packages/harness/dist/index.js" ]; then
        HARNESS_PATH="$(pwd)"
        echo -e "${GREEN}✓${NC} Found built harness in current directory"
        return 0
    fi

    # Check if running from harness repo but needs build
    if [ -f "./package.json" ] && grep -q '"@gsd/harness"' "./pnpm-workspace.yaml" 2>/dev/null; then
        HARNESS_PATH="$(pwd)"
        echo -e "${YELLOW}!${NC} Found harness source in current directory (needs build)"
        return 1
    fi

    # Check relative to script location (when script is run directly)
    if [ -n "${BASH_SOURCE[0]}" ]; then
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
        if [ -f "$SCRIPT_DIR/../packages/harness/dist/index.js" ]; then
            HARNESS_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
            echo -e "${GREEN}✓${NC} Found built harness at $HARNESS_PATH"
            return 0
        fi
        if [ -f "$SCRIPT_DIR/../package.json" ]; then
            HARNESS_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
            echo -e "${YELLOW}!${NC} Found harness source at $HARNESS_PATH (needs build)"
            return 1
        fi
    fi

    # Check default installation path
    if [ -d "$HARNESS_DEFAULT_PATH" ]; then
        # Check if it's a valid installation
        if [ -f "$HARNESS_DEFAULT_PATH/package.json" ]; then
            if [ -f "$HARNESS_DEFAULT_PATH/packages/harness/dist/index.js" ]; then
                HARNESS_PATH="$HARNESS_DEFAULT_PATH"
                echo -e "${GREEN}✓${NC} Found built harness at $HARNESS_PATH"
                return 0
            else
                HARNESS_PATH="$HARNESS_DEFAULT_PATH"
                echo -e "${YELLOW}!${NC} Found harness at $HARNESS_PATH (needs build)"
                return 1
            fi
        else
            # Directory exists but is empty or corrupted
            echo -e "${YELLOW}!${NC} Found corrupted installation at $HARNESS_DEFAULT_PATH"
            echo "   Removing and re-cloning..."
            rm -rf "$HARNESS_DEFAULT_PATH"
        fi
    fi

    # Harness not found - clone it
    echo -e "${YELLOW}!${NC} Harness not installed. Cloning from GitHub..."
    echo ""

    if ! git clone "$HARNESS_REPO" "$HARNESS_DEFAULT_PATH"; then
        echo -e "${RED}✗${NC} Failed to clone harness repository"
        echo "   Please check your internet connection and try again."
        exit 1
    fi

    HARNESS_PATH="$HARNESS_DEFAULT_PATH"
    echo -e "${GREEN}✓${NC} Cloned harness to $HARNESS_PATH"
    return 1  # Needs build
}

# Step 2: Build harness if needed
build_harness() {
    echo ""
    echo -e "${YELLOW}Step 2: Building harness...${NC}"

    cd "$HARNESS_PATH"

    # Check for pnpm
    if ! command -v pnpm &> /dev/null; then
        echo -e "${YELLOW}!${NC} pnpm not found. Installing..."
        npm install -g pnpm
    fi

    echo "   Installing dependencies..."
    if ! pnpm install; then
        echo -e "${RED}✗${NC} Failed to install dependencies"
        exit 1
    fi

    echo "   Building packages..."
    if ! pnpm build; then
        echo -e "${RED}✗${NC} Build failed"
        exit 1
    fi

    if [ -f "./packages/harness/dist/index.js" ]; then
        echo -e "${GREEN}✓${NC} Harness built successfully"
    else
        echo -e "${RED}✗${NC} Build completed but dist file not found"
        exit 1
    fi

    cd "$PROJECT_DIR"
}

# Step 3: Create MCP config
create_mcp_config() {
    echo ""
    echo -e "${YELLOW}Step 3: Creating MCP configuration...${NC}"

    MCP_FILE="$PROJECT_DIR/.mcp.json"
    HARNESS_ENTRY="$HARNESS_PATH/packages/harness/dist/index.js"

    if [ -f "$MCP_FILE" ]; then
        echo -e "${YELLOW}!${NC} .mcp.json already exists"

        # Check if harness is already configured
        if grep -q "gsd-harness" "$MCP_FILE"; then
            echo -e "${GREEN}✓${NC} gsd-harness already configured"
            return 0
        fi

        echo "   Adding gsd-harness to existing config..."
        # Use jq if available, otherwise manual instructions
        if command -v jq &> /dev/null; then
            TMP_FILE=$(mktemp)
            jq --arg path "$HARNESS_ENTRY" '.mcpServers["gsd-harness"] = {"command": "node", "args": [$path]}' "$MCP_FILE" > "$TMP_FILE"
            mv "$TMP_FILE" "$MCP_FILE"
            echo -e "${GREEN}✓${NC} Added gsd-harness to .mcp.json"
        else
            echo -e "${YELLOW}!${NC} jq not installed. Please manually add to .mcp.json:"
            echo ""
            echo '    "gsd-harness": {'
            echo '      "command": "node",'
            echo "      \"args\": [\"$HARNESS_ENTRY\"]"
            echo '    }'
        fi
    else
        # Create new .mcp.json
        cat > "$MCP_FILE" << EOF
{
  "mcpServers": {
    "gsd-harness": {
      "command": "node",
      "args": ["$HARNESS_ENTRY"]
    }
  }
}
EOF
        echo -e "${GREEN}✓${NC} Created .mcp.json with gsd-harness"
    fi
}

# Step 4: Verify shared commands
verify_shared_commands() {
    echo ""
    echo -e "${YELLOW}Step 4: Verifying shared commands...${NC}"

    if [ -d "$SHARED_COMMANDS_PATH/commands/gsd" ]; then
        echo -e "${GREEN}✓${NC} Shared GSD commands found"

        if [ -f "$SHARED_COMMANDS_PATH/commands/gsd/orchestrate.md" ]; then
            echo -e "${GREEN}✓${NC} gsd:orchestrate command available"
        else
            echo -e "${YELLOW}!${NC} gsd:orchestrate command not found in shared commands"
        fi
    else
        echo -e "${YELLOW}!${NC} Shared commands not found (optional)"
        echo "   The orchestrate workflow is also available via /gsd:orchestrate skill"
    fi
}

# Step 5: Verify GSD installation
verify_gsd() {
    echo ""
    echo -e "${YELLOW}Step 5: Verifying GSD installation...${NC}"

    if [ -d "$PROJECT_DIR/.claude/get-shit-done" ]; then
        echo -e "${GREEN}✓${NC} GSD is installed in this project"
    else
        echo -e "${YELLOW}!${NC} GSD not installed in this project"
        echo ""
        echo "   Install GSD first:"
        echo "   npx get-shit-done-cc --global"
        echo ""
        echo "   Then initialize your project:"
        echo "   /gsd:new-project"
    fi
}

# Step 6: Print summary
print_summary() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  Setup Complete                                               ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Harness path:${NC} $HARNESS_PATH"
    echo -e "${GREEN}MCP config:${NC} $PROJECT_DIR/.mcp.json"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo ""
    echo "1. Restart Claude Code to load the MCP configuration"
    echo ""
    echo "2. Verify harness tools are available:"
    echo "   - Look for gsd_* tools in Claude Code"
    echo ""
    echo "3. Start orchestrating:"
    echo "   /gsd:orchestrate"
    echo ""
    echo "4. View dashboard:"
    echo "   http://localhost:3333"
    echo ""
}

# Main execution
main() {
    find_or_install_harness
    FIND_RESULT=$?

    if [ $FIND_RESULT -eq 1 ]; then
        build_harness
    fi

    create_mcp_config
    verify_shared_commands
    verify_gsd
    print_summary
}

main "$@"
