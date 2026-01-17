<purpose>
Verify implementation against roadmap/spec and automatically identify gaps. If gaps, issues, or errors exist, auto-create remediation phases and loop until spec adherence is achieved.

This is the quality gate that ensures what was built matches what was planned.
</purpose>

<trigger>
Use this workflow when:
- User invokes `/harness:audit-milestone`
- All phases in a milestone have been executed and verified
- Orchestrator completes all planned phases
- User wants to verify spec compliance before shipping
</trigger>

<arguments>
**Usage:**
```
/harness:audit-milestone                    # Audit current milestone
/harness:audit-milestone [spec-path]        # Audit specific spec
/harness:audit-milestone --max-iterations=3 # Limit remediation loops
```

**$ARGUMENTS parsing:**

- If path provided: Use as spec directory
- If `--max-iterations=N`: Limit auto-remediation loops (default: 5)
- If empty: Use current working directory, detect spec structure
  </arguments>

<template>
@./.harness/skills/templates/AUDIT.md
</template>

<process>

<step name="discover_project_structure">
Find the spec/planning structure:

```bash
# Try spec-centric structure first
SPEC_DIR=$(ls -d specs/*/ROADMAP.md 2>/dev/null | head -1 | xargs dirname)

if [ -z "$SPEC_DIR" ]; then
  # Fall back to legacy structure
  if [ -f ".planning/ROADMAP.md" ]; then
    SPEC_DIR=".planning"
    STRUCTURE="legacy"
  else
    echo "ERROR: No roadmap found"
    exit 1
  fi
else
  STRUCTURE="spec-centric"
fi

echo "Structure: $STRUCTURE"
echo "Spec directory: $SPEC_DIR"
```

Store paths:

- `$SPEC_DIR` - Directory containing ROADMAP.md
- `$STRUCTURE` - Either "spec-centric" or "legacy"
  </step>

<step name="gather_intent">
**Read what was INTENDED to be built:**

1. **ROADMAP.md** - Phases and goals

```bash
cat "$SPEC_DIR/ROADMAP.md"
```

Extract:

- All phase names and descriptions
- Phase goals/deliverables
- Dependencies between phases

2. **REQUIREMENTS.md or SPEC.md** (if exists)

```bash
cat "$SPEC_DIR/REQUIREMENTS.md" 2>/dev/null || cat "$SPEC_DIR/SPEC.md" 2>/dev/null
```

Extract:

- Functional requirements (what the system should do)
- Non-functional requirements (performance, security, etc.)
- Acceptance criteria

3. **Original PLAN.md files** - What was designed

```bash
# Spec-centric
find "$SPEC_DIR/planning/plans" -name "*PLAN.md" -type f 2>/dev/null

# Legacy
find "$SPEC_DIR/phases" -name "*PLAN.md" -type f 2>/dev/null
```

For each plan, extract:

- Goal statement
- Tasks/deliverables promised
- Success criteria

**Build INTENT registry:**

```
intent = {
  requirements: [
    { id: "R1", description: "...", source: "REQUIREMENTS.md", type: "functional" },
    { id: "R2", description: "...", source: "ROADMAP.md Phase 2", type: "goal" },
    ...
  ],
  phases: [
    { number: 1, name: "...", goals: [...], plans: [...] },
    ...
  ]
}
```

</step>

<step name="gather_reality">
**Read what was ACTUALLY built:**

1. **SUMMARY.md files** - Execution results

```bash
# Spec-centric
find "$SPEC_DIR/execution" -name "*SUMMARY.md" -type f 2>/dev/null

# Legacy
find "$SPEC_DIR/phases" -name "*SUMMARY.md" -type f 2>/dev/null
```

For each summary, extract:

- What was accomplished
- Files created/modified
- Deviations from plan
- Known issues

2. **VERIFICATION.md or UAT.md files** - Test results

```bash
find "$SPEC_DIR" -name "*VERIFICATION.md" -o -name "*UAT.md" -type f 2>/dev/null
```

For each verification, extract:

