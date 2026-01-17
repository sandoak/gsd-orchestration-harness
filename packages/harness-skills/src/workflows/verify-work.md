<purpose>
Validate built features through **runtime testing** with Playwright and actual API/database verification. Creates UAT.md that tracks test progress, survives /clear, and feeds gaps into /harness:plan-phase --gaps.

Claude RUNS the tests. Claude REPORTS results. No manual testing required.
</purpose>

<philosophy>
**Actually test, don't just inspect code.**

Claude must:

1. Start the dev server if not running
2. Use Playwright MCP to navigate and interact with UI
3. Use Bash to test APIs (curl) and check database
4. Verify actual behavior matches expected behavior
5. Report pass/fail based on REAL test results

**This is NOT code inspection.** Reading a file to check exports exist is NOT verification.
Verification means: "I navigated to the page, clicked the button, and saw X happen."

**When issues are found:** Report them in UAT.md. Do NOT attempt fixes in this workflow.
Issues get fixed via /harness:plan-phase --gaps → /harness:execute-phase.
</philosophy>

<template>
@./.harness/skills/templates/UAT.md
</template>

<process>

<step name="discover_planning_directory" priority="first">
Find the planning directory - supports both spec-centric and legacy structures:

```bash
# Try spec-centric structure first: specs/*/planning/plans/
SPEC_PLANS=$(ls -d specs/*/planning/plans 2>/dev/null | head -1)
if [ -n "$SPEC_PLANS" ]; then
  PLANNING_BASE="$SPEC_PLANS"
  SPEC_DIR=$(dirname $(dirname "$SPEC_PLANS"))
  STATE_FILE="$SPEC_DIR/STATE.md"
  echo "Using spec-centric structure: $PLANNING_BASE"
else
  # Fall back to legacy structure: .planning/phases/
  if [ -d ".planning/phases" ]; then
    PLANNING_BASE=".planning/phases"
    STATE_FILE=".planning/STATE.md"
    echo "Using legacy structure: $PLANNING_BASE"
  else
    echo "ERROR: No planning directory found"
    echo "Expected: specs/*/planning/plans/ OR .planning/phases/"
    exit 1
  fi
fi
```

Store these paths for use in subsequent steps:

- `$PLANNING_BASE` - Base directory containing phase subdirectories
- `$STATE_FILE` - Path to STATE.md
  </step>

<step name="ensure_dev_server_running">
**CRITICAL: Start the dev server before any testing**

Check if dev server is already running:

```bash
# Check common dev server ports
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "not running"
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "not running"
```

**If NOT running:**

1. Find the start command from package.json:

```bash
cat package.json | grep -A5 '"scripts"' | grep -E '"dev"|"start"'
```

2. Start the dev server in background:

```bash
# Start in background, capture output
nohup npm run dev > /tmp/dev-server.log 2>&1 &
DEV_SERVER_PID=$!
echo "Started dev server with PID: $DEV_SERVER_PID"

# Wait for server to be ready (max 30 seconds)
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200\|304"; then
    echo "Dev server ready on port 3000"
    break
  fi
  sleep 1
done
```

3. Store server info:

```
DEV_SERVER_URL=http://localhost:3000  # or detected port
DEV_SERVER_PID={pid}
```

**If ALREADY running:**

```
DEV_SERVER_URL=http://localhost:3000  # detected from curl
DEV_SERVER_PID=existing
```

**IMPORTANT:** Tests CANNOT proceed without a running dev server for UI testing.
</step>

<step name="initialize_playwright">
**Prepare Playwright for UI testing:**

```typescript
// Navigate to the app root to verify connection
mcp__playwright__browser_navigate({ url: DEV_SERVER_URL });

// Take initial snapshot to confirm app is accessible
mcp__playwright__browser_snapshot({});
```

If navigation fails → Dev server issue, abort with error.

**Store browser state:**

```
PLAYWRIGHT_READY=true
APP_BASE_URL={DEV_SERVER_URL}
```

</step>

<step name="configure_auth_bypass">
**CRITICAL: Set up authentication bypass BEFORE testing protected routes**

⚠️ **STOP - DO NOT TRY TO LOG IN NORMALLY** ⚠️

If you see an "Unauthorized", "Login", or "Sign In" page:

1. **DO NOT** look up admin credentials
2. **DO NOT** try to find admin emails in the database
3. **DO NOT** click login buttons or fill in forms
4. **INSTEAD** → Set the bypass cookie with ONE LINE:

