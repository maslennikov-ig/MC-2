# Code Review Report: Analysis forceRestart FSM Fix

- Date: 2026-02-20
- Scope: Fix contract failure in `analysis.start` when `forceRestart=true` and course is already in `stage_4_analyzing`
- Related issue: `mc2-8zqcu`

## Problem

Contract test `tests/contract/analysis.test.ts` (`should accept forceRestart flag`) failed with:

- `Invalid generation status transition: stage_4_analyzing -> stage_4_init`
- Wrapped as `TRPCClientError: Failed to start analysis`

Root cause: router always updated course status to `stage_4_init` before enqueuing analysis job, even during forced restart from active Stage 4 states.

## Implemented Fix

### File changed

- `packages/course-gen-platform/src/server/routers/analysis.ts`

### Behavioral change

- Added active Stage 4 set for restart handling: `stage_4_init`, `stage_4_analyzing`, `stage_4_clarifying`.
- When `forceRestart=true` and current status is one of these states:
  - skip pre-queue transition to `stage_4_init`
  - keep current status
  - enqueue analysis job directly
- For all other paths, existing status update to `stage_4_init` remains unchanged.
- Rollback helper is now no-op if no pre-queue status transition occurred.

## Verification

### Command

```bash
pnpm --filter @megacampus/course-gen-platform test:contract
```

### Result

- Passed: `4` test files
- Passed: `98` tests
- Includes regression confirmation for:
  - `tests/contract/analysis.test.ts` → `should accept forceRestart flag`

## Risk Notes

- This fix intentionally avoids forcing an invalid FSM transition from active Stage 4 states.
- It does not expand FSM semantics for restarting from terminal Stage 4 states (`stage_4_complete`, `stage_4_awaiting_approval`).
- If business logic needs restart from those states, that should be implemented explicitly (separate task).