- Tests passed/failed
- Issues found
- Gaps identified

3. **Codebase scan** (optional, for validation)

```bash
# Check if key files/features exist
# This validates summaries aren't lying
```

**Build REALITY registry:**

```
reality = {
  executed: [
    { phase: 1, plan: 1, summary: "...", files: [...], issues: [...] },
    ...
  ],
  verified: [
    { phase: 1, passed: true, issues: [] },
    ...
  ],
  codebase: {
    files_created: [...],
    features_detected: [...]
  }
}
```

</step>

<step name="compare_intent_vs_reality">
**For each requirement/goal in INTENT:**

1. **Search for evidence in REALITY:**
   - Was it addressed by a plan?
   - Was the plan executed (has SUMMARY)?
   - Did verification pass?

2. **Classify status:**

| Status   | Criteria                                                 |
| -------- | -------------------------------------------------------- |
| COMPLETE | Addressed by plan + executed + verified passing          |
| PARTIAL  | Addressed by plan + executed but verification found gaps |
| MISSING  | Not addressed by any plan                                |
| DEVIATED | Implemented differently than specified                   |
| BROKEN   | Addressed but verification failed                        |

3. **Build gap analysis:**

```
gaps = [
  {
    requirement: "R3",
    status: "PARTIAL",
    evidence: "Plan 02-01 addressed this but UAT found filter endpoint missing",
    remediation: "Add date range filter endpoint"
  },
  {
    requirement: "R7",
    status: "MISSING",
    evidence: "No plan addressed email alerts for critical errors",
    remediation: "Create new phase for email alert integration"
  }
]
```

</step>

<step name="calculate_adherence_score">
**Calculate spec adherence percentage:**

```
adherence = (COMPLETE count / total requirements) * 100
```

**Thresholds:**

- 100%: Perfect adherence, ready to ship
- 90-99%: Minor gaps, may be acceptable
- 70-89%: Significant gaps, remediation recommended
- <70%: Major gaps, remediation required

Display:

```
## Adherence Score: 85%

Complete: 17/20 requirements
Partial: 2 (need fixes)
Missing: 1 (need new phase)
```

</step>

<step name="generate_audit_report">
**Create or update AUDIT.md:**

Read template from `templates/AUDIT.md` and fill placeholders:

```bash
# Determine audit file location
if [ "$STRUCTURE" = "spec-centric" ]; then
  AUDIT_FILE="$SPEC_DIR/AUDIT.md"
else
  AUDIT_FILE="$SPEC_DIR/AUDIT.md"
fi
```

Fill template with:

- Summary stats
- Intent sources
- Reality sources
- Gap analysis by status
- Remediation phases (if any)
- Audit history

Write to `$AUDIT_FILE`
</step>

<step name="auto_remediation_check">
**If gaps exist and iteration < max_iterations:**

1. **For MISSING requirements:**
   - Create new decimal phase (e.g., 4.1, 4.2)
   - Generate phase goal from requirement

2. **For PARTIAL requirements:**
   - Create fix plan within existing phase structure
   - Reference the gap in plan goal

3. **For BROKEN requirements:**
   - Create debug/fix phase
   - Include verification failure details

**Example auto-generated phases:**

```markdown
## Auto-Generated Remediation Phases

### Phase 4.1: Date Range Filter Endpoint

**Gap:** R8 - Admin can filter errors by date range (PARTIAL)
**Remediation:** Filter UI exists but no backend endpoint
**Tasks:**

- [ ] Add date range parameters to error list endpoint
- [ ] Add query builder for date filtering
- [ ] Update API documentation

### Phase 4.2: Critical Error Email Alerts

**Gap:** R11 - Email alerts for critical errors (MISSING)
**Remediation:** Not addressed by any existing phase
**Tasks:**

- [ ] Design email alert trigger logic
- [ ] Integrate email service (Resend/SendGrid)
- [ ] Create alert preferences UI
```

</step>

<step name="create_remediation_phases">
**If auto_remediation_check found gaps:**

1. **Update ROADMAP.md** with new phases:

```bash
# Add remediation phases to roadmap
# Use decimal numbering (4.1, 4.2) to insert after existing phases
```

2. **Signal orchestrator** to continue:

```
AUDIT RESULT: GAPS_FOUND

Adherence: 85%
New phases created: 2
- Phase 4.1: Date Range Filter Endpoint
- Phase 4.2: Critical Error Email Alerts

Recommended action: Continue orchestration with new phases

Next command: /harness:orchestrate (will pick up new phases)
```

3. **Increment iteration counter** in AUDIT.md

4. **Return to orchestrator** with status indicating more work needed
   </step>

<step name="audit_complete">
**If adherence = 100% OR max_iterations reached:**

```
╔══════════════════════════════════════════════════════════════════════╗
║  MILESTONE AUDIT COMPLETE                                            ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Adherence Score: [X]%                                               ║
║                                                                       ║
║  Requirements:                                                        ║
║    ✓ Complete: [N]                                                   ║
║    ⚠ Partial: [N]                                                    ║
║    ✗ Missing: [N]                                                    ║
║                                                                       ║
║  Audit iterations: [N]                                               ║
║  Remediation phases created: [N]                                     ║
║                                                                       ║
║  Report: $SPEC_DIR/AUDIT.md                                          ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════════╝
```

**If 100%:**

```
✅ All requirements satisfied. Ready for /harness:complete-milestone
```

**If <100% and max_iterations reached:**

```
⚠️ Max iterations reached. Review AUDIT.md for remaining gaps.
Consider:
- Manual remediation
- Adjusting requirements
- Accepting known limitations
```

</step>

</process>

<orchestrator_integration>
**How orchestrate.md should use this workflow:**

After all phases complete and verify:

```
1. All phases executed ✓
2. All phases verified ✓
3. Run /harness:audit-milestone
4. If GAPS_FOUND:
   - New phases were auto-created in ROADMAP.md
   - Continue orchestration (will pick up new phases)
   - After new phases complete, audit again
5. If ADHERENCE_100%:
   - Proceed to /harness:complete-milestone
6. If MAX_ITERATIONS:
   - Alert user, require manual decision
```

**Orchestrator state tracking:**

```
orchestrator_state = {
  ...existing fields...
  audit_iteration: number,      // Current audit loop iteration
  max_audit_iterations: number, // Default 5
  gaps_remaining: number,       // From last audit
}
```

</orchestrator_integration>

<mcp_integration>
**New MCP tool for orchestrator:**

`harness_audit_milestone(projectPath, maxIterations?)`

- Runs the audit workflow
- Returns: `{ adherence, gaps, newPhases, status }`
- Status: `COMPLETE` | `GAPS_FOUND` | `MAX_ITERATIONS`

This allows orchestrator to programmatically trigger audits and respond to results.
</mcp_integration>

<success_criteria>
Audit is successful when:

- [ ] ROADMAP.md parsed for intended phases/goals
- [ ] REQUIREMENTS.md/SPEC.md parsed for requirements (if exists)
- [ ] All PLAN.md files analyzed for promised deliverables
- [ ] All SUMMARY.md files analyzed for actual deliverables
- [ ] All VERIFICATION.md files analyzed for test results
- [ ] Gap analysis produced with clear status for each requirement
- [ ] Adherence score calculated
- [ ] AUDIT.md created/updated with full report
- [ ] If gaps: Remediation phases auto-created
- [ ] If 100%: Clear signal to proceed to milestone completion
      </success_criteria>

<guidelines>
**DO:**
- Be thorough in requirement extraction - check ROADMAP, REQUIREMENTS, SPEC, and PLAN files
- Cross-reference summaries with plans to detect deviations
- Use verification results as ground truth for "working" status
- Create specific, actionable remediation phases
- Track iteration history in AUDIT.md

**DON'T:**

- Skip requirements that are hard to verify
- Auto-pass requirements without evidence
- Create vague remediation phases ("fix stuff")
- Infinite loop - respect max_iterations
- Modify executed work - only create new remediation phases
  </guidelines>