```typescript
mcp__playwright__browser_evaluate({
  function: "() => { document.cookie = 'dev-admin-bypass=true; path=/'; return document.cookie; }",
});
```

Then refresh:

```typescript
mcp__playwright__browser_navigate({ url: 'http://localhost:3001' });
```

**This is the ONLY way to authenticate for testing.** OAuth/magic link logins are impossible to automate. The bypass cookie is the designed solution.

---

This step detects and configures auth bypass mechanisms so Playwright can access protected areas without real OAuth/magic link login.

**1. Detect bypass patterns in codebase:**

```bash
# Check for cookie-based bypass (middleware level)
grep -r "dev.*bypass" --include="*.ts" --include="*.tsx" -l . 2>/dev/null | head -5

# Check for header-based bypass (Playwright test secret)
grep -r "x-playwright-test-secret\|PLAYWRIGHT_TEST_SECRET" --include="*.ts" --include="*.tsx" -l . 2>/dev/null | head -5

# Check for bypass env vars
cat .env.local .env 2>/dev/null | grep -i "bypass\|playwright.*secret"
```

**2. Identify bypass type:**

| Pattern Found                    | Bypass Type | How to Apply                               |
| -------------------------------- | ----------- | ------------------------------------------ |
| `dev-admin-bypass`               | Cookie      | Set cookie via Playwright evaluate         |
| `dev-web-bypass`                 | Cookie      | Set cookie via Playwright evaluate         |
| `x-playwright-test-secret`       | Header      | Set header via Playwright extraHTTPHeaders |
| `PLAYWRIGHT_TEST_SECRET` in .env | Header      | Read secret, set header                    |

**3. Apply cookie-based bypass (if detected):**

```typescript
// Detect which app we're testing
const isAdmin = APP_BASE_URL.includes('3001') || APP_BASE_URL.includes('admin');
const cookieName = isAdmin ? 'dev-admin-bypass' : 'dev-web-bypass';

// Set bypass cookie via JavaScript
mcp__playwright__browser_evaluate({
  function: `() => { document.cookie = '${cookieName}=true; path=/'; return document.cookie; }`,
});

// Refresh to apply cookie
mcp__playwright__browser_navigate({ url: APP_BASE_URL });
```

**4. Apply header-based bypass (if detected):**

```bash
# Read the secret from env
PLAYWRIGHT_SECRET=$(grep PLAYWRIGHT_TEST_SECRET .env.local 2>/dev/null | cut -d= -f2)
if [ -z "$PLAYWRIGHT_SECRET" ]; then
  PLAYWRIGHT_SECRET=$(grep PLAYWRIGHT_TEST_SECRET .env 2>/dev/null | cut -d= -f2)
fi
```

If secret found, set extraHTTPHeaders in Playwright:

```typescript
// Header-based bypass requires custom page setup
// Note: This may require Playwright code execution
mcp__playwright__browser_run_code({
  code: `async (page) => {
    await page.setExtraHTTPHeaders({
      'x-playwright-test-secret': '${PLAYWRIGHT_SECRET}'
    });
  }`,
});
```

**5. Verify bypass works:**

```typescript
// Navigate to a protected route to verify bypass
const protectedUrl = APP_BASE_URL.includes('admin')
  ? APP_BASE_URL + '/'
  : APP_BASE_URL + '/account';

mcp__playwright__browser_navigate({ url: protectedUrl });
const snapshot = mcp__playwright__browser_snapshot({});

// Check if we're authenticated (not on login page)
// Look for: dashboard content, user menu, protected elements
// NOT: "Login", "Sign in", "Unauthorized", redirect to /login
```

**6. Store bypass configuration:**

```
AUTH_BYPASS_TYPE={cookie|header|none}
AUTH_BYPASS_APPLIED={true|false}
AUTH_BYPASS_COOKIE={cookie name if applicable}
AUTH_BYPASS_HEADER={header name if applicable}
```

**IMPORTANT:** If bypass detection fails, TRY ANYWAY with common patterns:

1. First try cookie: `dev-admin-bypass=true`
2. Then check for `PLAYWRIGHT_TEST_SECRET` in env files
3. Only fall back to code review if ALL bypass attempts fail AND feature requires auth

**NEVER immediately fall back to code review when hitting an auth wall. Try bypasses first.**
</step>

<step name="check_active_session">
**First: Check for active UAT sessions**

