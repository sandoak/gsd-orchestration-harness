# Orchestrate.md Efficiency Analysis for GSD v1.5.17

## Current vs Recommended Approach

Based on the GSD v1.5.17 features and the creator's tutorial, here's an analysis of how to maximize orchestration efficiency.

---

## Key Finding: execute-plan vs execute-phase

### Current Approach (execute-plan)

```
Orchestrator uses: /gsd:execute-plan [path]

Flow:
  Execute 03-01 → Verify 03-01 → Reconcile 03-02 → Execute 03-02 → Verify 03-02 → ...
```

**Pros:**

- Granular control
- Plan-level verification between plans
- Reconciliation validates each plan
- Better error isolation

**Cons:**

- Slower (sequential)
- More orchestrator complexity
- More session churn

### Creator's Approach (execute-phase)

```
Creator uses: /gsd:execute-phase N

Flow:
  Execute all plans in phase (wave parallelism internally) → Auto-verify all → Done
```

**Pros:**

- Faster (wave-based parallelism)
- Simpler orchestration
- Built-in verification
- Aligns with GSD's design intent

**Cons:**

- Less granular control
- Errors found at phase end, not plan end
- Can't reconcile between plans

### Recommendation

**Option A: Hybrid Approach (Recommended)**

Use `execute-phase` for execution speed, but keep orchestrator-level verification:

```
Slot 1: /gsd:execute-phase 3           # Runs all plans with wave parallelism
Slot 2: /gsd:research-phase 4          # Research next phase in parallel
Slot 3: /gsd:research-phase 5          # Research future phase
Slot 4: idle (ready for verify when phase completes)

When execute-phase completes:
Slot 1: /gsd:verify-work phase-3       # Full phase verification
```

**Option B: Keep Current (Conservative)**

Keep `execute-plan` for maximum control. This is safer but slower.

---

## Research Integration Analysis

### Current Approach

```python
# Research only if "complex"
RESEARCH CHECKLIST for Phase X:
□ Technically complex?
□ External services?
□ Unknowns?
□ First time?

ANY CHECKED → research-phase
ALL UNCHECKED → plan-phase directly
```

### Creator's Approach

```python
# Research EVERY phase
for phase in roadmap:
    research-phase(phase)  # Always
    plan-phase(phase)
```

> "Measure twice, cut once... research is super helpful."

### Recommendation

**Be more aggressive about research:**

1. **Default to research** - unless phase is trivially simple (config changes, minor tweaks)
2. **Run research in parallel** - research N+1 while executing N
3. **Pre-research multiple phases** - research N+1, N+2, N+3 while executing N

Update orchestrate.md build_work_queues:

```python
# NEW: Research queue should include ALL upcoming phases
Research Queue:
[0] /gsd:research-phase 4  # Next phase
[1] /gsd:research-phase 5  # Future phase
[2] /gsd:research-phase 6  # Future phase

# Only skip research if EXPLICITLY trivial:
Skip research if:
- Phase is pure config change
- Phase is documentation only
- Phase explicitly marked "no-research" in roadmap
```

---

## Slot Utilization Optimization

### Current Priority Order

```
1. VERIFY
2. RECONCILE
3. EXECUTE
4. PLAN
5. ADMIN
```

### Optimized Priority Order

```
1. VERIFY (quality gates)
2. EXECUTE (build the code)
3. RESEARCH (prepare future phases - NEW PRIORITY!)
4. PLAN (only after research)
5. ADMIN

Remove RECONCILE if using execute-phase (reconciliation happens internally)
```

### Optimal Slot Distribution

```
Ideal state during execution:

Slot 1: EXECUTE current phase
Slot 2: RESEARCH next phase
Slot 3: RESEARCH future phase
Slot 4: VERIFY or ADMIN

Result:
- Execution never blocks on planning
- Planning never blocks on research
- Research runs continuously ahead of execution
```

---

## Proposed orchestrate.md Changes

### Change 1: Add execute-phase as Default

```markdown
**PRIORITY 3: EXECUTE**
If execution queue has work:

- **NEW DEFAULT**: `gsd_start_session(workingDir, "/gsd:execute-phase N")`
- This executes ALL plans in the phase with wave-based parallelism
- Built-in verification between waves
- Only ONE execute at a time

**ALTERNATIVE (granular control):**

- Use `/gsd:execute-plan [path]` for individual plans
- Useful when debugging or need fine control
```

### Change 2: Aggressive Research Queue

```markdown
**RESEARCH QUEUE (NEW PRIORITY)**

Research should run continuously ahead of execution:
```

Research Queue:
[0] /gsd:research-phase N+1 # Next phase (if not researched)
[1] /gsd:research-phase N+2 # Future phase
[2] /gsd:research-phase N+3 # Future phase

```

**When to skip research:**
- Phase is documentation only
- Phase is configuration only
- Phase explicitly marked skip-research in roadmap
- Phase already has *-RESEARCH.md file

**Default: Research everything else**
```

### Change 3: Simplified Verification

```markdown
**VERIFICATION (Simplified with execute-phase)**

If using execute-phase:

- Built-in verification happens after each wave
- Orchestrator only needs PHASE-LEVEL verify after execute-phase completes

Flow:
```

execute-phase 3 → (internal: plan verify × N) → phase verify 3

```

If using execute-plan:
- Keep current two-level verification (plan + phase)
```

### Change 4: Remove Reconcile Step (if using execute-phase)

```markdown
**RECONCILIATION**

If using execute-phase:

- Reconciliation happens INSIDE execute-phase
- Orchestrator does NOT need to reconcile
- Remove from priority order

If using execute-plan:

- Keep reconciliation between individual plans
```

### Change 5: Slot Distribution Guidelines

```markdown
**OPTIMAL SLOT DISTRIBUTION**

During phase execution:
```

Slot 1: execute-phase N # Building current phase
Slot 2: research-phase N+1 # Preparing next phase
Slot 3: research-phase N+2 # Preparing future phase
Slot 4: verify OR admin # Quality gates or maintenance

```

**Why this works:**
- Research has no dependencies on execution
- Execution can proceed without waiting for planning
- Multiple phases can be researched simultaneously
- Verification runs as soon as execution completes
```

---

## Summary of Recommended Changes

| Area                     | Current                   | Recommended                         |
| ------------------------ | ------------------------- | ----------------------------------- |
| **Execution**            | execute-plan (individual) | execute-phase (all at once)         |
| **Research**             | Only if complex           | All phases by default               |
| **Research Parallelism** | Limited                   | Aggressive (N+1, N+2, N+3)          |
| **Reconciliation**       | After each plan           | Internal to execute-phase           |
| **Verification**         | Two-level (plan + phase)  | Phase-level only (if execute-phase) |
| **Slot Usage**           | Execute-focused           | Research-heavy                      |

---

## Implementation Priority

1. **High Impact, Low Risk:**
   - Add research parallelism (research N+1 while executing N)
   - Update slot distribution guidelines

2. **High Impact, Medium Risk:**
   - Switch default to execute-phase
   - Simplify verification flow

3. **Lower Priority:**
   - Remove reconcile step (if using execute-phase)
   - Update error handling for execute-phase

---

## Questions for User

Before implementing:

1. **Execution approach:**
   - Switch to execute-phase (faster, simpler)?
   - Keep execute-plan (more control)?
   - Hybrid (execute-phase default, execute-plan for debugging)?

2. **Research aggressiveness:**
   - Research ALL phases by default?
   - Keep current "only if complex" approach?

3. **Verification:**
   - Trust execute-phase's built-in verification?
   - Keep orchestrator-level plan verification?
