<purpose>
Define the phases of implementation for spec-centric projects. Each phase is a
coherent chunk of work that delivers value. Phases map to requirements — every
v1 requirement must belong to exactly one phase.

The roadmap provides structure for orchestrated execution via /harness:orchestrate.
</purpose>

<spec_centric_structure>
The harness uses spec-centric organization:

```
specs/
└── SPC-001-project-mvp/
    ├── SPEC.md           # Optional detailed spec
    ├── REQUIREMENTS.md   # What must be built
    ├── ROADMAP.md        # Phases and their plans
    ├── STATUS.md         # Human-readable status
    ├── STATE.md          # Machine-managed state (auto-updated by sync)
    ├── planning/
    │   └── plans/
    │       ├── 01-foundation/
    │       │   ├── 01-01-PLAN.md
    │       │   └── 01-02-PLAN.md
    │       └── 02-authentication/
    │           └── 02-01-PLAN.md
    └── execution/
        └── phases/
            └── (SUMMARYs written here after execution)
```

</spec_centric_structure>

<required_reading>
**Read these files NOW:**

1. ./packages/harness-skills/src/templates/roadmap.md (if exists)
2. ./packages/harness-skills/src/templates/STATE.md
3. specs/\*/REQUIREMENTS.md OR .planning/REQUIREMENTS.md
4. specs/\*/SPEC.md OR .planning/PROJECT.md
   </required_reading>

<process>

<step name="determine_spec_location">
Check for existing specs or determine where to create:

```bash
# List existing specs
ls -d specs/SPC-* 2>/dev/null || ls -d specs/*/ 2>/dev/null || echo "NO_SPECS"
```

**If $ARGUMENTS provided:**

- Use as spec-id (e.g., "SPC-001-mvp") or path

**If specs exist but no argument:**

- List specs and ask which to use or create new

**If no specs:**

- Prompt for new spec-id: `SPC-XXX-short-name`

Set: `SPEC_DIR=specs/{spec-id}`
</step>

<step name="load_requirements">
Find and parse REQUIREMENTS.md:

```bash
# Try spec-specific first, then fall back to .planning/
cat $SPEC_DIR/REQUIREMENTS.md 2>/dev/null || \
cat .planning/REQUIREMENTS.md 2>/dev/null || \
echo "NO_REQUIREMENTS"
```

**If NO_REQUIREMENTS:**
Ask user to create requirements or point to existing file.

**Parse requirements:**

- Extract all requirement IDs (AUTH-01, CONT-02, etc.)
- Group by category (Authentication, Content, etc.)
- Count total v1 requirements

```
Requirements loaded:

Categories: [N]
- Authentication: [X] requirements
- Content: [Y] requirements
...

Total v1 requirements: [N]

All requirements must map to exactly one phase.
```

**Track requirement IDs** — will verify coverage after phase identification.
</step>

<step name="check_brief">
```bash
cat .planning/PROJECT.md 2>/dev/null || echo "No brief found"
```

**If no brief exists:**
Ask: "No brief found. Want to create one first, or proceed with roadmap?"

If proceeding without brief, gather quick context:

- What are we building?
- What's the rough scope?
  </step>

<step name="load_research">
Check for project research:

```bash
[ -d .planning/research ] && echo "RESEARCH_EXISTS" || echo "NO_RESEARCH"
```

**If RESEARCH_EXISTS:**

Read `.planning/research/SUMMARY.md` and extract:

- Suggested phase structure from "Implications for Roadmap" section
- Research flags for each suggested phase
- Key findings that inform phase ordering

```
Research found. Using findings to inform roadmap:

Suggested phases from research:
1. [Phase from research] — [rationale]
2. [Phase from research] — [rationale]
3. [Phase from research] — [rationale]

Research confidence: [HIGH/MEDIUM/LOW]

Proceeding with research-informed phase identification...
```

**If NO_RESEARCH:**

Continue without research context. Phase identification will rely on PROJECT.md only.

**Note:** Research is optional. Roadmap can be created without it, but research-informed roadmaps tend to have better phase structure and fewer surprises.
</step>

<step name="identify_phases">
Derive phases from requirements. Each phase covers a coherent set of requirements.

**Primary input: REQUIREMENTS.md**

- Group requirements by natural delivery boundaries
- Each phase should complete one or more requirement categories
- Dependencies between requirements inform phase ordering