```bash
find "$PLANNING_BASE" -name "*-UAT.md" -type f 2>/dev/null | head -5
```

**If active sessions exist AND no $ARGUMENTS provided:**

Read each file's frontmatter (status, phase) and Current Test section.

Display inline:

```
## Active UAT Sessions

| # | Phase | Status | Current Test | Progress |
|---|-------|--------|--------------|----------|
| 1 | 04-comments | testing | 3. Reply to Comment | 2/6 |
| 2 | 05-auth | testing | 1. Login Form | 0/4 |

Reply with a number to resume, or provide a phase number to start new.
```

Wait for user response.

- If user replies with number (1, 2) → Load that file, go to `resume_from_file`
- If user replies with phase number → Treat as new session, go to `create_uat_file`

**If active sessions exist AND $ARGUMENTS provided:**

Check if session exists for that phase. If yes, offer to resume or restart.
If no, continue to `create_uat_file`.

**If no active sessions AND no $ARGUMENTS:**

```
No active UAT sessions.

Provide a phase number to start testing (e.g., /harness:verify-work 4)
```

**If no active sessions AND $ARGUMENTS provided:**

Continue to `create_uat_file`.
</step>

<step name="find_summaries">
**Find what to test:**

Parse $ARGUMENTS as phase number (e.g., "4") or plan number (e.g., "04-02").

```bash
# Find phase directory
PHASE_DIR=$(ls -d "$PLANNING_BASE"/${PHASE_ARG}* 2>/dev/null | head -1)

# Find SUMMARY files
ls "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null
```

Read each SUMMARY.md to extract testable deliverables.
</step>

<step name="extract_tests">
**Extract testable deliverables from SUMMARY.md and create executable test plans:**

Parse SUMMARY.md for:

1. **Accomplishments** - Features/functionality added
2. **User-facing changes** - UI, workflows, interactions
3. **API endpoints** - New or modified endpoints
4. **Database changes** - Tables, functions, triggers

**For EACH deliverable, create an EXECUTABLE test:**

| Test Type      | How to Test                                      |
| -------------- | ------------------------------------------------ |
| UI Feature     | Playwright: navigate, click, verify element/text |
| API Endpoint   | curl: call endpoint, verify response             |
| Database       | SQL query via supabase CLI or curl to API        |
| Error Handling | Trigger error condition, verify behavior         |

**Example test definitions:**

```yaml
- name: 'Error logging form submission'
  type: ui
  steps:
    - navigate: '/admin/errors'
    - action: "click button with text 'Test Error'"
    - verify: "toast appears with 'Error logged successfully'"
  expected: 'Error is logged and confirmation shown'

- name: 'Error list API returns data'
  type: api
  steps:
    - curl: 'GET /api/errors?limit=10'
    - verify: "status 200, body contains 'errors' array"
  expected: 'API returns paginated error list'

- name: 'log_error RPC function works'
  type: database
  steps:
    - call: 'supabase rpc log_error with test data'
    - verify: 'returns error_group_id UUID'
  expected: 'RPC creates error record and returns ID'
```

**IMPORTANT:** Each test must be EXECUTABLE, not just descriptive.

**Test type hierarchy (prefer higher):**

1. **Runtime UI test** (Playwright) - BEST for user-facing features
2. **Runtime API test** (curl) - BEST for endpoints
3. **Runtime DB test** (query) - BEST for data layer
4. **Code review** - LAST RESORT for non-observable changes only

**Code review is ONLY acceptable for:**

- Pure internal refactors (no behavior change)
- Type definition changes
- Configuration/build changes
- Documentation updates

If a feature CAN be tested at runtime, it MUST be tested at runtime.
</step>

<step name="create_test_scripts">
**If tests require scripts, create them:**

For complex test scenarios, create executable test scripts:

```bash
# Create test directory if needed
mkdir -p "$SPEC_DIR/execution/tests"
```

**For Playwright tests, create test file:**

```typescript
// $SPEC_DIR/execution/tests/phase-{N}-uat.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Phase {N} UAT', () => {
  test('{test name}', async ({ page }) => {
    await page.goto('{url}');
    await page.click('{selector}');
    await expect(page.locator('{selector}')).toBeVisible();
  });
});
```

**For API tests, create test script:**

