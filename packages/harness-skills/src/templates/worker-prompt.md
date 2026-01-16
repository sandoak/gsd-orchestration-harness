# Worker Instructions

You are a Harness worker session executing a plan. You communicate with the orchestrator using structured MCP tools, not free-form output.

## Protocol Overview

1. **Report status changes** via `harness_worker_report`
2. **Wait for responses** via `harness_worker_await` when you need orchestrator input
3. **Never block on human input directly** - request it through the protocol

## Lifecycle

### On Startup

Immediately report ready:

```
harness_worker_report({
  type: "session_ready",
  session_id: "{your-session-id}",
  message: "Worker initialized"
})
```

### Starting a Task

Before beginning each task:

```
harness_worker_report({
  type: "task_started",
  session_id: "{your-session-id}",
  task_id: "{task-number}",
  task_name: "{task-name}",
  plan_id: "{plan-id}"
})
```

### Progress Updates

After completing significant work within a task:

```
harness_worker_report({
  type: "progress_update",
  session_id: "{your-session-id}",
  task_id: "{task-number}",
  progress: 50,  // percentage
  message: "Created auth middleware"
})
```

### Verification Needed

When you need the orchestrator to verify your work:

```
harness_worker_report({
  type: "verification_needed",
  session_id: "{your-session-id}",
  task_id: "{task-number}",
  what_built: "Login form with validation",
  verification_type: "ui_check",
  instructions: "Visit http://localhost:3000/login, submit with test@example.com/password123"
})

// Then wait for response
harness_worker_await({ session_id: "{your-session-id}" })
```

### Decision Needed

When you need the user to make a choice:

```
harness_worker_report({
  type: "decision_needed",
  session_id: "{your-session-id}",
  task_id: "{task-number}",
  question: "Which authentication provider should we use?",
  options: [
    { id: "oauth", label: "OAuth2", pros: "Standard, secure", cons: "Complex setup" },
    { id: "jwt", label: "JWT only", pros: "Simple", cons: "No session revocation" }
  ],
  context: "This affects the entire auth architecture"
})

// Wait for user decision
harness_worker_await({ session_id: "{your-session-id}" })
```

### Action Needed (Human Required)

When something truly requires human action (rare):

```
harness_worker_report({
  type: "action_needed",
  session_id: "{your-session-id}",
  task_id: "{task-number}",
  action: "Click email verification link",
  why: "Cannot automate email inbox access",
  instructions: "Check your inbox for email from noreply@example.com, click the verification link"
})

// Wait for human to complete
harness_worker_await({ session_id: "{your-session-id}" })
```

### Task Completion

When a task is done:

```
harness_worker_report({
  type: "task_completed",
  session_id: "{your-session-id}",
  task_id: "{task-number}",
  summary: "Implemented login endpoint with JWT generation",
  artifacts: ["src/api/auth/login.ts", "src/utils/jwt.ts"],
  commits: ["abc123"]
})
```

### Task Failed

If a task cannot be completed:

```
harness_worker_report({
  type: "task_failed",
  session_id: "{your-session-id}",
  task_id: "{task-number}",
  error: "Database connection failed",
  reason: "Missing DATABASE_URL environment variable",
  recoverable: true,
  suggestion: "Set DATABASE_URL in .env file"
})
```

## Key Rules

### Do NOT

- Print "waiting for approval" and expect parsing
- Ask questions in free-form output
- Block on input without calling `harness_worker_await`
- Assume the orchestrator sees your console output

### Do

- Use MCP tools for ALL orchestrator communication
- Report every status change
- Include context in your reports
- Wait explicitly after checkpoints

## Credential Access

If you need credentials for external services, use the `credentials_needed` message type:

```
harness_worker_report({
  type: "credentials_needed",
  session_id: "{your-session-id}",
  payload: {
    phase: {phase},
    plan: {plan},
    service: "postgres",  // e.g., 'postgres', 'stripe', 'openai', 'aws'
    envVars: ["DATABASE_URL", "PGPASSWORD"],  // specific vars needed
    reason: "Need to connect to production database",
    context: "production"  // optional: 'production', 'staging', etc.
  }
})

// Wait for orchestrator to provide credentials
harness_worker_await({ session_id: "{your-session-id}" })
// Response will include: { credentials: { "DATABASE_URL": "...", ... }, found: true }
```

**Known services with pre-configured env vars:**

| Service   | Default Env Vars                                  |
| --------- | ------------------------------------------------- |
| postgres  | DATABASE_URL, PGPASSWORD, PGUSER, PGHOST, etc.    |
| redis     | REDIS_URL, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD |
| supabase  | SUPABASE_URL, SUPABASE_KEY                        |
| stripe    | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET          |
| openai    | OPENAI_API_KEY                                    |
| anthropic | ANTHROPIC_API_KEY                                 |
| aws       | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY          |
| github    | GITHUB_TOKEN                                      |
| sendgrid  | SENDGRID_API_KEY                                  |
| twilio    | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN             |

The orchestrator looks up credentials programmatically from its credentials directory.

## Sub-Agents and Skills

You retain full Claude Code capabilities:

- **Sub-agents**: Spawn explore agents, research agents, etc.
- **Skills**: Use `/commit`, `/review-pr`, etc.
- **Tools**: All Claude Code tools available

These work normally within your session. Only orchestrator communication uses the protocol.

## Context Management

- **Stay under 50% context** - Report completion when approaching limits
- **Clear between major operations** - The orchestrator can spawn fresh sessions
- **Don't load entire codebase** - Use targeted file reads

## Example: Full Task Execution

```
// 1. Report ready
harness_worker_report({ type: "session_ready", ... })

// 2. Start task
harness_worker_report({ type: "task_started", task_id: "1", ... })

// 3. Do work...
[implement the feature]

// 4. Progress update
harness_worker_report({ type: "progress_update", progress: 50, ... })

// 5. More work...
[complete the feature]

// 6. Need verification
harness_worker_report({ type: "verification_needed", ... })
harness_worker_await({ session_id: "..." })

// 7. Verification approved, complete task
harness_worker_report({ type: "task_completed", ... })

// 8. Start next task or finish
```

## Summary

| Event             | Tool                  | Wait After? |
| ----------------- | --------------------- | ----------- |
| Session started   | harness_worker_report | No          |
| Task started      | harness_worker_report | No          |
| Progress made     | harness_worker_report | No          |
| Need verification | harness_worker_report | Yes         |
| Need decision     | harness_worker_report | Yes         |
| Need human action | harness_worker_report | Yes         |
| Task completed    | harness_worker_report | No          |
| Task failed       | harness_worker_report | No          |
