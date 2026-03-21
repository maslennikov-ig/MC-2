---
investigation_id: INV-2026-03-21-001
status: complete
timestamp: 2026-03-21
topic: FSM race condition - stage_6_complete to stage_6_generating transition
severity: medium
affected_course: cc9deff1-6d3c-4123-9aa8-c9c16c2cac0d
---

# INV-2026-03-21-001: FSM Race Condition - Invalid Transition stage_6_complete -> stage_6_generating

## Executive Summary

**Problem**: Course `cc9deff1-6d3c-4123-9aa8-c9c16c2cac0d` triggers PostgreSQL error P0001 ("Invalid generation status transition: stage_6_complete -> stage_6_generating") 16 times during Stage 6 processing.

**Root Cause**: The application code in `transitionToStage6Generating()` intentionally attempts the transition `stage_6_complete -> stage_6_generating` to support partial re-generation, but this transition was never added to the PostgreSQL FSM validation trigger. The FSM transition table only allows `stage_6_complete` to transition to `["finalizing", "completed", "failed", "cancelled"]`.

**Recommended Solution**: Add `stage_6_generating` to the valid FSM transitions from `stage_6_complete` via a SQL migration. Additionally, improve error propagation in `transitionToStage6Generating()` so failures are surfaced to the caller.

**Key Finding**: This is NOT a BullMQ stalled job issue. It is a mismatch between the application layer (which expects the transition) and the database layer (which blocks it).

## Problem Statement

**Observed behavior**: PostgreSQL raises error P0001 with message "Invalid generation status transition: stage_6_complete -> stage_6_generating (course_id: cc9deff1-6d3c-4123-9aa8-c9c16c2cac0d)" -- 16 occurrences on the staging server.

**Expected behavior**: Partial re-generation of lesson content from `stage_6_complete` should succeed, transitioning the course back to `stage_6_generating` while new jobs run.

**Impact**: Partial re-generation and generate-missing-content features silently fail to update the course status. Jobs are enqueued and may complete, but the course status remains stuck because: (a) the FSM transition is blocked, and (b) the `checkAndSetStage6Complete` completion check returns early because `generation_status !== 'stage_6_generating'`.

**Environment**: Staging (Supabase hosted PostgreSQL, BullMQ workers on VPS).

## Investigation Process

### Hypotheses Tested

| #   | Hypothesis                                                       | Result                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | BullMQ stalled job restart triggers duplicate Stage 6 processing | **Eliminated** -- Stalled job restarts process individual lessons; they don't call `transitionToStage6Generating`. The completion callback `checkAndSetStage6Complete` has a `.eq('generation_status', 'stage_6_generating')` guard (line 746) preventing double-completion. |
| 2   | Missing FSM transition in the PostgreSQL validation trigger      | **Confirmed** -- The FSM table defines `stage_6_complete: ["finalizing", "completed", "failed", "cancelled"]`. `stage_6_generating` is absent.                                                                                                                               |
| 3   | Application code attempts an illegal transition                  | **Confirmed** -- `transitionToStage6Generating()` in `helpers.ts` explicitly handles `stage_6_complete` state (lines 572-584) and attempts `stage_6_complete -> stage_6_generating`.                                                                                         |
| 4   | Race condition between concurrent workers                        | **Eliminated** -- The 16 errors are from the same course, likely from repeated user API calls or a single call hitting the transition multiple times in retry logic. Not a concurrency issue between workers.                                                                |

### Files Examined

