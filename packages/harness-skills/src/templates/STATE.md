# Project State

## Project Reference

See: specs/{{SPEC_ID}}/SPEC.md
**Spec ID:** {{SPEC_ID}}
**Project:** {{PROJECT_NAME}}
**Milestone:** {{MILESTONE}}

## Current Position

| Field         | Value                                  |
| ------------- | -------------------------------------- |
| Phase         | {{CURRENT_PHASE}} of {{TOTAL_PHASES}}  |
| Plan          | {{CURRENT_PLAN}} of {{PLANS_IN_PHASE}} |
| Status        | {{STATUS}}                             |
| Last Activity | {{LAST_ACTIVITY}}                      |

Progress: [{{PROGRESS_BAR}}] {{PROGRESS_PERCENT}}%

## Phase Summary

| Phase | Name | Plans | Executed | Verified |
| ----- | ---- | ----- | -------- | -------- |

{{PHASE_TABLE}}

## Verification Gate

| Field                  | Value                |
| ---------------------- | -------------------- |
| Highest Executed Phase | {{HIGHEST_EXECUTED}} |
| Highest Verified Phase | {{HIGHEST_VERIFIED}} |
| Pending Verification   | {{PENDING_VERIFY}}   |

## Performance Metrics

**Velocity:**

- Total plans completed: {{COMPLETED_PLANS}}
- Total phases completed: {{COMPLETED_PHASES}}

## Session Continuity

| Field          | Value              |
| -------------- | ------------------ |
| Last Session   | {{LAST_SESSION}}   |
| Stopped At     | {{STOPPED_AT}}     |
| Resume Command | {{RESUME_COMMAND}} |

## Accumulated Context

### Key Decisions

{{DECISIONS}}

### Deferred Issues

{{DEFERRED}}

### Blockers

{{BLOCKERS}}

---

_State file maintained by harness. Updated after each plan/phase completion._
_Last sync: {{LAST_SYNC}}_