**Secondary inputs:**

- Research SUMMARY.md (if exists): suggested phases, architecture patterns

**Phase identification process:**

1. Group requirements by category (Authentication, Content, Social, etc.)
2. Identify dependencies between categories (Social needs Content, Content needs Auth)
3. Create phases that complete entire categories where possible
4. Split large categories across phases if needed (e.g., basic auth vs. advanced auth)
5. Assign every v1 requirement to exactly one phase

**For each phase, record:**

- Phase name and goal
- Which requirement IDs it covers (e.g., AUTH-01, AUTH-02, AUTH-03)
- Dependencies on other phases

**Check depth setting:**

```bash
cat .planning/config.json 2>/dev/null | grep depth
```

<depth_guidance>
**Depth controls compression tolerance, not artificial inflation.**

| Depth         | Typical Phases | Typical Plans/Phase | Tasks/Plan |
| ------------- | -------------- | ------------------- | ---------- |
| Quick         | 3-5            | 1-3                 | 2-3        |
| Standard      | 5-8            | 3-5                 | 2-3        |
| Comprehensive | 8-12           | 5-10                | 2-3        |

**Key principle:** Derive phases from actual work. Depth determines how aggressively you combine things, not a target to hit.

- Comprehensive auth system = 8 phases (because auth genuinely has 8 concerns)
- Comprehensive "add favicon" = 1 phase (because that's all it is)

For comprehensive depth:

- Don't compress multiple features into single phases
- Each major capability gets its own phase
- Let small things stay small—don't pad to hit a number
- If you're tempted to combine two things, make them separate phases instead

For quick depth:

- Combine related work aggressively
- Focus on critical path only
- Defer nice-to-haves to future milestones
  </depth_guidance>

**Phase Numbering System:**

**Calculate starting phase number:**

```bash
# Find highest existing phase number from phases/ directory
ls -d .planning/phases/[0-9]*-* 2>/dev/null | sort -V | tail -1 | grep -oE '[0-9]+' | head -1
```

- If phases/ is empty or doesn't exist: start at Phase 1
- If phases exist from previous milestone: continue from last + 1
- Example: v1.0 had phases 1-4, v1.1 starts at Phase 5

Use integer phases (1, 2, 3) for planned milestone work.

Use decimal phases (2.1, 2.2) for urgent insertions:

- Decimal phases inserted between integers (2.1 between 2 and 3)
- Mark with "(INSERTED)" in phase title
- Created when urgent work discovered after planning
- Examples: bugfixes, hotfixes, critical patches

**When to use decimals:**

- Urgent work that can't wait for next milestone
- Critical bugs blocking progress
- Security patches needing immediate attention
- NOT for scope creep or "nice to haves" (capture with /harness:add-todo instead)

**Phase execution order:**
Numeric sort: 1 → 1.1 → 1.2 → 2 → 2.1 → 3

**Deriving phases:**

1. List all distinct systems/features/capabilities required
2. Group related work into coherent deliverables
3. Each phase should deliver ONE complete, verifiable thing
4. If a phase delivers multiple unrelated capabilities: split it
5. If a phase can't stand alone as a complete deliverable: merge it
6. Order by dependencies

Good phases are:

- **Coherent**: Each delivers one complete, verifiable capability
- **Sequential**: Later phases build on earlier
- **Independent**: Can be verified and committed on its own

Common phase patterns:

- Foundation → Core Feature → Enhancement → Polish
- Setup → MVP → Iteration → Launch
- Infrastructure → Backend → Frontend → Integration
  </step>

<step name="derive_phase_success_criteria">
**For each phase, derive what must be TRUE when it completes.**

This catches scope gaps before planning begins. Requirements tell us what to build; success criteria tell us what users can do.

**Process for each phase:**

1. **State the phase goal** (from identify_phases)

2. **Ask: "What must be TRUE for users when this phase completes?"**
   - Think from user's perspective, not implementation
   - 2-5 observable behaviors per phase
   - Each should be testable/verifiable

3. **Cross-check against mapped requirements:**
   - Does each success criterion have at least one requirement supporting it?
   - Does each requirement contribute to at least one success criterion?

4. **Flag gaps:**
   - Success criterion with no supporting requirement → Add requirement or mark as out of scope
   - Requirement that supports no criterion → Question if it belongs in this phase

**Example:**

```
Phase 2: Authentication
Goal: Users can securely access their accounts

Success Criteria (what must be TRUE):
1. User can create account with email/password
2. User can log in and stay logged in across browser sessions
3. User can log out from any page
4. User can reset forgotten password

Requirements mapped: AUTH-01, AUTH-02, AUTH-03

Cross-check:
✓ Criterion 1 ← AUTH-01 (create account)
✓ Criterion 2 ← AUTH-02 (log in) — but "stay logged in" needs session persistence
✓ Criterion 3 ← AUTH-03 (log out)
✗ Criterion 4 ← No requirement covers password reset

Gap found: Password reset not in requirements.
→ Add AUTH-04: User can reset password via email
   OR mark "Password reset" as v2 scope
```

**Present to user:**

```
Phase success criteria derived:

Phase 1: Foundation
Goal: Project scaffolding and configuration
Success criteria:
  1. Project builds without errors
  2. Development server runs locally
  3. CI pipeline passes
Requirements: SETUP-01, SETUP-02 ✓ (all criteria covered)

Phase 2: Authentication
Goal: Users can securely access their accounts
Success criteria:
  1. User can create account with email/password
  2. User can log in and stay logged in across sessions
  3. User can log out from any page
  4. User can reset forgotten password ⚠️
Requirements: AUTH-01, AUTH-02, AUTH-03
Gap: Criterion 4 (password reset) has no requirement

Phase 3: User Profile
...

---

⚠️ 1 gap found in Phase 2

Options:
1. Add AUTH-04 for password reset
2. Mark password reset as v2 scope
3. Adjust success criteria
```

**Resolve all gaps before proceeding.**

Success criteria flow downstream:

- Written to ROADMAP.md (high-level, user-observable)
- Inform `must_haves` derivation in plan-phase (concrete artifacts/wiring)
- Verified by verify-phase after execution
  </step>

<step name="validate_coverage">
**Verify all v1 requirements are mapped to exactly one phase.**

Compare assigned requirements against full list from load_requirements step:

```
Requirement Coverage:

✓ AUTH-01 → Phase 1
✓ AUTH-02 → Phase 1
✓ AUTH-03 → Phase 1
✓ AUTH-04 → Phase 1
✓ PROF-01 → Phase 2
✓ PROF-02 → Phase 2
...

Coverage: [X]/[Y] requirements mapped
```

**If any requirements unmapped:**

```
⚠️ Orphaned requirements (not in any phase):

- NOTF-01: User receives in-app notifications
- NOTF-02: User receives email for new followers

These v1 requirements have no phase. Options:
1. Add phase to cover them
2. Move to v2 (update REQUIREMENTS.md)
3. Assign to existing phase
```

Use AskUserQuestion to resolve orphaned requirements.

**Do not proceed until coverage = 100%.**
</step>

<step name="detect_research_needs">
**For each phase, determine if research is likely needed.**

Scan the brief and phase descriptions for research triggers:

<research_triggers>
**Likely (flag the phase):**

| Trigger Pattern                                       | Why Research Needed                     |
| ----------------------------------------------------- | --------------------------------------- |
| "integrate [service]", "connect to [API]"             | External API - need current docs        |
| "authentication", "auth", "login", "JWT"              | Architectural decision + library choice |
| "payment", "billing", "Stripe", "subscription"        | External API + compliance patterns      |
| "email", "SMS", "notifications", "SendGrid", "Twilio" | External service integration            |
| "database", "Postgres", "MongoDB", "Supabase"         | If new to project - setup patterns      |
| "real-time", "websocket", "sync", "live updates"      | Architectural decision                  |
| "deploy", "Vercel", "Railway", "hosting"              | If first deployment - config patterns   |
| "choose between", "select", "evaluate", "which"       | Explicit decision needed                |
| "AI", "OpenAI", "Claude", "LLM", "embeddings"         | Fast-moving APIs - need current docs    |
| Any technology not already in codebase                | New integration                         |
| Explicit questions in brief                           | Unknowns flagged by user                |

**Unlikely (no flag needed):**

| Pattern                                     | Why No Research         |
| ------------------------------------------- | ----------------------- |
| "add button", "create form", "update UI"    | Internal patterns       |
| "CRUD operations", "list/detail views"      | Standard patterns       |
| "refactor", "reorganize", "clean up"        | Internal work           |
| "following existing patterns"               | Conventions established |
| Technology already in package.json/codebase | Patterns exist          |

</research_triggers>

**For each phase, assign:**

- `Research: Likely ([reason])` + `Research topics: [what to investigate]`
- `Research: Unlikely ([reason])`

**Important:** These are hints, not mandates. The mandatory_discovery step during phase planning will validate.

Present research assessment:

```
Research needs detected:

Phase 1: Foundation
  Research: Unlikely (project setup, established patterns)

Phase 2: Authentication
  Research: Likely (new system, technology choice)
  Topics: JWT library for [stack], session strategy, auth provider options

Phase 3: Stripe Integration
  Research: Likely (external API)
  Topics: Current Stripe API, webhook patterns, checkout flow

Phase 4: Dashboard
  Research: Unlikely (internal UI using patterns from earlier phases)

Does this look right? (yes / adjust)
```

</step>

<step name="confirm_phases">
<config-check>
```bash
cat .planning/config.json 2>/dev/null
```
Note: Config may not exist yet (project initialization). If missing, default to interactive mode.
</config-check>

<if mode="yolo">
```
⚡ Auto-approved: Phase breakdown ([N] phases)

1. [Phase name] - [goal]
2. [Phase name] - [goal]
3. [Phase name] - [goal]

Proceeding to research detection...

```

Proceed directly to detect_research_needs step.
</if>

<if mode="interactive" OR="missing OR custom with gates.confirm_phases true">
Present the phase breakdown inline:

"Here's how I'd break this down:

1. [Phase name] - [goal]
2. [Phase name] - [goal]
3. [Phase name] - [goal]
   ...

Does this feel right? (yes / adjust)"

If "adjust": Ask what to change, revise, present again.
</step>

<step name="decision_gate">
<if mode="yolo">
```

⚡ Auto-approved: Create roadmap with [N] phases

Proceeding to create .planning/ROADMAP.md...

````

Proceed directly to create_structure step.
</if>

<if mode="interactive" OR="missing OR custom with gates.confirm_roadmap true">
Use AskUserQuestion:

- header: "Ready"
- question: "Ready to create the roadmap, or would you like me to ask more questions?"
- options:
  - "Create roadmap" - I have enough context
  - "Ask more questions" - There are details to clarify
  - "Let me add context" - I want to provide more information

Loop until "Create roadmap" selected.
</step>

<step name="create_structure">
```bash
# Create spec-centric directory structure
mkdir -p $SPEC_DIR/planning/plans
mkdir -p $SPEC_DIR/execution/phases
```
</step>

<step name="write_roadmap">
Write ROADMAP.md with YAML frontmatter to `$SPEC_DIR/ROADMAP.md`:

```markdown
---
version: 1
project: {project-name}
milestone: {milestone-name}
spec_id: {spec-id}
spec_dir: $SPEC_DIR

current_phase: 0
current_plan: 0
status: planned

total_phases: {N}
completed_phases: 0
total_plans: 0
completed_plans: 0
---

# {Project} {Milestone} Roadmap

## Overview
{Brief description}

## Phase Summary
| Phase | Name | Plans | Requirements | Research |
|-------|------|-------|--------------|----------|
| 1 | Foundation | TBD | SETUP-01..03 | Unlikely |
| 2 | Authentication | TBD | AUTH-01..04 | Likely |

## Phase 1: Foundation
**Goal:** {goal}
**Plan Directory:** `planning/plans/01-foundation/`

### Requirements Covered
- SETUP-01: ...
- SETUP-02: ...

### Success Criteria
1. {criterion 1}
2. {criterion 2}

### Research
Research: Unlikely (established patterns)

---
(Continue for each phase...)
```

Create phase directories:

```bash
mkdir -p $SPEC_DIR/planning/plans/01-{phase-name}
mkdir -p $SPEC_DIR/planning/plans/02-{phase-name}
# etc.
```

</step>

<step name="update_requirements_traceability">
Update REQUIREMENTS.md traceability section with phase mappings:

Read current REQUIREMENTS.md and update the Traceability table:

```markdown
## Traceability

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| AUTH-01     | Phase 1 | Pending |
| AUTH-02     | Phase 1 | Pending |
| AUTH-03     | Phase 1 | Pending |
| AUTH-04     | Phase 1 | Pending |
| PROF-01     | Phase 2 | Pending |

...

**Coverage:**

- v1 requirements: [X] total
- Mapped to phases: [X]
- Unmapped: 0 ✓
```

Write updated REQUIREMENTS.md.
</step>

<step name="initialize_project_state">

Create STATE.md — the project's living memory.

Write to `$SPEC_DIR/STATE.md`:

```markdown
# Project State

## Project Reference

See: $SPEC_DIR/SPEC.md
**Spec ID:** {spec-id}
**Project:** {project-name}
**Milestone:** {milestone-name}

## Current Position

| Field | Value |
|-------|-------|
| Phase | 0 of {N} |
| Plan | 0 of 0 |
| Status | Ready to plan |
| Last Activity | {today} |

Progress: [░░░░░░░░░░░░░░░░░░░░] 0%

## Phase Summary

| Phase | Name | Plans | Executed | Verified |
|-------|------|-------|----------|----------|
| 1 | Foundation | TBD | - | - |
| 2 | Authentication | TBD | - | - |
...

## Verification Gate

| Field | Value |
|-------|-------|
| Highest Executed Phase | 0 |
| Highest Verified Phase | 0 |
| Pending Verification | None |

## Session Continuity

| Field | Value |
|-------|-------|
| Last Session | {today} |
| Stopped At | Roadmap created |
| Resume Command | `/harness:plan-phase 1` |

## Accumulated Context

### Key Decisions
_None yet_

### Deferred Issues
_None_

### Blockers
_None_

---
_State file maintained by harness. Updated after each sync._
```

**Note:** STATE.md will be auto-updated by `harness_sync_project_state` after execution.

</step>

<step name="git_commit_initialization">
Commit roadmap with requirement mappings:

```bash
git add $SPEC_DIR/
git commit -m "$(cat <<'EOF'
docs({spec-id}): create roadmap ({N} phases, {X} requirements)

{One-liner description}

Phases:
1. {phase-name}: {requirements covered}
2. {phase-name}: {requirements covered}
3. {phase-name}: {requirements covered}

All v1 requirements mapped to phases.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

Confirm: "Committed: docs({spec-id}): create roadmap ({N} phases, {X} requirements)"
</step>

<step name="offer_next">
```
✓ Roadmap created: $SPEC_DIR/ROADMAP.md

Structure:
  $SPEC_DIR/
  ├── ROADMAP.md        ← {N} phases defined
  ├── REQUIREMENTS.md   ← {X} requirements mapped
  ├── STATE.md          ← Initialized
  └── planning/plans/   ← Phase directories ready
- Committed as: docs({spec-id}): create roadmap

---

## ▶ Next Up

**Phase 1: [Name]** — [Goal from ROADMAP.md]

`/harness:plan-phase 1`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**

- `/harness:discuss-phase 1` — gather context first
- `/harness:research-phase 1` — investigate unknowns
- Review roadmap

---

```
</step>

</process>

<phase_naming>
Use `XX-kebab-case-name` format:
- `01-foundation`
- `02-authentication`
- `03-core-features`
- `04-polish`

Numbers ensure ordering. Names describe content.
</phase_naming>

<anti_patterns>
- Don't add time estimates
- Don't create Gantt charts
- Don't add resource allocation
- Don't include risk matrices
- Don't impose arbitrary phase counts (let the work determine the count)

Phases are buckets of work, not project management artifacts.
</anti_patterns>

<success_criteria>
Roadmap is complete when:
- [ ] Spec directory identified or created ($SPEC_DIR)
- [ ] REQUIREMENTS.md loaded and parsed
- [ ] All v1 requirements mapped to exactly one phase (100% coverage)
- [ ] Success criteria derived for each phase (2-5 observable behaviors)
- [ ] Success criteria cross-checked against requirements (no gaps)
- [ ] `$SPEC_DIR/ROADMAP.md` exists with YAML frontmatter
- [ ] `$SPEC_DIR/STATE.md` exists (initialized)
- [ ] REQUIREMENTS.md traceability section updated
- [ ] Phases defined with clear names
- [ ] Research flags assigned (Likely/Unlikely for each phase)
- [ ] Phase directories created in `$SPEC_DIR/planning/plans/`
- [ ] Git commit created
- [ ] Next steps offered
</success_criteria>
````
