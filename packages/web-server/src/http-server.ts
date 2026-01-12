import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';

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
  private isRunning = false;

  constructor(options?: FastifyServerOptions) {
    this.port = options?.port ?? 3333;
    this.host = options?.host ?? '0.0.0.0';

    this.app = Fastify({
      logger: false, // Disable logging for library use
    });

    this.registerPlugins();
    this.registerRoutes();
  }

  /**
   * Registers core plugins (CORS).
   */
  private registerPlugins(): void {
    // Register CORS for browser access
    void this.app.register(cors, {
      origin: true, // Allow all origins for local development
    });
  }

  /**
   * Registers core routes (health check).
   */
  private registerRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async () => {
      return { status: 'ok' };
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
   */
  get address(): string {
    return `http://${this.host}:${this.port}`;
  }

  /**
   * Returns whether the server is currently running.
   */
  get running(): boolean {
    return this.isRunning;
  }
}
