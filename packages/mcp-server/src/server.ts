import type { PersistentSessionManager } from '@gsd/session-manager';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * MCP server version - should match package.json.
 */
const SERVER_VERSION = '0.1.0';

/**
 * GsdMcpServer provides MCP tools for Claude Code to orchestrate GSD sessions.
 *
 * This server uses stdio transport for integration with Claude Code.
 * Tools will be registered in subsequent plans (03-02, 03-03).
 */
export class GsdMcpServer {
  private server: McpServer;
  private manager: PersistentSessionManager;
  private transport: StdioServerTransport | null = null;

  constructor(manager: PersistentSessionManager) {
    this.manager = manager;
    this.server = new McpServer(
      {
        name: 'gsd-harness',
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Tools will be registered here in 03-02 and 03-03
    this.registerTools();
  }

  /**
   * Register MCP tools.
   * Placeholder for tool implementations in 03-02 and 03-03.
   */
  private registerTools(): void {
    // Tool registrations will be added in subsequent plans:
    // 03-02: gsd_start_session, gsd_list_sessions, gsd_end_session
    // 03-03: gsd_get_output, gsd_get_state, gsd_get_checkpoint
  }

  /**
   * Starts the MCP server with stdio transport.
   * This connects to Claude Code via stdin/stdout.
   */
  async start(): Promise<void> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
  }

  /**
   * Closes the MCP server and cleans up resources.
   */
  async close(): Promise<void> {
    await this.server.close();
    await this.manager.close();
  }

  /**
   * Gets the underlying PersistentSessionManager.
   * Useful for testing.
   */
  getManager(): PersistentSessionManager {
    return this.manager;
  }
}