1. `packages/course-gen-platform/supabase/migrations/20260127223000_fix_clarifying_fsm.sql` -- **Latest FSM transition map** (line 46: `stage_6_complete` transitions)
2. `packages/course-gen-platform/supabase/migrations/20260120170100_add_stage6_generating_to_completed_transition.sql` -- Added `stage_6_generating -> completed` but NOT `stage_6_complete -> stage_6_generating`
3. `packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts` -- `transitionToStage6Generating()` function (lines 514-589)
4. `packages/course-gen-platform/src/server/routers/lesson-content/procedures/partial-generate.ts` -- Calls `transitionToStage6Generating` (line 150)
5. `packages/course-gen-platform/src/server/routers/lesson-content/procedures/generate-missing.ts` -- Calls `transitionToStage6Generating` (line 213)
6. `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts` -- `checkAndSetStage6Complete()` with guard on line 746
7. `packages/course-gen-platform/src/stages/stage6-lesson-content/config/index.ts` -- BullMQ worker config (MAX_RETRIES: 3, STALLED_INTERVAL: 60s, MAX_STALLED_COUNT: 3)
8. `packages/course-gen-platform/src/stages/stage6-lesson-content/factory.ts` -- Worker/queue creation
9. `packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts` -- Job processing with completion check calls
10. `packages/course-gen-platform/supabase/migrations/20260319170000_add_status_guard_to_fsm_init_rpc.sql` -- Recent FSM guard (unrelated)
11. `docs/reports/code-review/2026-03/agd-0687-fsm-guard-review.md` -- Related FSM guard review

### Database Evidence

Queried `generation_status_history` for course `cc9deff1-6d3c-4123-9aa8-c9c16c2cac0d`:

- Clean progression observed: `pending -> stage_3_init -> ... -> stage_6_init -> stage_6_generating -> stage_6_complete -> finalizing -> completed`
- The 16 P0001 errors do NOT appear in the history table because the FSM validation trigger raises an exception BEFORE the audit trigger fires
- The course ultimately completed successfully, suggesting the errors were from a supplementary action (partial regen or generate-missing) that attempted after the initial generation completed

## Root Cause Analysis

### Primary Cause: Missing FSM Transition

The PostgreSQL function `validate_generation_status_transition()` (defined in migration `20260127223000`) does not include `stage_6_generating` in the valid transitions from `stage_6_complete`.

**FSM transition table (line 46)**:

```sql
"stage_6_complete": ["finalizing", "completed", "failed", "cancelled"]
```

**Application code that expects this transition** (`helpers.ts`, lines 572-584):

```typescript
} else if (currentStatus === 'stage_6_complete') {
    // Re-generation: transition back to generating for new/missing content
    const { error: updateError } = await supabase
      .from('courses')
      .update({ generation_status: 'stage_6_generating' })
      .eq('id', courseId);
```

The code comment explicitly states this is for "re-generation of missing/partial content" -- a legitimate use case that was added to the application layer but never reflected in the database FSM.

### Contributing Factor: Silent Error Swallowing

`transitionToStage6Generating()` only logs the FSM error as a warning (lines 579-583) but does NOT propagate it or stop the calling procedure. The caller (`partialGenerate` or `generateMissingContent`) continues to enqueue BullMQ jobs even though the status transition failed. This means:

1. Jobs are enqueued and processed
2. Lesson content may be generated and saved to `lesson_contents`
3. But `checkAndSetStage6Complete` returns early (line 614) because `generation_status !== 'stage_6_generating'`
4. The course status never progresses, leaving it in a limbo state from the user's perspective

### Mechanism of Failure

```
User triggers partial regeneration on completed Stage 6
  |
  v
transitionToStage6Generating() reads status = 'stage_6_complete'
  |
  v
UPDATE courses SET generation_status = 'stage_6_generating' WHERE id = ?
  |
  v
PostgreSQL trigger validate_generation_status_transition() fires
  |
  v
Checks: stage_6_complete -> stage_6_generating  NOT IN valid transitions
  |
  v
RAISE EXCEPTION P0001 'Invalid generation status transition: stage_6_complete -> stage_6_generating'
  |
  v
Supabase returns error object to application
  |
  v
Application logs warning but CONTINUES (does not throw)
  |
  v
Jobs enqueued -> workers process lessons -> completion check is no-op
  |
  v
Course remains in stage_6_complete (or completed/finalized state)
```

