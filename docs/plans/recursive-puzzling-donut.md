# Plan: Fix Course Progress Display Issues (VEV-4653)

## Summary

Two issues on dev server for course VEV-4653:

1. **Stage 2 caching bug**: Shows "0 of 4 documents processed" when documents are cached (should show all completed)
2. **Stage 4 clarifying questions bug**: Questions not generated, infinite loading state

---

## Problem 1: Stage 2 Progress Display with Cached Documents

### Root Cause Analysis

When all documents are cached (via deduplication):

1. `lifecycle.router.ts:362` sets `initialState = 'stage_3_init'` (skipping Stage 2)
2. `initialize_fsm_with_outbox` RPC only updates `generation_status`, NOT `generation_progress`
3. UI reads `generation_progress.current_step` which remains at old value (1 or 2)
4. Result: UI shows Stage 2 as "in progress" with 0 documents processed

### Evidence

```typescript
// lifecycle.router.ts:345-362
} else if (hasAnyFiles) {
  // Path 2: All files already indexed (deduplicated)
  jobs = [{ queue: JobType.DOCUMENT_CLASSIFICATION, ... }];
  initialState = 'stage_3_init';  // <-- Skips to Stage 3
  // BUT generation_progress is NOT updated!
}
```

```sql
-- initialize_fsm_with_outbox RPC (line 126-131)
UPDATE courses
SET
  generation_status = p_initial_state::generation_status,
  updated_at = NOW()
  -- NO generation_progress update here!
WHERE id = p_entity_id
```

### Solution

**Option A (Recommended)**: Update `generation_progress` in FSM initialization RPC

Modify `initialize_fsm_with_outbox` to also update `generation_progress` based on `p_initial_state`:

```sql
-- When initial_state = 'stage_3_init', mark Stage 2 as completed
generation_progress = CASE
  WHEN p_initial_state = 'stage_3_init' THEN
    jsonb_set(generation_progress, '{current_step}', '3'::jsonb)
  WHEN p_initial_state = 'stage_4_init' THEN
    jsonb_set(generation_progress, '{current_step}', '4'::jsonb)
  ELSE generation_progress
END
```

**Option B**: Update `lifecycle.router.ts` to call `update_course_progress` RPC after FSM init

### Files to Modify

1. `packages/course-gen-platform/supabase/migrations/YYYYMMDDHHMMSS_fix_stage2_progress_on_cache.sql` (new migration)
2. OR `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts`

---

## Problem 2: Stage 4 Clarifying Questions Not Generated

### Diagnostic Steps (Need to Perform on Dev)

1. Check course status:

   ```sql
   SELECT id, generation_status, generation_progress, settings
   FROM courses WHERE generation_code = 'VEV-4653';
   ```

2. Check clarifying questions:

   ```sql
   SELECT * FROM clarifying_questions
   WHERE course_id = '<course_id>'
   ORDER BY created_at;
   ```

3. Check generation_trace for Stage 4:

   ```sql
   SELECT stage, phase, step_name, error_data, duration_ms
   FROM generation_trace
   WHERE course_id = '<course_id>' AND stage = 'stage_4'
   ORDER BY created_at;
   ```

4. Check if clarifying questions enabled:
   ```sql
   SELECT settings->'clarifying_questions_enabled' as enabled,
          settings->'clarifying_questions_skipped' as skipped
   FROM courses WHERE generation_code = 'VEV-4653';
   ```

### Potential Causes

| Cause                    | Symptom                              | Check                        |
| ------------------------ | ------------------------------------ | ---------------------------- |
| LLM timeout              | No trace with step='clarifying'      | Check generation_trace       |
| Budget allocation failed | No budget_allocation trace           | Check stage_4 phase='budget' |
| Settings disabled        | Questions never generated            | Check settings JSON          |
| FSM stuck                | Status = stage_4_clarifying forever  | Check generation_status      |
| RLS blocking             | Insert to clarifying_questions fails | Check Supabase logs          |

### Key Files

- `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts` - Phase 0.5 logic
- `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` - Question generation
- `packages/course-gen-platform/src/server/routers/clarifying.router.ts` - API endpoints

---

## Implementation Plan

### Phase 1: Diagnose Stage 4 Issue (Priority - Blocking)

**Status**: Course VEV-4653 is still stuck - can diagnose live

1. Query course status via Supabase MCP:

   ```sql
   SELECT id, generation_status, generation_progress, settings,
          settings->'clarifying_questions_enabled' as cq_enabled
   FROM courses
   WHERE generation_code = 'VEV-4653';
   ```

2. Check clarifying_questions table:

   ```sql
   SELECT * FROM clarifying_questions
   WHERE course_id = (SELECT id FROM courses WHERE generation_code = 'VEV-4653')
   ORDER BY created_at;
   ```

3. Check generation_trace for Stage 4 errors:

   ```sql
   SELECT stage, phase, step_name, error_data, duration_ms, created_at
   FROM generation_trace
   WHERE course_id = (SELECT id FROM courses WHERE generation_code = 'VEV-4653')
     AND stage = 'stage_4'
   ORDER BY created_at DESC
   LIMIT 20;
   ```

4. Check PM2 logs on dev server for errors

### Phase 2: Fix Stage 2 Progress Display

1. Create migration: `YYYYMMDDHHMMSS_fix_generation_progress_on_skip.sql`
2. Modify `initialize_fsm_with_outbox` RPC to update `generation_progress`:
   - When `initial_state = 'stage_3_init'`: set `current_step = 3`, mark Stage 2 completed
   - When `initial_state = 'stage_4_init'`: set `current_step = 4`, mark Stages 2+3 completed
3. Apply migration to dev and test

### Phase 3: Fix Stage 4 (After Diagnosis)

Based on Phase 1 findings, implement appropriate fix:

- If LLM timeout: increase timeout or add retry
- If settings issue: fix settings or add validation
- If FSM stuck: add manual recovery or fix transition
- If RLS blocking: fix policy

---

## Verification

1. **Stage 2 fix**:
   - Create new course with same documents (cached)
   - Verify UI shows all documents as completed immediately
   - Verify progress shows correct stage (3, not 2)

2. **Stage 4 fix**:
   - Restart or retry course VEV-4653
   - Verify clarifying questions are generated
   - Verify UI shows questions without infinite loading

---

## Status

- [x] Phase 1 analysis complete
- [ ] Phase 1 live diagnosis (pending approval)
- [ ] Phase 2 implementation
- [ ] Phase 3 implementation
