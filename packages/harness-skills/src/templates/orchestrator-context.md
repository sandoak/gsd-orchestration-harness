# Orchestrator Context

This document provides context for the harness orchestrator when managing worker sessions.

## Credential Access

Use the `CredentialProvider` class to programmatically look up credentials:

```typescript
import { CredentialProvider, lookupCredentials } from '@gsd/session-manager';

// When worker sends 'credentials_needed' message:
const result = lookupCredentials(
  message.payload.service, // e.g., 'postgres'
  message.payload.envVars, // e.g., ['DATABASE_URL']
  message.payload.context // e.g., 'production'
);

// Respond with credentials
harness_respond({
  type: 'credentials_provided',
  sessionId: message.sessionId,
  inResponseTo: message.id,
  payload: {
    phase: message.payload.phase,
    plan: message.payload.plan,
    service: message.payload.service,
    credentials: result.credentials, // { "DATABASE_URL": "...", ... }
    found: result.found,
    error: result.error,
    instructions: result.instructions,
  },
});
```

**Default credentials directory:**

```
/mnt/dev-linux/projects/server-maintenance/docs/servers/
```

Override via `HARNESS_CREDENTIALS_DIR` environment variable.

### Known Services

| Service    | Env Vars                                          |
| ---------- | ------------------------------------------------- |
| postgres   | DATABASE_URL, PGPASSWORD, PGUSER, PGHOST, etc.    |
| redis      | REDIS_URL, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD |
| supabase   | SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY  |
| stripe     | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET          |
| openai     | OPENAI_API_KEY, OPENAI_ORG_ID                     |
| anthropic  | ANTHROPIC_API_KEY                                 |
| aws        | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY          |
| github     | GITHUB_TOKEN, GH_TOKEN                            |
| sendgrid   | SENDGRID_API_KEY                                  |
| twilio     | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN             |
| vercel     | VERCEL_TOKEN                                      |
| cloudflare | CLOUDFLARE_API_TOKEN                              |

### Credential File Format

Files should use `.env` format:

```
DATABASE_URL=postgresql://user:pass@host:5432/db
PGPASSWORD=secret
```

### Security

- Never include credentials in logs
- Credentials are not stored in the database
- Worker receives credentials via structured message protocol
- Set up per-environment files: `postgres-production.env`, `postgres-staging.env`

## Worker Management

### Session Lifecycle

1. **Spawn** - Create new session with `harness_start_session`
2. **Assign** - Send task assignment via protocol
3. **Monitor** - Watch for state changes via `harness_wait_for_state`
4. **Respond** - Reply to worker messages via `harness_respond`
5. **Terminate** - End session with `harness_end_session`

### Parallel Execution

Use the dependency graph to determine what can run in parallel:

```
harness_get_project_state → dependency-graph.json
  → Find plans with satisfied dependencies
  → Check active-files.json for conflicts
  → Spawn workers for non-conflicting plans
```

### Verification Workflow

After plan execution:

1. Run auto verifications via `VerificationEngine`
2. Run Playwright verifications via browser MCP
3. Queue human verifications for user review
4. Respond to worker with verification results

## State Tracking

### Files to Monitor

```
.orchestration/
  config.yaml                    # Orchestration settings
  dependency-graph.json          # Plan dependencies
  active-files.json              # Files being modified
  sessions/{id}/
    status.json                  # Worker status
    checkpoint.json              # Active checkpoint
    checkpoint_response.json     # Your response
    result.json                  # Execution result
```

### ROADMAP.md Frontmatter

Quick state from frontmatter (faster than parsing):

```yaml
current_phase: 3
current_plan: 2
status: executing
total_phases: 7
completed_plans: 8
```

## Authentication

Workers use the local machine's Claude Code authentication:

- **Claude Max** - Local subscription
- **API Key** - Environment variable `ANTHROPIC_API_KEY`
- **OAuth** - Claude Code's OAuth flow

The orchestrator inherits the same auth as the parent process.

## Error Handling

### Worker Failures

When a worker reports `task_failed`:

1. Check if recoverable
2. If recoverable: Provide missing info, retry
3. If not recoverable: Log, notify user, abort plan

### Checkpoint Timeouts

If a worker waits too long for response:

1. Check checkpoint.json for pending checkpoint
2. Respond via checkpoint_response.json or `harness_respond`
3. Worker will pick up response and continue

### Crash Recovery

On restart:

1. Read `.orchestration/sessions/*/status.json`
2. Find sessions in `running` or `checkpoint` state
3. Resume via `harness_start_session` with resume flag

## Available MCP Tools

| Tool                   | Purpose                           |
| ---------------------- | --------------------------------- |
| harness_start_session  | Spawn new worker session          |
| harness_list_sessions  | List all sessions                 |
| harness_get_output     | Get session output                |
| harness_wait_for_state | Wait for state change (efficient) |
| harness_respond        | Respond to worker message         |
| harness_get_pending    | Get pending worker messages       |
| harness_get_state      | Get project state from files      |
| harness_end_session    | Terminate session                 |
| harness_sync_state     | Sync state from files             |
| harness_set_state      | Set execution state               |

## Verification Engine

Use the `VerificationEngine` class to run verifications:

```typescript
const engine = new VerificationEngine({
  projectRoot: '/path/to/project',
  apiBaseUrl: 'http://localhost:3000',
  onPlaywrightRequired: async (spec) => {
    // Use Playwright MCP to run browser verification
  },
  onHumanRequired: async (spec) => {
    // Queue for user review
  },
});

const report = await engine.verify(manifest);
```

## User Communication

The user sees:

- Dashboard at `http://localhost:4173`
- Session status, output, checkpoints
- Verification requests

Respond to user via dashboard or `harness_respond` to worker.
