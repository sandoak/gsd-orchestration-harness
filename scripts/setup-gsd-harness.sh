#!/bin/bash
#
# setup-gsd-harness.sh - GSD Orchestration Harness Setup
#
# Run this script from any project directory to enable harness functionality.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/[org]/gsd-orchestration-harness/main/scripts/setup-gsd-harness.sh | bash
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
HARNESS_REPO="https://github.com/[your-org]/gsd-orchestration-harness.git"
HARNESS_DEFAULT_PATH="$HOME/.gsd-harness"
SHARED_COMMANDS_PATH="/mnt/dev-linux/projects/general-reference/claude-shared-commands-agents-skills"
MCP_CONFIG_TEMPLATE=".mcp.harness.json"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  GSD Orchestration Harness - Project Setup                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get current project directory
PROJECT_DIR="$(pwd)"
echo -e "${GREEN}Project directory:${NC} $PROJECT_DIR"

# Step 1: Find or prompt for harness location
find_harness() {
    echo ""
    echo -e "${YELLOW}Step 1: Locating harness installation...${NC}"

    # Check common locations
    HARNESS_PATH=""

    # Check if running from within harness repo
    if [ -f "./packages/harness/dist/index.js" ]; then
        HARNESS_PATH="$(pwd)"
        echo -e "${GREEN}✓${NC} Found harness in current directory"
        return 0
    fi

    # Check default installation path
    if [ -f "$HARNESS_DEFAULT_PATH/packages/harness/dist/index.js" ]; then
        HARNESS_PATH="$HARNESS_DEFAULT_PATH"
        echo -e "${GREEN}✓${NC} Found harness at $HARNESS_PATH"
        return 0
    fi

    # Check relative to script location
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$SCRIPT_DIR/../packages/harness/dist/index.js" ]; then
        HARNESS_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
        echo -e "${GREEN}✓${NC} Found harness at $HARNESS_PATH"
        return 0
    fi

    # Check if harness needs to be built
    if [ -f "$SCRIPT_DIR/../packages/harness/src/index.ts" ]; then
        HARNESS_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
        echo -e "${YELLOW}!${NC} Found harness source at $HARNESS_PATH (needs build)"
        return 1
    fi

    echo -e "${RED}✗${NC} Harness not found"
    return 2
}

# Step 2: Build harness if needed
build_harness() {
    echo ""
    echo -e "${YELLOW}Step 2: Building harness...${NC}"

    cd "$HARNESS_PATH"

    if ! command -v pnpm &> /dev/null; then
        echo -e "${RED}✗${NC} pnpm not found. Install with: npm install -g pnpm"
        exit 1
    fi

    echo "Installing dependencies..."
    pnpm install --silent

    echo "Building packages..."
    pnpm build --silent

    if [ -f "./packages/harness/dist/index.js" ]; then
        echo -e "${GREEN}✓${NC} Harness built successfully"
    else
        echo -e "${RED}✗${NC} Build failed"
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

        echo "Adding gsd-harness to existing config..."
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
        echo -e "${GREEN}✓${NC} Shared GSD commands found at $SHARED_COMMANDS_PATH"

        if [ -f "$SHARED_COMMANDS_PATH/commands/gsd/orchestrate.md" ]; then
            echo -e "${GREEN}✓${NC} gsd:orchestrate command available"
        else
            echo -e "${YELLOW}!${NC} gsd:orchestrate command not found in shared commands"
        fi
    else
        echo -e "${YELLOW}!${NC} Shared commands not found at expected path"
        echo "   Expected: $SHARED_COMMANDS_PATH"
        echo ""
        echo "   The GSD workflow files should be in your project at:"
        echo "   .claude/get-shit-done/workflows/orchestrate.md"
    fi
}

# Step 5: Verify workflow files
verify_workflow_files() {
    echo ""
    echo -e "${YELLOW}Step 5: Verifying workflow files...${NC}"

    WORKFLOW_FILE="$PROJECT_DIR/.claude/get-shit-done/workflows/orchestrate.md"

    if [ -f "$WORKFLOW_FILE" ]; then
        echo -e "${GREEN}✓${NC} orchestrate.md workflow exists"
    else
        echo -e "${YELLOW}!${NC} orchestrate.md workflow not found"
        echo ""
        echo "   Copy from harness repo:"
        echo "   cp $HARNESS_PATH/.claude/get-shit-done/workflows/orchestrate.md \\"
        echo "      $PROJECT_DIR/.claude/get-shit-done/workflows/"
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
    find_harness
    FIND_RESULT=$?

    if [ $FIND_RESULT -eq 2 ]; then
        echo ""
        echo -e "${YELLOW}Harness not installed. Options:${NC}"
        echo ""
        echo "1. Clone and build:"
        echo "   git clone $HARNESS_REPO $HARNESS_DEFAULT_PATH"
        echo "   cd $HARNESS_DEFAULT_PATH && pnpm install && pnpm build"
        echo ""
        echo "2. Re-run this script after installation"
        exit 1
    fi

    if [ $FIND_RESULT -eq 1 ]; then
        build_harness
    fi

    create_mcp_config
    verify_shared_commands
    verify_workflow_files
    print_summary
}

main "$@"