## Proposed Solutions

### Solution A: Add FSM Transition (Recommended)

**Description**: Add `stage_6_generating` to the valid transitions from `stage_6_complete` in the PostgreSQL FSM trigger function.

**Implementation**:

Migration SQL:

```sql
-- In validate_generation_status_transition()
-- Change:
"stage_6_complete": ["finalizing", "completed", "failed", "cancelled"]
-- To:
"stage_6_complete": ["stage_6_generating", "finalizing", "completed", "failed", "cancelled"]
```

**Files to modify**:

- New migration: `supabase/migrations/{timestamp}_add_stage6_complete_to_generating_transition.sql`

**Pros**:

- Minimal change (1 line in FSM table)
- Aligns database with existing application semantics
- Enables the intentional re-generation flow
- Pattern already used: `completed -> stage_6_init` is allowed for full re-generation

**Cons**:

- Allows backward state transition, slightly increasing state machine complexity
- Does not address the error-swallowing issue in `transitionToStage6Generating`

**Complexity**: Low
**Risk**: Low -- this transition is already expected by the application layer

### Solution B: Route Through stage_6_init (Two-Step Transition)

**Description**: Modify `transitionToStage6Generating()` to route `stage_6_complete` through `stage_6_init` first, then to `stage_6_generating`. Add `stage_6_init` to valid transitions from `stage_6_complete`.

**Implementation**:

1. SQL migration: Add `stage_6_init` to `stage_6_complete` transitions
2. Application code: Add two-step transition for `stage_6_complete`, matching the pattern used for `stage_5_complete` (lines 536-557)

```typescript
} else if (currentStatus === 'stage_6_complete') {
    await supabase.from('courses')
      .update({ generation_status: 'stage_6_init' })
      .eq('id', courseId);
    const { error: updateError } = await supabase.from('courses')
      .update({ generation_status: 'stage_6_generating' })
      .eq('id', courseId);
    ...
}
```

**Pros**:

- Consistent with the two-step pattern used for `stage_5_complete -> stage_6_init -> stage_6_generating`
- Provides an intermediate state for monitoring/observability

**Cons**:

- Two sequential writes instead of one (slight performance cost)
- Two DB migrations needed (both `stage_6_init` for `stage_6_complete`, and the code change)
- Non-atomic: if the second write fails, course is stuck in `stage_6_init`

**Complexity**: Medium
**Risk**: Low-Medium

### Solution C: Fix Both Database and Application Layer (Recommended Extension)

**Description**: Combine Solution A with improved error handling in `transitionToStage6Generating()`.

**Implementation**:

1. SQL migration (same as Solution A)
2. Application code change in `helpers.ts`: make `transitionToStage6Generating` return a success/failure indicator so callers can abort if the transition fails

```typescript
export async function transitionToStage6Generating(
  courseId: string,
  requestId: string
): Promise<boolean> {  // Returns true if transition succeeded
    ...
    if (updateError) {
      logger.error({ ... }, 'Failed to update generation_status');
      return false;  // Caller can decide whether to proceed
    }
    return true;
}
```

3. Update callers to check result:

```typescript
const transitioned = await transitionToStage6Generating(courseId, requestId);
if (!transitioned) {
  throw new TRPCError({
    code: 'CONFLICT',
    message: 'Cannot start generation: course is not in a valid state',
  });
}
```

**Pros**:

- Fixes the root cause (FSM transition)
- Prevents silent failures (error propagation)
- Callers get proper feedback
- Users get proper error messages

**Cons**:

- Slightly more code changes (3 files)

**Complexity**: Medium
**Risk**: Low

## Implementation Guidance

**Priority**: High -- this blocks partial regeneration functionality

**Files to change**:

1. **New SQL migration** (mandatory):
   - Path: `packages/course-gen-platform/supabase/migrations/{timestamp}_add_stage6_complete_to_generating_transition.sql`
   - Content: Replace `validate_generation_status_transition()` with updated transition map

