import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Base version - bump major/minor manually for breaking changes.
 * Patch number is auto-calculated from git commit count.
 */
const VERSION_BASE = '0.2';

/**
 * Get version info from git (cached at startup).
 */
const GIT_INFO = ((): { commit: string; version: string } => {
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const commitCount = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();
    return {
      commit,
      version: `${VERSION_BASE}.${commitCount}`,
    };
  } catch {
    return {
      commit: 'unknown',
      version: `${VERSION_BASE}.0`,
    };
  }
})();

/**
 * Build timestamp (when this module was loaded).
 */
const BUILD_TIME = new Date().toISOString();

export interface FastifyServerOptions {
  /**
   * Port to listen on.
   * @default 3333
   */
  port?: number;

  /**
   * Host to bind to.
   * @default '0.0.0.0'
   */
  host?: string;

  /**
   * Path to dashboard static files directory.
   * If not provided, attempts to find dashboard dist relative to this package.
   */
  dashboardPath?: string;
}

/**
 * FastifyServer wraps a Fastify instance with CORS and health endpoint.
 *
 * This is the base HTTP server component. WebSocket support is added
 * via composition with WsServer.
 */
export class FastifyServer {
  readonly app: FastifyInstance;
  private readonly port: number;
  private readonly host: string;
  private readonly dashboardPath: string | null;
  private isRunning = false;

  constructor(options?: FastifyServerOptions) {
    this.port = options?.port ?? 3333;
    this.host = options?.host ?? '0.0.0.0';
    this.dashboardPath = this.resolveDashboardPath(options?.dashboardPath);

    this.app = Fastify({
      logger: false, // Disable logging for library use
    });

    this.registerPlugins();
    this.registerRoutes();
  }

  /**
   * Resolves the path to dashboard static files.
   * Returns null if dashboard is not found.
   */
  private resolveDashboardPath(providedPath?: string): string | null {
    // Use provided path if given
    if (providedPath && existsSync(providedPath)) {
      return providedPath;
    }

    // Try to find dashboard relative to this package
    // packages/web-server/dist/http-server.js -> packages/dashboard/dist
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const relativeToWebServer = join(__dirname, '..', '..', 'dashboard', 'dist');

    if (existsSync(relativeToWebServer)) {
      return relativeToWebServer;
    }

    // Try from monorepo root (when running from packages/harness)
    const relativeToHarness = join(__dirname, '..', '..', '..', 'dashboard', 'dist');

    if (existsSync(relativeToHarness)) {
      return relativeToHarness;
    }

    return null;
  }

  /**
   * Registers core plugins (CORS, static files).
   */
  private registerPlugins(): void {
    // Register CORS for browser access
    void this.app.register(cors, {
      origin: true, // Allow all origins for local development
    });

    // Register static file serving for dashboard if available
    if (this.dashboardPath) {
      void this.app.register(fastifyStatic, {
        root: this.dashboardPath,
        prefix: '/',
        // Serve index.html for SPA routes
        wildcard: false,
      });

      // Fallback to index.html for SPA client-side routing
      this.app.setNotFoundHandler(async (_request, reply) => {
        return reply.sendFile('index.html');
      });
    }
  }

  /**
   * Registers core routes (health check).
   */
  private registerRoutes(): void {
    // Health check endpoint with version info
    this.app.get('/health', async () => {
      return {
        status: 'ok',
        version: GIT_INFO.version,
        commit: GIT_INFO.commit,
        started: BUILD_TIME,
      };
    });
  }

  /**
   * Starts the HTTP server.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    await this.app.listen({
      port: this.port,
      host: this.host,
    });

    this.isRunning = true;
  }

  /**
   * Stops the HTTP server gracefully.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    await this.app.close();
    this.isRunning = false;
  }

  /**
   * Returns the server address once running.
   * Uses actual listening address when available (important for port=0).
   */
  get address(): string {
    if (this.isRunning) {
      const addr = this.app.server.address();
      if (addr && typeof addr === 'object') {
        return `http://${addr.address}:${addr.port}`;
      }
    }
    return `http://${this.host}:${this.port}`;
  }

  /**
   * Returns whether the server is currently running.
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Returns whether the dashboard is being served.
   */
  get servingDashboard(): boolean {
    return this.dashboardPath !== null;
  }
}