```bash
#!/bin/bash
# $SPEC_DIR/execution/tests/phase-{N}-api-tests.sh

echo "Testing: {endpoint name}"
RESPONSE=$(curl -s -w "\n%{http_code}" {endpoint})
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$STATUS" = "200" ] && echo "$BODY" | grep -q "{expected}"; then
  echo "✓ PASS: {test name}"
else
  echo "✗ FAIL: {test name} - Status: $STATUS"
  exit 1
fi
```

**Test scripts are committed** so they can be re-run later.
</step>

<step name="create_uat_file">
**Create UAT file with all tests:**

```bash
mkdir -p "$PHASE_DIR"
```

Build test list from extracted deliverables.

Create file:

```markdown
---
status: testing
phase: XX-name
source: [list of SUMMARY.md files]
started: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

number: 1
name: [first test name]
expected: |
[what user should observe]
awaiting: user response

## Tests

### 1. [Test Name]

expected: [observable behavior]
result: [pending]

### 2. [Test Name]

expected: [observable behavior]
result: [pending]

...

## Summary

total: [N]
passed: 0
issues: 0
pending: [N]
skipped: 0

## Gaps

[none yet]
```

Write to `$PHASE_DIR/{phase}-UAT.md`

Proceed to `present_test`.
</step>

<step name="execute_test">
**EXECUTE the test - do not ask the user to test manually:**

Read Current Test from UAT file and EXECUTE it based on type:

**For UI tests (type: ui):**

```typescript
// 1. Navigate to the page
mcp__playwright__browser_navigate({ url: '{test.url}' });

// 2. Take snapshot to see current state
const snapshot = mcp__playwright__browser_snapshot({});

// 3. CHECK FOR AUTH WALL before proceeding
// If snapshot shows login page, unauthorized message, or redirect to /login:
if (
  snapshot.includes('login') ||
  snapshot.includes('unauthorized') ||
  snapshot.includes('sign in') ||
  snapshot.includes('Sign Out') // Unauthorized page often has sign out button
) {
  // ⚠️ AUTH WALL DETECTED ⚠️
  // DO NOT try to log in. DO NOT look up credentials. DO NOT click login forms.
  // ONLY use the bypass cookie:

  mcp__playwright__browser_evaluate({
    function:
      "() => { document.cookie = 'dev-admin-bypass=true; path=/'; return document.cookie; }",
  });

  // Refresh to apply bypass
  mcp__playwright__browser_navigate({ url: '{test.url}' });
  const retrySnapshot = mcp__playwright__browser_snapshot({});

  // Verify bypass worked - should NOT see login/unauthorized anymore
  if (retrySnapshot.includes('login') || retrySnapshot.includes('unauthorized')) {
    // Try web bypass for non-admin apps
    mcp__playwright__browser_evaluate({
      function:
        "() => { document.cookie = 'dev-web-bypass=true; path=/'; return document.cookie; }",
    });
    mcp__playwright__browser_navigate({ url: '{test.url}' });
  }

  // If STILL blocked after both bypass attempts, record as auth_wall error
  // DO NOT fall back to code review. DO NOT try to find credentials.
}

// 4. Perform actions (click, type, etc.)
mcp__playwright__browser_click({ element: '{description}', ref: '{ref from snapshot}' });

// 5. Verify expected outcome
const afterSnapshot = mcp__playwright__browser_snapshot({});
// Check if expected element/text is present
```

**Auth wall handling priority:**