2. **`packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts`** (recommended):
   - Lines 514-589: Change `transitionToStage6Generating` return type to `Promise<boolean>`
   - All error branches should `return false`
   - Success branches should `return true`

3. **`packages/course-gen-platform/src/server/routers/lesson-content/procedures/partial-generate.ts`** (recommended):
   - Line 150: Check return value of `transitionToStage6Generating`, throw CONFLICT if false

4. **`packages/course-gen-platform/src/server/routers/lesson-content/procedures/generate-missing.ts`** (recommended):
   - Line 213: Check return value of `transitionToStage6Generating`, throw CONFLICT if false

**Validation criteria**:

- `pnpm type-check && pnpm build` passes
- Manual test: trigger partial regeneration on a course in `stage_6_complete` state -- should succeed
- Manual test: trigger partial regeneration on a course in an invalid state -- should return CONFLICT error
- Verify no existing tests break

**Testing requirements**:

- Unit test for `transitionToStage6Generating` covering all status branches
- Integration test: create course, advance to `stage_6_complete`, trigger partial regen, verify transition succeeds

## Risks and Considerations

1. **No breaking changes**: Adding a transition to the FSM is backward-compatible
2. **Performance**: No performance impact (single row update)
3. **Side effects**: The partial regeneration flow will start working as intended. Courses that were silently failing to re-generate will now succeed.
4. **Data integrity**: The completion check in `checkAndSetStage6Complete` already has a guard (`.eq('generation_status', 'stage_6_generating')`) that prevents double-completion. This guard remains effective.

## Documentation References

### Tier 0 (Project Internal)

- **`helpers.ts` line 506**: Comment explicitly lists `stage_6_complete -> stage_6_generating` as a valid flow
- **`helpers.ts` lines 87-91**: `shouldSkipCompletionCheckForPartialGeneration` function specifically handles `stage_6_complete` state
- **Migration `20260127223000`**: Latest FSM transition table (line 46)
- **Code review `agd-0687`**: Related FSM guard review (2026-03-19)
- **Previous investigation `INV-2025-11-17-008`**: Original FSM redesign context

### Tier 1 (Context7)

Not queried -- this is a project-specific FSM logic issue, not a framework/library question.

## MCP Server Usage

- **Supabase MCP**: `execute_sql` to query `generation_status_history` for course timeline; `get_logs` for Postgres error logs
- **Sequential Thinking MCP**: Used for root cause synthesis and solution evaluation

## Next Steps

1. Review this investigation report
2. Select Solution A (minimal) or Solution C (comprehensive) -- recommended: Solution C
3. Implement the SQL migration and application code changes
4. Verify on staging with the affected course ID

## Investigation Log

| Time | Action                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| T+0  | Searched codebase for "Invalid generation status transition" -- found FSM trigger in migrations                                              |
| T+1  | Read FSM transition map from migration `20260127223000` -- confirmed `stage_6_generating` missing from `stage_6_complete` transitions        |
| T+2  | Read `transitionToStage6Generating()` in helpers.ts -- confirmed application intentionally attempts `stage_6_complete -> stage_6_generating` |
| T+3  | Read partial-generate.ts and generate-missing.ts -- confirmed both call `transitionToStage6Generating`                                       |
| T+4  | Read Stage 6 worker config -- confirmed BullMQ settings (30 concurrent, 3 retries, 60s stalled interval)                                     |
| T+5  | Read database-service.ts -- confirmed `checkAndSetStage6Complete` has `.eq('generation_status', 'stage_6_generating')` guard                 |
| T+6  | Queried `generation_status_history` for affected course -- confirmed clean progression, no failed transitions visible                        |
| T+7  | Checked Postgres logs -- P0001 errors no longer in rolling window                                                                            |
| T+8  | Synthesized root cause and formulated solutions                                                                                              |
