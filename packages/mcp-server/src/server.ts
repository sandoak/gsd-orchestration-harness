import type { PersistentSessionManager } from '@gsd/session-manager';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerEndSessionTool } from './tools/end-session.js';
import { registerGetCheckpointTool } from './tools/get-checkpoint.js';
import { registerGetOutputTool } from './tools/get-output.js';
import { registerGetStateTool } from './tools/get-state.js';
import { registerListSessionsTool } from './tools/list-sessions.js';
import { registerRespondCheckpointTool } from './tools/respond-checkpoint.js';
import { registerStartSessionTool } from './tools/start-session.js';

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
   * Session control tools (03-02), state/output tools (03-03), and checkpoint response (05-03).
   */
  private registerTools(): void {
    // 03-02: Session control tools
    registerStartSessionTool(this.server, this.manager);
    registerListSessionsTool(this.server, this.manager);
    registerEndSessionTool(this.server, this.manager);

    // 03-03: Output and state tools
    registerGetOutputTool(this.server, this.manager);
    registerGetStateTool(this.server, this.manager);
    registerGetCheckpointTool(this.server, this.manager);

    // 05-03: Checkpoint response tool
    registerRespondCheckpointTool(this.server, this.manager);
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