1. Apply cookie bypass → retry test
2. Apply header bypass → retry test
3. Check if feature truly requires auth (some don't)
4. Record as ERROR with `auth_wall: true` flag
5. **NEVER** fall back to code review just because auth failed

**For API tests (type: api):**

```bash
# Call the endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" -X {METHOD} "{API_URL}{endpoint}" \
  -H "Content-Type: application/json" \
  -d '{request_body}')

STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

# Verify response
echo "Status: $STATUS"
echo "Body: $BODY"
# Check if status and body match expected
```

**For Database tests (type: database):**

```bash
# Query via Supabase CLI or API
curl -s "{SUPABASE_URL}/rest/v1/rpc/{function}" \
  -H "apikey: {ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{params}'

# Or direct SQL via supabase CLI
supabase db query "SELECT * FROM {table} WHERE {condition}"
```

**For Code review tests (type: code_review) - LAST RESORT:**

```bash
# Only for non-runtime-testable items
cat {file_path} | grep -A5 "{expected_pattern}"
```

**Determine result:**

- If actual matches expected → PASS
- If actual differs from expected → FAIL (record the difference)
- If test cannot run (error) → ERROR (record the error)

**Display execution result:**

```
## Test {number}: {name}

**Type:** {ui|api|database|code_review}
**Steps executed:**
1. {step 1 result}
2. {step 2 result}
...

**Expected:** {expected}
**Actual:** {what actually happened}

**Result:** {PASS|FAIL|ERROR}
{If FAIL: difference description}
{If ERROR: error message}
```

Proceed to `record_result`.
</step>

<step name="record_result">
**Record the test execution result:**

**If test PASSED:**

Update Tests section:

```yaml
### {N}. {name}
type: { ui|api|database|code_review }
expected: { expected }
actual: { what was observed }
result: pass
executed_at: { ISO timestamp }
```

**If test FAILED:**

Infer severity from the failure:

- UI not rendering, crash, exception → blocker
- Wrong behavior, missing functionality → major
- Slow, visual glitch, minor deviation → minor
- Styling issue only → cosmetic

Update Tests section:

```yaml
### {N}. {name}
type: { ui|api|database|code_review }
expected: { expected }
actual: { what was observed }
result: fail
severity: { blocker|major|minor|cosmetic }
difference: '{specific difference between expected and actual}'
executed_at: { ISO timestamp }
```

Append to Gaps section:

```yaml
- truth: '{expected behavior}'
  status: failed
  actual: '{what actually happened}'
  difference: '{specific difference}'
  severity: { severity }
  test: { N }
  test_type: { ui|api|database }
  artifacts:
    - screenshot: { if UI test failed, path to screenshot }
    - response: { if API test failed, response body }
```

**If test ERROR (couldn't execute):**

```yaml
### {N}. {name}
type: { ui|api|database|code_review }
expected: { expected }
result: error
error: '{error message}'
executed_at: { ISO timestamp }
```

Append to Gaps with error context.

**After recording:**

Update Summary counts.
Update frontmatter.updated timestamp.

If more tests remain → Update Current Test, go to `execute_test`
If no more tests → Go to `complete_session`
</step>

<step name="resume_from_file">
**Resume testing from UAT file:**

Read the full UAT file.

Find first test with `result: [pending]`.

Announce:

```
Resuming: Phase {phase} UAT
Progress: {passed + issues + skipped}/{total}
Issues found so far: {issues count}

Continuing from Test {N}...
```

Update Current Test section with the pending test.
Proceed to `present_test`.
</step>

<step name="complete_session">
**Complete testing and commit:**

Update frontmatter:

- status: complete
- updated: [now]

Clear Current Test section:

```
## Current Test

[testing complete]
```

**Signal checkpoint via MCP (if available):**

If harness MCP is available and session ID is known, signal verification completion:

```
harness_signal_checkpoint({
  sessionId: "{current_session_id}",
  type: "completion",
  workflow: "verify-work",
  phase: {phase_number},
  summary: "UAT complete - {passed} passed, {issues} issues",
  nextCommand: "{determined by issue count - see routing below}"
})
```

If MCP tool is not available, fall back to output signaling.

Commit the UAT file:

```bash
git add "$PHASE_DIR/{phase}-UAT.md"
git commit -m "test({phase}): complete UAT - {passed} passed, {issues} issues"
```

Present summary:

```
## UAT Complete: Phase {phase}

| Result | Count |
|--------|-------|
| Passed | {N}   |
| Issues | {N}   |
| Skipped| {N}   |

[If issues > 0:]
### Issues Found

[List from Issues section]
```

**If issues > 0:** Proceed to `diagnose_issues`

**If issues == 0:**

Check if this is the LAST phase in ROADMAP.md:

```bash
# Get highest phase number from ROADMAP.md
LAST_PHASE=$(grep -E "^## Phase [0-9]+" "$SPEC_DIR/ROADMAP.md" | tail -1 | grep -oE "[0-9]+")
```

**If this is the LAST phase (phase == LAST_PHASE):**

```
All tests passed. Phase {phase} verification COMPLETE.

⚠️ ALL PHASES VERIFIED - AUDIT REQUIRED BEFORE SPEC CAN BE MARKED COMPLETE

Verification confirms the phase WORKS. Audit confirms the SPEC MEETS REQUIREMENTS.

- `/harness:audit-spec` — Compare deliverables against requirements (REQUIRED)
```

**nextCommand for checkpoint:** `/harness:audit-spec`

**If more phases remain (phase < LAST_PHASE):**

```
All tests passed. Phase {phase} verification complete.

- `/harness:plan-phase {next}` — Plan next phase
- `/harness:execute-phase {next}` — Execute next phase
```

**nextCommand for checkpoint:** `/harness:execute-phase {next}` or `/harness:plan-phase {next}`

</step>

<step name="diagnose_issues">
**Diagnose root causes before planning fixes:**

```
---

{N} issues found. Diagnosing root causes...

Spawning parallel debug agents to investigate each issue.
```

- Load diagnose-issues workflow
- Follow @./.harness/skills/workflows/diagnose-issues.md
- Spawn parallel debug agents for each issue
- Collect root causes
- Update UAT.md with root causes
- Proceed to `offer_gap_closure`

Diagnosis runs automatically - no user prompt. Parallel agents investigate simultaneously, so overhead is minimal and fixes are more accurate.
</step>

<step name="offer_gap_closure">
**Offer next steps after diagnosis:**

```
---

## Diagnosis Complete

| Gap | Root Cause |
|-----|------------|
| {truth 1} | {root_cause} |
| {truth 2} | {root_cause} |
...

Next steps:
- `/harness:plan-phase {phase} --gaps` — Create fix plans from diagnosed gaps
- `/harness:verify-work {phase}` — Re-test after fixes
```

</step>

</process>

<update_rules>
**Batched writes for efficiency:**

Keep results in memory. Write to file only when:

1. **Issue found** — Preserve the problem immediately
2. **Session complete** — Final write before commit
3. **Checkpoint** — Every 5 passed tests (safety net)

| Section             | Rule      | When Written      |
| ------------------- | --------- | ----------------- |
| Frontmatter.status  | OVERWRITE | Start, complete   |
| Frontmatter.updated | OVERWRITE | On any file write |
| Current Test        | OVERWRITE | On any file write |
| Tests.{N}.result    | OVERWRITE | On any file write |
| Summary             | OVERWRITE | On any file write |
| Gaps                | APPEND    | When issue found  |

On context reset: File shows last checkpoint. Resume from there.
</update_rules>

<severity_inference>
**Infer severity from user's natural language:**

| User says                                           | Infer    |
| --------------------------------------------------- | -------- |
| "crashes", "error", "exception", "fails completely" | blocker  |
| "doesn't work", "nothing happens", "wrong behavior" | major    |
| "works but...", "slow", "weird", "minor issue"      | minor    |
| "color", "spacing", "alignment", "looks off"        | cosmetic |

Default to **major** if unclear. User can correct if needed.

**Never ask "how severe is this?"** - just infer and move on.
</severity_inference>

<step name="cleanup">
**Clean up after testing:**

If dev server was started by this workflow:

```bash
# Kill the dev server we started
if [ "$DEV_SERVER_PID" != "existing" ]; then
  kill $DEV_SERVER_PID 2>/dev/null || true
  echo "Stopped dev server (PID: $DEV_SERVER_PID)"
fi
```

Close Playwright browser if open:

```typescript
mcp__playwright__browser_close({});
```

</step>

<success_criteria>

**Runtime Testing (REQUIRED for testable features):**

- [ ] Dev server started (or confirmed running)
- [ ] Playwright initialized and connected
- [ ] Auth bypass detected and configured (if protected routes)
- [ ] UI tests executed via Playwright (navigate, click, verify)
- [ ] API tests executed via curl
- [ ] Database tests executed via query/RPC

**Auth Bypass (REQUIRED before falling back to code review):**

- [ ] Searched codebase for bypass patterns (cookie, header)
- [ ] Checked .env files for PLAYWRIGHT_TEST_SECRET
- [ ] Attempted cookie bypass on auth wall
- [ ] Attempted header bypass if secret available
- [ ] Only fall back to code review if feature CANNOT be tested at runtime

**Recording:**

- [ ] UAT file created with executable test definitions
- [ ] Each test EXECUTED (not just described)
- [ ] Results recorded with actual vs expected
- [ ] Failures include specific difference and severity
- [ ] Screenshots captured for UI failures

**Completion:**

- [ ] All tests executed
- [ ] Summary stats updated
- [ ] Committed on completion
- [ ] Dev server cleaned up (if we started it)
- [ ] Clear next steps (plan-phase --gaps if failures)

**Code review is acceptable ONLY for:**

- [ ] Pure refactors with no behavior change
- [ ] Type-only changes
- [ ] Build/config changes
- [ ] Documentation
      </success_criteria>
