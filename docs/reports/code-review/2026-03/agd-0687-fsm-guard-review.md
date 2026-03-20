# Code Review: AGD-0687 FSM Guard + Clarifying Progress Fix

**Reviewer:** Senior Code Reviewer (automated)
**Date:** 2026-03-19
**Commit:** de500dc009d387487f549b100a03c817fbbda57b
**Base:** 430bdcd1d4af131752ee2b9e572f8598e3cc4e9d
**Branch:** develop
**Files changed:** 3 (25 lines added, 0 removed)

---

## Summary

Two fixes targeting course generation pipeline reliability:

1. **Generation status guard** in `initiate.router.ts` -- prevents duplicate FSM initialization by rejecting API requests when the course is already being generated.
2. **Progress message fix** in `orchestrator-phase-helpers.ts` + `validators.ts` -- updates the user-facing progress message from "Generating clarifying questions..." to "Waiting for answers to clarifying questions" after the system transitions to the `stage_4_clarifying` state.

---

## Plan Alignment

### Fix 1: Generation Status Guard

**Alignment: Good.** The implementation matches the planned approach: check `generation_status` before allowing FSM initialization, reject with HTTP 409 CONFLICT when generation is already in progress. The idempotency key (`Date.now()`) was intentionally left unchanged per plan rationale (48h persistence would block re-generation after cancellation).

### Fix 2: Progress Message Fix

**Alignment: Partial.** The `PROGRESS_MESSAGES.step_0_5_waiting` key was added as planned and the `updateCourseProgress` call is placed correctly (after the `generation_status` DB transition, before the `ClarifyingQuestionsInterrupt` throw). However, there is a bug in the implementation -- see Critical Issue #1 below.

---

## Issues

### CRITICAL #1: `updateCourseProgress` called with invalid status value

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts`, line 298-304

The new `updateCourseProgress` call passes `'stage_4_clarifying'` as the `status` parameter:

```typescript
await updateCourseProgress(
  courseId,
  'stage_4_clarifying', // <-- BUG: not a valid p_status value
  PROGRESS_RANGES.step_0_5.end,
  PROGRESS_MESSAGES.step_0_5_waiting,
  supabase
);
```

The underlying PostgreSQL RPC `update_course_progress` validates `p_status` against exactly five allowed values (see migration `20260316120000`):

```sql
IF p_status NOT IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled') THEN
  RAISE EXCEPTION 'Invalid status: %. Must be pending|in_progress|completed|failed|cancelled', p_status;
END IF;
```

Passing `'stage_4_clarifying'` will cause the RPC to raise an exception. The TypeScript `updateCourseProgress` wrapper (validators.ts lines 97-107) catches this as a non-blocking warning and continues, so the pipeline will NOT crash. However, the progress message will silently fail to update, completely defeating the purpose of this fix. The user will still see the stale "Generating..." message.

Every other `updateCourseProgress` call in the same function correctly uses `'in_progress'` as the status value, which the RPC maps to the appropriate FSM state (`stage_4_analyzing` for step 4).

**Note on the design mismatch:** The `status` parameter in `updateCourseProgress` is a _step-level_ status (`in_progress`, `completed`, etc.), not a _course-level_ FSM state (`stage_4_clarifying`). The RPC itself maps the combination of `(p_step_id, p_status)` to the FSM state. However, the generation_status was already updated to `stage_4_clarifying` by the direct Supabase `UPDATE` on lines 283-289, so updating progress just needs `'in_progress'` to refresh the message.

**Fix:** Change `'stage_4_clarifying'` to `'in_progress'`:

```typescript
await updateCourseProgress(
  courseId,
  'in_progress', // Step-level status, not FSM state
  PROGRESS_RANGES.step_0_5.end,
  PROGRESS_MESSAGES.step_0_5_waiting,
  supabase
);
```

**Secondary concern:** Even with `'in_progress'`, the RPC will map step_id=4 + in_progress to `stage_4_analyzing` and overwrite the `generation_status` column. But the direct `UPDATE` on lines 283-289 already set it to `stage_4_clarifying`. This means the RPC call would transition the FSM from `stage_4_clarifying` to `stage_4_analyzing`, which is a valid FSM transition but semantically wrong -- the course is waiting for user input, not analyzing. The progress message will update but the status column will be incorrect.

**Better fix:** Swap the order -- call `updateCourseProgress` with `'in_progress'` _before_ the direct `generation_status = 'stage_4_clarifying'` update. Or, only use the direct update for the status column and use a separate direct JSONB update for the progress message field, bypassing the RPC entirely.

The cleanest approach may be to update `generation_progress->message` directly alongside the existing status update on lines 283-289:

```typescript
const { error: statusError } = await supabase
  .from('courses')
  .update({
    generation_status: 'stage_4_clarifying',
    generation_progress: {
      ...existingProgress,
      message: PROGRESS_MESSAGES.step_0_5_waiting,
    },
    updated_at: new Date().toISOString(),
  })
  .eq('id', courseId);
