/**
 * Credential Provider
 *
 * Programmatic access to server credentials stored in the credentials directory.
 * Called by the orchestrator when a worker requests credentials via the
 * 'credentials_needed' message type.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Default credentials directory.
 * Can be overridden via HARNESS_CREDENTIALS_DIR environment variable.
 */
export const DEFAULT_CREDENTIALS_DIR = '/mnt/dev-linux/projects/server-maintenance/docs/servers';

/**
 * Result of a credential lookup.
 */
export interface CredentialLookupResult {
  /** Whether credentials were found */
  found: boolean;
  /** Credentials as env var name -> value map */
  credentials: Record<string, string>;
  /** Error message if not found */
  error?: string;
  /** Setup instructions if credentials need to be configured */
  instructions?: string;
  /** Source file where credentials were found */
  source?: string;
}

/**
 * Known service configurations.
 * Maps service names to expected env vars and common file patterns.
 */
export const KNOWN_SERVICES: Record<
  string,
  {
    envVars: string[];
    filePatterns: string[];
    instructions: string;
  }
> = {
  postgres: {
    envVars: ['DATABASE_URL', 'PGPASSWORD', 'PGUSER', 'PGHOST', 'PGPORT', 'PGDATABASE'],
    filePatterns: ['postgres', 'postgresql', 'database', 'db'],
    instructions: 'Create a file in the credentials directory with DATABASE_URL or PG* variables.',
  },
  redis: {
    envVars: ['REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'],
    filePatterns: ['redis'],
    instructions: 'Create a file in the credentials directory with REDIS_URL.',
  },
  supabase: {
    envVars: ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY'],
    filePatterns: ['supabase'],
    instructions: 'Create a file in the credentials directory with SUPABASE_URL and SUPABASE_KEY.',
  },
  stripe: {
    envVars: [
      'STRIPE_SECRET_KEY',
      'STRIPE_PUBLISHABLE_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_API_KEY',
    ],
    filePatterns: ['stripe'],
    instructions:
      'Create a file in the credentials directory with STRIPE_SECRET_KEY from your Stripe dashboard.',
  },
  openai: {
    envVars: ['OPENAI_API_KEY', 'OPENAI_ORG_ID'],
    filePatterns: ['openai', 'gpt'],
    instructions:
      'Create a file in the credentials directory with OPENAI_API_KEY from platform.openai.com.',
  },
  anthropic: {
    envVars: ['ANTHROPIC_API_KEY'],
    filePatterns: ['anthropic', 'claude'],
    instructions:
      'Create a file in the credentials directory with ANTHROPIC_API_KEY from console.anthropic.com.',
  },
  aws: {
    envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_DEFAULT_REGION'],
    filePatterns: ['aws', 'amazon'],
    instructions:
      'Create a file in the credentials directory with AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
  },
  github: {
    envVars: ['GITHUB_TOKEN', 'GITHUB_API_TOKEN', 'GH_TOKEN'],
    filePatterns: ['github', 'gh'],
    instructions:
      'Create a file in the credentials directory with GITHUB_TOKEN from github.com/settings/tokens.',
  },
  sendgrid: {
    envVars: ['SENDGRID_API_KEY'],
    filePatterns: ['sendgrid'],
    instructions:
      'Create a file in the credentials directory with SENDGRID_API_KEY from app.sendgrid.com.',
  },
  twilio: {
    envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    filePatterns: ['twilio'],
    instructions:
      'Create a file in the credentials directory with TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN from twilio.com/console.',
  },
  vercel: {
    envVars: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'],
    filePatterns: ['vercel'],
    instructions:
      'Create a file in the credentials directory with VERCEL_TOKEN from vercel.com/account/tokens.',
  },
  cloudflare: {
    envVars: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_ZONE_ID'],
    filePatterns: ['cloudflare', 'cf'],
    instructions:
      'Create a file in the credentials directory with CLOUDFLARE_API_TOKEN from dash.cloudflare.com.',
  },
};

/**
 * Credential Provider for looking up server credentials.
 */
export class CredentialProvider {
  private readonly credentialsDir: string;

  constructor(credentialsDir?: string) {
    this.credentialsDir =
      credentialsDir ?? process.env.HARNESS_CREDENTIALS_DIR ?? DEFAULT_CREDENTIALS_DIR;
  }

