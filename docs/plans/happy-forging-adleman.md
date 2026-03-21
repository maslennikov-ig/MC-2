# Plan: Fix FSM pending → stage_3_init / stage_4_init transition

## Context

Course `5d77528a` fails to launch with error:

```
Invalid generation status transition: pending -> stage_3_init
Valid transitions from pending: ["stage_2_init", "cancelled"]
```

**Root cause**: `initiate.router.ts` has 3 code paths:

- Path 1: `pending → stage_2_init` (files need processing) — works
- Path 2: `pending → stage_3_init` (files already indexed, skip Stage 2) — **BLOCKED by FSM**
- Path 3: `pending → stage_4_init` (no files, skip to analysis) — **BLOCKED by FSM**

The FSM trigger only allows `pending → [stage_2_init, cancelled]` but the initiate procedure legitimately skips stages when documents are pre-processed.

## Fix

**Single migration**: Add `stage_3_init` and `stage_4_init` to valid transitions from `pending`.

**File**: `packages/course-gen-platform/supabase/migrations/20260321110000_allow_pending_skip_stages.sql`

Change line in `validate_generation_status_transition()`:

```sql
"pending": ["stage_2_init", "cancelled"]
```

to:

```sql
"pending": ["stage_2_init", "stage_3_init", "stage_4_init", "cancelled"]
```

**Also**: Fix course `5d77528a` by updating its status so the user can retry.

## Verification

1. Apply migration
2. Update course status: `UPDATE courses SET generation_status = 'pending' WHERE id = '5d77528a...'` (it's already pending, just retry launch)
3. Verify launch works
4. Run `pnpm type-check && pnpm build`