```

Or use a raw SQL RPC / `.rpc()` call that updates only the `generation_progress->message` field without touching `generation_status`.

---

### IMPORTANT #1: `completed` missing from `ALLOWED_INITIATE_STATUSES`

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.router.ts`, line 56

The `ALLOWED_INITIATE_STATUSES` list is: `['draft', 'pending', 'failed', 'cancelled']`.

The `completed` status is not included. This means users cannot re-generate a completed course. The FSM transition table (migration `20260127223000`) explicitly allows `completed -> pending`, `completed -> stage_2_init`, etc., confirming that re-generation from `completed` is a supported flow.

Whether this omission is intentional or a bug depends on the product requirements:

- **If re-generation of completed courses is desired** (common for iterative refinement), add `'completed'` to the list.
- **If completed courses should be locked** (users must explicitly duplicate first), the current behavior is correct, but the error message should say so clearly (e.g., "Cannot re-generate a completed course. Please create a copy first.").

**Recommendation:** Clarify with product. The FSM supports it, the guard blocks it. This is likely an oversight -- add `'completed'` to `ALLOWED_INITIATE_STATUSES`.

---

### IMPORTANT #2: `draft` is not a valid `generation_status` enum value

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.router.ts`, line 56

The `ALLOWED_INITIATE_STATUSES` includes `'draft'`, but `'draft'` does not exist in the `generation_status` PostgreSQL enum. The enum values are: `pending`, `stage_2_init`, `stage_2_processing`, ..., `completed`, `failed`, `cancelled`.

The `courses` table has a separate `status` column with `course_status` enum (`draft`, `published`, `archived`). These are distinct columns.

`generation_status` is nullable. When a course is first created (before any generation attempt), `generation_status` is `NULL`. The guard handles `NULL` correctly because of the `course.generation_status &&` check (line 58) -- if it is null/undefined, the condition short-circuits to false and the guard does not block.

Having `'draft'` in the list is dead code -- it can never match. This is not harmful but is misleading. Consider removing it and adding a comment explaining that `NULL` means "never generated":

```typescript
// NULL = never generated (new course), always allowed
// These statuses indicate a terminal/initial state where re-generation is safe
const ALLOWED_INITIATE_STATUSES = ['pending', 'failed', 'cancelled'];
```

---

### IMPORTANT #3: Race condition between guard check and FSM initialization

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.router.ts`

The guard reads `generation_status` on line 42-48 (via `SELECT *`), then the FSM initialization occurs much later on line 257-271 (via `InitializeFSMCommandHandler.handle()`). Between these two points, significant work happens: concurrency checks (line 78), worker readiness (line 81-99), file queries (lines 103-132), and path determination (lines 161-252).

Two concurrent requests could both pass the guard check before either reaches the FSM `UPDATE` statement. The FSM RPC (`initialize_fsm_with_outbox`) uses a row-level lock via `UPDATE courses ... WHERE id = p_entity_id`, which serializes concurrent writes. However, with `Date.now()` in the idempotency key, both requests would have unique keys and both would succeed, creating duplicate FSM_INITIALIZED events -- the exact problem this guard is supposed to prevent.

The guard reduces the race window (fast-clicking UI) but does not eliminate it. For true protection, the fix needs one of:

1. **Pessimistic lock:** Add `SELECT ... FOR UPDATE` when reading the course at line 42, holding a row lock through the entire mutation. This is the most robust fix but increases lock duration.
2. **Optimistic concurrency:** Add a `WHERE generation_status IN ('pending','failed','cancelled') OR generation_status IS NULL` clause to the `UPDATE` inside `initialize_fsm_with_outbox` and check `FOUND`. If another request updated the status first, the UPDATE returns 0 rows.
3. **Application-level lock:** Use a Redis `SET NX` with a short TTL (e.g., `initiate:${courseId}`) as a mutex before the guard check.

**Recommendation:** Option 2 is the most reliable and aligns with existing database patterns. The current guard is a useful first layer (catches 95%+ of duplicate clicks) but document the known limitation.

---