  /**
   * Look up credentials for a service.
   *
   * @param service - Service name (e.g., 'postgres', 'stripe')
   * @param envVars - Specific env vars to look for (optional, uses defaults if not provided)
   * @param context - Additional context (e.g., 'production', 'staging')
   */
  lookup(service: string, envVars?: string[], context?: string): CredentialLookupResult {
    const serviceKey = service.toLowerCase();
    const serviceConfig = KNOWN_SERVICES[serviceKey];

    // Determine which env vars to look for
    const targetVars = envVars ?? serviceConfig?.envVars ?? [];
    if (targetVars.length === 0) {
      return {
        found: false,
        credentials: {},
        error: `Unknown service '${service}' and no env vars specified`,
        instructions: 'Specify the env vars you need or add the service to KNOWN_SERVICES.',
      };
    }

    // Check if credentials directory exists
    if (!existsSync(this.credentialsDir)) {
      return {
        found: false,
        credentials: {},
        error: `Credentials directory not found: ${this.credentialsDir}`,
        instructions: `Create the credentials directory at ${this.credentialsDir}`,
      };
    }

    // Find matching credential files
    const filePatterns = serviceConfig?.filePatterns ?? [serviceKey];
    const matchingFiles = this.findMatchingFiles(filePatterns, context);

    if (matchingFiles.length === 0) {
      return {
        found: false,
        credentials: {},
        error: `No credential files found for service '${service}'`,
        instructions:
          serviceConfig?.instructions ??
          `Create a file in ${this.credentialsDir} matching patterns: ${filePatterns.join(', ')}`,
      };
    }

    // Parse credentials from matching files
    const credentials: Record<string, string> = {};
    let source: string | undefined;

    for (const file of matchingFiles) {
      const filePath = join(this.credentialsDir, file);
      const parsed = this.parseCredentialFile(filePath, targetVars);

      if (Object.keys(parsed).length > 0) {
        Object.assign(credentials, parsed);
        source = source ? `${source}, ${file}` : file;
      }
    }

    // Check if we found all requested vars
    const foundVars = Object.keys(credentials);
    const missingVars = targetVars.filter((v) => !foundVars.includes(v));

    if (foundVars.length === 0) {
      return {
        found: false,
        credentials: {},
        error: `No matching env vars found in credential files for '${service}'`,
        instructions:
          serviceConfig?.instructions ??
          `Add these env vars to a credential file: ${targetVars.join(', ')}`,
      };
    }

    return {
      found: true,
      credentials,
      source,
      instructions:
        missingVars.length > 0
          ? `Found ${foundVars.length}/${targetVars.length} vars. Missing: ${missingVars.join(', ')}`
          : undefined,
    };
  }

  /**
   * Find files in credentials directory matching patterns.
   */
  private findMatchingFiles(patterns: string[], context?: string): string[] {
    try {
      const files = readdirSync(this.credentialsDir);
      const matching: string[] = [];

      for (const file of files) {
        const lower = file.toLowerCase();

        // Check if file matches any pattern
        for (const pattern of patterns) {
          if (lower.includes(pattern.toLowerCase())) {
            // If context specified, prefer files with that context
            if (context) {
              if (lower.includes(context.toLowerCase())) {
                // Context match - prioritize by adding to front
                matching.unshift(file);
              } else {
                matching.push(file);
              }
            } else {
              matching.push(file);
            }
            break;
          }
        }
      }

      return matching;
    } catch {
      return [];
    }
  }

  /**
   * Parse a credential file for specific env vars.
   * Supports .env format and simple KEY=VALUE format.
   */
  private parseCredentialFile(filePath: string, targetVars: string[]): Record<string, string> {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const credentials: Record<string, string> = {};

      // Match KEY=VALUE patterns (handles quotes and no quotes)
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();

        // Skip comments and empty lines
        if (trimmed.startsWith('#') || trimmed === '') {
          continue;
        }

        // Parse KEY=VALUE
        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
        if (match && match[1] && match[2] !== undefined) {
          const key = match[1].toUpperCase();
          let value = match[2];

          // Remove surrounding quotes
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

          // Only include if it's a target var
          if (targetVars.some((v) => v.toUpperCase() === key)) {
            credentials[key] = value;
          }
        }
      }

      return credentials;
    } catch {
      return {};
    }
  }

  /**
   * List all available services in the credentials directory.
   */
  listAvailableServices(): string[] {
    if (!existsSync(this.credentialsDir)) {
      return [];
    }

    try {
      const files = readdirSync(this.credentialsDir);
      const services: Set<string> = new Set();

      for (const file of files) {
        const lower = file.toLowerCase();

        // Check against known services
        for (const [service, config] of Object.entries(KNOWN_SERVICES)) {
          if (config.filePatterns.some((p) => lower.includes(p.toLowerCase()))) {
            services.add(service);
          }
        }
      }

      return Array.from(services);
    } catch {
      return [];
    }
  }

  /**
   * Get the credentials directory path.
   */
  getCredentialsDir(): string {
    return this.credentialsDir;
  }
}

/**
 * Default credential provider instance.
 */
let defaultProvider: CredentialProvider | null = null;

/**
 * Get the default credential provider.
 */
export function getCredentialProvider(): CredentialProvider {
  if (!defaultProvider) {
    defaultProvider = new CredentialProvider();
  }
  return defaultProvider;
}

/**
 * Look up credentials using the default provider.
 */
export function lookupCredentials(
  service: string,
  envVars?: string[],
  context?: string
): CredentialLookupResult {
  return getCredentialProvider().lookup(service, envVars, context);
}