### SUGGESTION #1: Extract `ALLOWED_INITIATE_STATUSES` as a module-level constant

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.router.ts`, line 56

The constant is defined inside the mutation handler. For testability and reuse (e.g., in integration tests or other routers), consider extracting it to the `_shared/constants.ts` file:

```typescript
// _shared/constants.ts
export const ALLOWED_INITIATE_STATUSES = ['pending', 'failed', 'cancelled', 'completed'] as const;
```

This also makes the list `as const` for type narrowing.

---

### SUGGESTION #2: Add structured log field for allowed statuses

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.router.ts`, line 61-64

The warning log includes `currentStatus` but not the allowed statuses. For faster debugging, include them:

```typescript
logger.warn(
  {
    requestId,
    courseId,
    currentStatus: course.generation_status,
    allowedStatuses: ALLOWED_INITIATE_STATUSES,
  },
  'Duplicate generation attempt rejected - course already in progress'
);
```

---

### SUGGESTION #3: Consider adding the new progress message key to PROGRESS_MESSAGES type documentation

**File:** `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/utils/validators.ts`, line 40

The `step_0_5_waiting` key is added between `step_0_5_start` and `step_0_5_complete`, which makes sense chronologically. The `as const` typing handles type safety. The JSDoc comment above `PROGRESS_MESSAGES` (lines 21-33) describes phases but does not mention the clarifying waiting sub-state. Consider adding a line:

```
 * - Phase 0.5: Clarifying questions (generation, waiting for answers, completion)
```

---

## What Was Done Well

1. **Correct HTTP status code:** Using `CONFLICT` (409) for the duplicate generation guard is semantically accurate and allows the frontend to handle it distinctly from other errors.

2. **Guard placement:** The guard is placed after `assertCourseAccess` but before any expensive operations (file queries, worker readiness checks). This is the optimal position -- unauthorized users get rejected first, then duplicates, then the actual work.

3. **Logging quality:** The warning log includes all necessary context (`requestId`, `courseId`, `currentStatus`) for production debugging.

4. **Progress message placement:** Updating the progress after the `generation_status` transition but before the `ClarifyingQuestionsInterrupt` throw is correct for the non-automatic (interactive) code path.

5. **`as const` typing on PROGRESS_MESSAGES:** The existing pattern ensures type safety when adding new keys.

6. **Non-breaking change:** The guard returns a clear TRPC error that the frontend can handle gracefully. No schema migrations required.

---

## Verdict

**Fix 1 (FSM Guard):** Conditionally approved. The guard works as a first-layer defense and will catch the majority of duplicate generation attempts (UI double-clicks, retry-happy clients). The race condition (Important #3) is a known limitation. The `completed` and `draft` status handling (Important #1, #2) needs clarification but is not blocking.

**Fix 2 (Progress Message):** Requires rework. The `updateCourseProgress` call with `'stage_4_clarifying'` as the status will fail silently at the database RPC level (Critical #1). The progress message will not actually update for the user. This must be fixed before the change achieves its intended purpose.

---

## Action Items

| Priority   | Issue                                | Action                                                                                                    |
| ---------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| CRITICAL   | RPC status validation failure        | Change `'stage_4_clarifying'` to `'in_progress'` or use direct JSONB update to avoid FSM status collision |
| IMPORTANT  | `completed` not in allowed list      | Confirm with product; add if re-generation desired                                                        |
| IMPORTANT  | `draft` is dead code in allowed list | Remove and document NULL handling                                                                         |
| IMPORTANT  | Race condition window                | Document limitation; consider adding DB-level guard in `initialize_fsm_with_outbox`                       |
| SUGGESTION | Extract constant                     | Move `ALLOWED_INITIATE_STATUSES` to `_shared/constants.ts`                                                |
| SUGGESTION | Richer logging                       | Include `allowedStatuses` in warn log                                                                     |
| SUGGESTION | JSDoc update                         | Document the waiting sub-state in PROGRESS_MESSAGES header                                                |

---

## Appendix: `generation_status` Enum Values

For reference, the complete `generation_status` enum (from `database.types.ts`):

```
pending
stage_2_init, stage_2_processing, stage_2_complete, stage_2_awaiting_approval
stage_3_init, stage_3_summarizing, stage_3_complete, stage_3_awaiting_approval
stage_4_init, stage_4_clarifying, stage_4_analyzing, stage_4_complete, stage_4_awaiting_approval
stage_5_init, stage_5_generating, stage_5_complete, stage_5_awaiting_approval
stage_6_init, stage_6_generating, stage_6_complete
finalizing
completed
failed
cancelled
```

`NULL` = course has never been generated (new course, `generation_status` column is nullable).
`draft` does NOT exist in this enum (it belongs to the separate `course_status` enum).
