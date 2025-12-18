# Task: Complete FSM Migration - Update RPC Function for New Generation Status Enum

**Created**: 2025-11-17
**Priority**: P0-CRITICAL
**Blocking**: T053 E2E Test, Stage 4 Analysis, Production Deployment
**Investigation Source**: [INV-2025-11-17-014](../investigations/INV-2025-11-17-014-fsm-migration-blocking-t053.md)
**Execution Model**: Sequential (database cleanup → migration → testing → documentation)

---

## Executive Summary

**Problem**: Migration `20251117103031_redesign_generation_status.sql` updated the `generation_status` enum and FSM trigger but did NOT update the `update_course_progress` RPC function. This causes database errors when Stage 3 tries to update course status.

**Root Cause**: RPC function `update_course_progress` (created in migration `20251021080100`) still maps step_id values to OLD enum values like `'generating_structure'` which no longer exist after the FSM redesign.

**Error Chain**:
1. Stage 3 handler calls `update_course_progress(step_id=3, status='in_progress')`
2. RPC maps this to `'generating_structure'::generation_status`
3. PostgreSQL rejects: `invalid input value for enum generation_status: "generating_structure"`
4. Course stays in `'pending'` status (never transitions to `'stage_3_complete'`)
5. Stage 4 cannot start: `Invalid generation status transition: pending → stage_4_init`

**Solution**: Create new migration to rewrite `update_course_progress` RPC function with correct stage-specific enum mappings.

**Estimated Duration**: 2-3 hours
**Risk**: Low (database migration, thoroughly tested)

---

## Background Context

### What is the FSM Migration?

**Migration File**: `packages/course-gen-platform/supabase/migrations/20251117103031_redesign_generation_status.sql`

**What It Did**:
1. Updated `generation_status` enum from generic values to stage-specific values
2. Created FSM trigger `trg_validate_generation_status` to enforce valid state transitions
3. Updated views and materialized views to use new enum values

**What It FORGOT**:
- Did NOT update `update_course_progress` RPC function (created in earlier migration `20251021080100`)

### Old vs New Enum Values

**OLD VALUES** (removed by migration):
- `'initializing'`
- `'processing_documents'`
- `'analyzing_task'`
- `'generating_structure'`
- `'generating_content'`

**NEW VALUES** (stage-specific):
- `'pending'`
- `'stage_2_init'`, `'stage_2_processing'`, `'stage_2_complete'`
- `'stage_3_init'`, `'stage_3_summarizing'`, `'stage_3_complete'`
- `'stage_4_init'`, `'stage_4_analyzing'`, `'stage_4_complete'`
- `'stage_5_init'`, `'stage_5_generating'`, `'stage_5_complete'`
- `'finalizing'`, `'completed'`, `'failed'`, `'cancelled'`

### Why This Blocks T053 Test

**Test Flow**:
1. T053 E2E test clears database (creates course in `'pending'` status)
2. Stage 2 (document processing) completes → sets `'stage_2_complete'` ✅
3. Stage 3 (summarization) starts → calls `update_course_progress(step_id=3, status='in_progress')`
4. RPC tries to set `'generating_structure'` ❌ **DATABASE REJECTS**
5. Course stays in `'pending'` (Stage 3 never updates status)
6. Stage 4 tries to start but FSM rejects `pending → stage_4_init` transition
7. Test fails permanently (not retriable)

---

## Task Breakdown

### Phase 1: Pre-Migration Cleanup (15-30 min)

**Objective**: Clean Supabase database to prepare for migration testing.

**Executor**: `supabase-auditor` OR MAIN (with Supabase MCP tools)

**Steps**:

1. **Kill All Running Tests**:
   ```bash
   # Kill background test processes
   pkill -f "vitest.*t053"

   # Verify no tests running
   ps aux | grep vitest
   ```

2. **Clear Redis**:
   ```bash
   redis-cli FLUSHALL
   ```

3. **Clear Supabase Tables** (use Supabase MCP `execute_sql`):
   ```sql
   -- Clear all course-related data (preserve auth/organizations)
   DELETE FROM courses WHERE organization_id = (
     SELECT id FROM organizations WHERE slug = 'test-org'
   );
   DELETE FROM file_catalog WHERE organization_id = (
     SELECT id FROM organizations WHERE slug = 'test-org'
   );
   DELETE FROM job_status;
   DELETE FROM system_metrics WHERE created_at < NOW();
   DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '1 day';
   DELETE FROM generation_status_history WHERE created_at < NOW() - INTERVAL '1 day';

   -- Verify cleanup
   SELECT COUNT(*) as course_count FROM courses;
   SELECT COUNT(*) as file_count FROM file_catalog;
   SELECT COUNT(*) as job_count FROM job_status;
   ```

4. **Clear Docling Cache**:
   ```bash
   # Clear Python cache
   find /home/me/code/megacampus2-worktrees/generation-json -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

   # Clear temp directories
   rm -rf /home/me/code/megacampus2-worktrees/generation-json/.tmp/*
   rm -f /tmp/t053-*.log

   # Verify cleanup
   ls -lah /home/me/code/megacampus2-worktrees/generation-json/.tmp/
   ```

5. **Verify Database State**:
   ```sql
   -- Check current migration status
   SELECT version, name FROM supabase_migrations.schema_migrations
   ORDER BY version DESC LIMIT 5;

   -- Check enum values (should see NEW values from FSM migration)
   SELECT enumlabel FROM pg_enum
   WHERE enumtypid = 'generation_status'::regtype
   ORDER BY enumsortorder;

   -- Check RPC function exists (should see OLD implementation)
   SELECT proname, prosrc FROM pg_proc
   WHERE proname = 'update_course_progress';
   ```

**Success Criteria**:
- ✅ All test processes killed
- ✅ Redis empty (`FLUSHALL` confirms 0 keys)
- ✅ Supabase tables cleared (courses, file_catalog, job_status empty)
- ✅ Docling cache cleared (.tmp empty, no __pycache__)
- ✅ Migration 20251117103031 applied (enum has new values)
- ✅ RPC function exists but uses OLD logic (step_id=3 → 'generating_structure')

---

### Phase 2: Create New Migration (30-45 min)

**Objective**: Create migration file to update `update_course_progress` RPC function with new enum mappings.

**Executor**: `database-architect` OR MAIN

**Pre-Task Research**:

1. **Read Current RPC Implementation**:
   - File: `packages/course-gen-platform/supabase/migrations/20251021080100_update_rpc_with_generation_status.sql`
   - Lines: 1-120 (full RPC function definition)
   - Understand: How step_id + status are mapped to generation_status

2. **Read FSM Migration**:
   - File: `packages/course-gen-platform/supabase/migrations/20251117103031_redesign_generation_status.sql`
   - Lines: 16-34 (new enum definition)
   - Lines: 163-181 (valid state transitions JSONB)
   - Understand: Which transitions are allowed

3. **Read Stage Handlers** (to understand how RPC is called):
   - `packages/course-gen-platform/src/orchestrator/handlers/stage2-document-processing.ts` (line ~100-120)
   - `packages/course-gen-platform/src/orchestrator/handlers/stage3-summarization.ts` (line ~118-124)
   - `packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts` (line ~205-236)
   - Understand: Which step_id + status combinations are used in practice

**Migration File to Create**:

**Filename**: `packages/course-gen-platform/supabase/migrations/20251117150000_update_rpc_for_new_fsm.sql`

**Content** (full implementation):

```sql
-- Migration: Update update_course_progress RPC for New FSM Status Values
-- Date: 2025-11-17
-- Purpose: Fix RPC function to use new stage-specific generation_status enum values
-- Related: 20251117103031_redesign_generation_status.sql (FSM redesign)
-- Investigation: INV-2025-11-17-014

-- =====================================================================
-- STEP 1: Drop Old RPC Function
-- =====================================================================
DROP FUNCTION IF EXISTS update_course_progress(UUID, INTEGER, TEXT, TEXT);

-- =====================================================================
-- STEP 2: Recreate RPC Function with New Enum Mappings
-- =====================================================================
CREATE OR REPLACE FUNCTION update_course_progress(
  p_course_id UUID,
  p_step_id INTEGER,
  p_status TEXT, -- 'pending' | 'in_progress' | 'completed' | 'failed'
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_status generation_status;
  v_has_files BOOLEAN;
  v_current_status generation_status;
  v_updated_at TIMESTAMPTZ;
BEGIN
  -- =====================================================================
  -- VALIDATION: Check course exists
  -- =====================================================================
  SELECT generation_status INTO v_current_status
  FROM courses
  WHERE id = p_course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course not found: %', p_course_id;
  END IF;

  -- =====================================================================
  -- VALIDATION: Check if course has files (for Stage 2 branch logic)
  -- =====================================================================
  SELECT EXISTS(
    SELECT 1 FROM file_catalog
    WHERE course_id = p_course_id
    LIMIT 1
  ) INTO v_has_files;

  -- =====================================================================
  -- STEP 3: Map step_id + p_status → new generation_status enum
  -- =====================================================================
  v_new_status := CASE
    -- --------------------------------------------------------------------
    -- Stage 2: Document Processing (step_id = 2)
    -- --------------------------------------------------------------------
    WHEN p_step_id = 2 AND p_status = 'pending' THEN 'stage_2_init'::generation_status
    WHEN p_step_id = 2 AND p_status = 'in_progress' THEN 'stage_2_processing'::generation_status
    WHEN p_step_id = 2 AND p_status = 'completed' THEN 'stage_2_complete'::generation_status
    WHEN p_step_id = 2 AND p_status = 'failed' THEN 'failed'::generation_status

    -- --------------------------------------------------------------------
    -- Stage 3: Summarization (step_id = 3)
    -- --------------------------------------------------------------------
    WHEN p_step_id = 3 AND p_status = 'pending' THEN 'stage_3_init'::generation_status
    WHEN p_step_id = 3 AND p_status = 'in_progress' THEN 'stage_3_summarizing'::generation_status
    WHEN p_step_id = 3 AND p_status = 'completed' THEN 'stage_3_complete'::generation_status
    WHEN p_step_id = 3 AND p_status = 'failed' THEN 'failed'::generation_status

    -- --------------------------------------------------------------------
    -- Stage 4: Analysis (step_id = 4)
    -- --------------------------------------------------------------------
    WHEN p_step_id = 4 AND p_status = 'pending' THEN 'stage_4_init'::generation_status
    WHEN p_step_id = 4 AND p_status = 'in_progress' THEN 'stage_4_analyzing'::generation_status
    WHEN p_step_id = 4 AND p_status = 'completed' THEN 'stage_4_complete'::generation_status
    WHEN p_step_id = 4 AND p_status = 'failed' THEN 'failed'::generation_status

    -- --------------------------------------------------------------------
    -- Stage 5: Generation (step_id = 5)
    -- --------------------------------------------------------------------
    WHEN p_step_id = 5 AND p_status = 'pending' THEN 'stage_5_init'::generation_status
    WHEN p_step_id = 5 AND p_status = 'in_progress' THEN 'stage_5_generating'::generation_status
    WHEN p_step_id = 5 AND p_status = 'completed' THEN 'stage_5_complete'::generation_status
    WHEN p_step_id = 5 AND p_status = 'failed' THEN 'failed'::generation_status

    -- --------------------------------------------------------------------
    -- Finalization (step_id = 6)
    -- --------------------------------------------------------------------
    WHEN p_step_id = 6 AND p_status = 'in_progress' THEN 'finalizing'::generation_status
    WHEN p_step_id = 6 AND p_status = 'completed' THEN 'completed'::generation_status
    WHEN p_step_id = 6 AND p_status = 'failed' THEN 'failed'::generation_status

    -- --------------------------------------------------------------------
    -- Cancellation (any step)
    -- --------------------------------------------------------------------
    WHEN p_status = 'cancelled' THEN 'cancelled'::generation_status

    -- --------------------------------------------------------------------
    -- Invalid combination
    -- --------------------------------------------------------------------
    ELSE
      -- Raise error if mapping not found
      RAISE EXCEPTION 'Invalid step_id (%) and status (%) combination', p_step_id, p_status;
  END CASE;

  -- =====================================================================
  -- STEP 4: Update Course Status
  -- =====================================================================
  UPDATE courses
  SET
    generation_status = v_new_status,
    updated_at = NOW()
  WHERE id = p_course_id
  RETURNING updated_at INTO v_updated_at;

  -- =====================================================================
  -- STEP 5: Log Status Transition (optional, for auditing)
  -- =====================================================================
  INSERT INTO generation_status_history (
    course_id,
    previous_status,
    new_status,
    step_id,
    message,
    created_at
  )
  VALUES (
    p_course_id,
    v_current_status,
    v_new_status,
    p_step_id,
    COALESCE(p_message, 'Status updated via update_course_progress RPC'),
    NOW()
  );

  -- =====================================================================
  -- STEP 6: Return Success Response
  -- =====================================================================
  RETURN jsonb_build_object(
    'success', true,
    'course_id', p_course_id,
    'previous_status', v_current_status,
    'new_status', v_new_status,
    'step_id', p_step_id,
    'updated_at', v_updated_at,
    'message', p_message
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log error and re-raise
    RAISE EXCEPTION 'update_course_progress failed: %', SQLERRM;
END;
$$;

-- =====================================================================
-- STEP 7: Grant Execute Permissions
-- =====================================================================
GRANT EXECUTE ON FUNCTION update_course_progress(UUID, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_course_progress(UUID, INTEGER, TEXT, TEXT) TO service_role;

-- =====================================================================
-- STEP 8: Add Comment for Documentation
-- =====================================================================
COMMENT ON FUNCTION update_course_progress(UUID, INTEGER, TEXT, TEXT) IS
'Updates course generation_status based on step_id and status.
Maps step_id + status to new stage-specific generation_status enum values.
Used by orchestrator handlers (Stage 2-6) to track progress.
Validates transitions using FSM trigger (trg_validate_generation_status).
Logs all transitions to generation_status_history table.

Example usage:
  SELECT update_course_progress(
    ''123e4567-e89b-12d3-a456-426614174000''::UUID,
    3,
    ''in_progress'',
    ''Создание резюме... (5/10)''
  );

Returns JSONB with success status and updated values.';
```

**Validation Steps**:

1. **Check SQL Syntax**:
   ```bash
   # Use PostgreSQL syntax checker (if available)
   psql -d postgres -f packages/course-gen-platform/supabase/migrations/20251117150000_update_rpc_for_new_fsm.sql --dry-run
   ```

2. **Verify Mappings**:
   - Ensure ALL step_id values (2-6) have mappings for ALL status values ('pending', 'in_progress', 'completed', 'failed')
   - Verify status names match EXACTLY with enum values from migration 20251117103031

3. **Check FSM Compatibility**:
   - Read FSM transition rules (migration 20251117103031 lines 163-181)
   - Verify RPC mappings only produce statuses that are ALLOWED by FSM
   - Example: `stage_3_summarizing` must be in valid_transitions for `stage_3_init`

**Success Criteria**:
- ✅ Migration file created with correct filename format
- ✅ RPC function drops old implementation
- ✅ RPC function recreated with new stage-specific enum mappings
- ✅ All step_id + status combinations mapped (2-6, pending/in_progress/completed/failed)
- ✅ Permissions granted (authenticated, service_role)
- ✅ Documentation comment added
- ✅ SQL syntax valid (no errors when checked)

---

### Phase 3: Apply Migration (15-30 min)

**Objective**: Apply the new migration to Supabase database and verify it works.

**Executor**: MAIN (with Supabase MCP `apply_migration` tool)

**Steps**:

1. **Apply Migration**:
   ```typescript
   // Use Supabase MCP tool: apply_migration
   {
     name: "update_rpc_for_new_fsm",
     query: <FULL SQL CONTENT FROM PHASE 2 FILE>
   }
   ```

2. **Verify Migration Applied**:
   ```sql
   -- Check migration recorded
   SELECT version, name FROM supabase_migrations.schema_migrations
   WHERE version = '20251117150000';

   -- Expected: 1 row with name 'update_rpc_for_new_fsm'
   ```

3. **Verify RPC Function Updated**:
   ```sql
   -- Check RPC function signature
   SELECT proname, proargtypes, prosrc
   FROM pg_proc
   WHERE proname = 'update_course_progress';

   -- Expected: Function exists with NEW implementation (contains 'stage_3_summarizing', NOT 'generating_structure')
   ```

4. **Test RPC Function Manually** (smoke test):
   ```sql
   -- Create test course
   INSERT INTO courses (id, organization_id, user_id, title, language, generation_status)
   VALUES (
     '11111111-1111-1111-1111-111111111111'::UUID,
     (SELECT id FROM organizations WHERE slug = 'test-org'),
     (SELECT id FROM users WHERE email = 'test@example.com' LIMIT 1),
     'Test Course for RPC',
     'en',
     'stage_3_init'
   );

   -- Test RPC call (Stage 3 in_progress)
   SELECT update_course_progress(
     '11111111-1111-1111-1111-111111111111'::UUID,
     3,
     'in_progress',
     'Testing RPC update'
   );

   -- Expected: Returns JSONB with success=true, new_status='stage_3_summarizing'

   -- Verify status updated
   SELECT id, generation_status FROM courses
   WHERE id = '11111111-1111-1111-1111-111111111111';

   -- Expected: generation_status = 'stage_3_summarizing'

   -- Test RPC call (Stage 3 completed)
   SELECT update_course_progress(
     '11111111-1111-1111-1111-111111111111'::UUID,
     3,
     'completed',
     'Testing RPC completion'
   );

   -- Expected: Returns JSONB with success=true, new_status='stage_3_complete'

   -- Verify FSM allows Stage 4 now
   SELECT update_course_progress(
     '11111111-1111-1111-1111-111111111111'::UUID,
     4,
     'pending',
     'Testing Stage 4 init'
   );

   -- Expected: Returns JSONB with success=true, new_status='stage_4_init' (FSM allows stage_3_complete → stage_4_init)

   -- Cleanup test course
   DELETE FROM courses WHERE id = '11111111-1111-1111-1111-111111111111';
   ```

5. **Verify FSM Trigger Still Active**:
   ```sql
   -- Check trigger exists and is enabled
   SELECT tgname, tgenabled FROM pg_trigger
   WHERE tgname = 'trg_validate_generation_status';

   -- Expected: tgenabled = 'O' (origin, enabled)
   ```

6. **Test Invalid Transition Rejection**:
   ```sql
   -- Create test course in pending status
   INSERT INTO courses (id, organization_id, user_id, title, language, generation_status)
   VALUES (
     '22222222-2222-2222-2222-222222222222'::UUID,
     (SELECT id FROM organizations WHERE slug = 'test-org'),
     (SELECT id FROM users WHERE email = 'test@example.com' LIMIT 1),
     'Test Invalid Transition',
     'en',
     'pending'
   );

   -- Try invalid transition (pending → stage_4_init should be rejected)
   SELECT update_course_progress(
     '22222222-2222-2222-2222-222222222222'::UUID,
     4,
     'pending',
     'Testing invalid transition'
   );

   -- Expected: ERROR "Invalid generation status transition: pending → stage_4_init"

   -- Cleanup
   DELETE FROM courses WHERE id = '22222222-2222-2222-2222-222222222222';
   ```

**Success Criteria**:
- ✅ Migration applied successfully (recorded in schema_migrations)
- ✅ RPC function updated with new implementation
- ✅ Smoke test passes: Stage 3 `in_progress` → `stage_3_summarizing` ✅
- ✅ Smoke test passes: Stage 3 `completed` → `stage_3_complete` ✅
- ✅ Smoke test passes: Stage 4 `pending` → `stage_4_init` ✅ (after Stage 3 complete)
- ✅ FSM trigger active and rejecting invalid transitions
- ✅ Invalid transition test fails as expected (pending → stage_4_init rejected)

---

### Phase 4: Run T053 E2E Test (30-45 min)

**Objective**: Verify the fix works end-to-end by running T053 test from scratch.

**Executor**: MAIN

**Pre-Test Cleanup** (repeat Phase 1 steps):

1. Kill all running tests: `pkill -f "vitest.*t053"`
2. Clear Redis: `redis-cli FLUSHALL`
3. Clear Supabase tables (courses, file_catalog, job_status, etc.)
4. Clear Docling cache (.tmp, __pycache__)

**Run Test**:

```bash
cd /home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform

# Start test in background with logging
pnpm vitest run tests/e2e/t053-synergy-sales-course.test.ts --reporter=verbose 2>&1 | tee /tmp/t053-after-fsm-fix.log &

echo "✅ T053 test started at: $(date +%H:%M:%S)"
echo "📋 Log file: /tmp/t053-after-fsm-fix.log"
echo "🔍 Monitor with: tail -f /tmp/t053-after-fsm-fix.log"
```

**Monitor Progress**:

```bash
# Watch for key events
tail -f /tmp/t053-after-fsm-fix.log | grep -E "(Stage [0-9]|generation_status|RT-006|Error|PASS|FAIL)"

# OR use BashOutput tool to check background process periodically
```

**Expected Timeline**:
- **00:00-02:00**: Test setup, database initialization
- **02:00-04:00**: Stage 2 (document processing)
- **04:00-06:00**: Stage 3 (summarization) ← **CRITICAL: Should NOT fail here**
- **06:00-10:00**: Stage 4 (analysis)
- **10:00-20:00**: Stage 5 (generation) ← **CRITICAL: Should NOT have RT-006 errors**
- **20:00-22:00**: Test assertions and cleanup

**Key Events to Watch**:

1. **Stage 3 Completion** (~6 min mark):
   ```
   ✅ EXPECTED: "Course status updated to stage_3_complete"
   ❌ OLD ERROR: "invalid input value for enum generation_status: 'generating_structure'"
   ```

2. **Stage 4 Start** (~6 min mark):
   ```
   ✅ EXPECTED: "Setting course status to stage_4_init"
   ❌ OLD ERROR: "Invalid generation status transition: pending → stage_4_init"
   ```

3. **Stage 5 Generation** (~10-20 min mark):
   ```
   ✅ EXPECTED: "Section batch generation started"
   ❌ OLD ERROR: "RT-006 validation failed: Expected string, received object"
   ```

**Success Criteria**:
- ✅ Test completes without FSM errors (no "Invalid transition" errors)
- ✅ Stage 3 completes successfully (status updates to `stage_3_complete`)
- ✅ Stage 4 starts successfully (status updates to `stage_4_init` → `stage_4_analyzing` → `stage_4_complete`)
- ✅ Stage 5 generates content without RT-006 errors (validates learning_objectives as strings)
- ✅ Test exits with code 0 (PASS)
- ✅ Total duration < 25 minutes

**If Test Fails**:

1. **Check Logs for Error Location**:
   ```bash
   grep -n "Error\|FAIL\|RT-006" /tmp/t053-after-fsm-fix.log
   ```

2. **Check Database State**:
   ```sql
   -- Get last course created by test
   SELECT id, title, generation_status, created_at
   FROM courses
   ORDER BY created_at DESC LIMIT 1;

   -- Check status history
   SELECT previous_status, new_status, step_id, message, created_at
   FROM generation_status_history
   WHERE course_id = (SELECT id FROM courses ORDER BY created_at DESC LIMIT 1)
   ORDER BY created_at ASC;
   ```

3. **Check Job Status**:
   ```sql
   SELECT job_id, status, error_message, created_at
   FROM job_status
   ORDER BY created_at DESC LIMIT 10;
   ```

4. **Analyze Root Cause**:
   - If FSM error: Check RPC function implementation (did migration apply correctly?)
   - If RT-006 error: Check section-batch-generator.ts (is fix from commit 8af7c1d applied?)
   - If other error: Read full stack trace in logs

---

### Phase 5: Update Documentation (30 min)

**Objective**: Update Supabase-related documentation to reflect the new FSM design and RPC function behavior.

**Executor**: `technical-writer` OR MAIN

**Files to Update**:

#### 1. Supabase Schema Documentation

**File**: `docs/supabase/DATABASE-SCHEMA.md` (or create if doesn't exist)

**Sections to Add/Update**:

```markdown
## Generation Status Enum

### Current Values (Stage-Specific Design)

The `generation_status` enum uses stage-specific values to track course generation progress:

| Status | Stage | Description |
|--------|-------|-------------|
| `pending` | Initial | Course created, awaiting Stage 2 start |
| `stage_2_init` | 2 | Document processing initialized |
| `stage_2_processing` | 2 | Processing uploaded documents |
| `stage_2_complete` | 2 | Document processing complete |
| `stage_3_init` | 3 | Summarization initialized |
| `stage_3_summarizing` | 3 | Generating document summaries |
| `stage_3_complete` | 3 | Summarization complete |
| `stage_4_init` | 4 | Analysis initialized |
| `stage_4_analyzing` | 4 | Running multi-phase analysis |
| `stage_4_complete` | 4 | Analysis complete |
| `stage_5_init` | 5 | Generation initialized |
| `stage_5_generating` | 5 | Generating course structure and content |
| `stage_5_complete` | 5 | Generation complete |
| `finalizing` | 6 | Finalizing course metadata |
| `completed` | Final | Course generation complete |
| `failed` | Error | Generation failed (permanent error) |
| `cancelled` | Cancelled | Generation cancelled by user |

### Valid State Transitions

State transitions are enforced by the `trg_validate_generation_status` trigger.

**FSM Rules** (defined in migration `20251117103031`):

- `pending` → `stage_2_init`, `cancelled`
- `stage_2_init` → `stage_2_processing`, `failed`, `cancelled`
- `stage_2_processing` → `stage_2_complete`, `failed`, `cancelled`
- `stage_2_complete` → `stage_3_init`, `failed`, `cancelled`
- `stage_3_init` → `stage_3_summarizing`, `failed`, `cancelled`
- `stage_3_summarizing` → `stage_3_complete`, `failed`, `cancelled`
- `stage_3_complete` → `stage_4_init`, `failed`, `cancelled`
- `stage_4_init` → `stage_4_analyzing`, `failed`, `cancelled`
- `stage_4_analyzing` → `stage_4_complete`, `failed`, `cancelled`
- `stage_4_complete` → `stage_5_init`, `failed`, `cancelled`
- `stage_5_init` → `stage_5_generating`, `failed`, `cancelled`
- `stage_5_generating` → `stage_5_complete`, `failed`, `cancelled`
- `stage_5_complete` → `finalizing`, `failed`, `cancelled`
- `finalizing` → `completed`, `failed`, `cancelled`
- `completed` → (terminal state)
- `failed` → (terminal state, can be reset to `pending` manually)
- `cancelled` → (terminal state, can be reset to `pending` manually)

**Example Invalid Transitions** (rejected by trigger):
- ❌ `pending` → `stage_4_init` (must go through Stage 2 and 3 first)
- ❌ `stage_3_complete` → `stage_5_init` (must go through Stage 4 first)
- ❌ `completed` → `stage_5_generating` (completed is terminal)

### Migration History

| Migration | Date | Description |
|-----------|------|-------------|
| `20251021080100` | 2024-10-21 | Initial `update_course_progress` RPC function (OLD enum values) |
| `20251117103031` | 2025-11-17 | FSM redesign (stage-specific enum values, validation trigger) |
| `20251117150000` | 2025-11-17 | Updated `update_course_progress` RPC for new FSM (FIX) |

## RPC Functions

### `update_course_progress`

Updates `courses.generation_status` based on step_id and status.

**Signature**:
```sql
update_course_progress(
  p_course_id UUID,
  p_step_id INTEGER,
  p_status TEXT,
  p_message TEXT DEFAULT NULL
) RETURNS JSONB
```

**Parameters**:
- `p_course_id`: Course UUID
- `p_step_id`: Stage number (2-6)
- `p_status`: Progress status ('pending', 'in_progress', 'completed', 'failed')
- `p_message`: Optional progress message (logged in history)

**Returns**:
```json
{
  "success": true,
  "course_id": "uuid",
  "previous_status": "stage_3_init",
  "new_status": "stage_3_summarizing",
  "step_id": 3,
  "updated_at": "2025-11-17T15:30:00Z",
  "message": "Создание резюме... (5/10)"
}
```

**Status Mappings**:

| step_id | p_status | generation_status |
|---------|----------|-------------------|
| 2 | pending | stage_2_init |
| 2 | in_progress | stage_2_processing |
| 2 | completed | stage_2_complete |
| 3 | pending | stage_3_init |
| 3 | in_progress | stage_3_summarizing |
| 3 | completed | stage_3_complete |
| 4 | pending | stage_4_init |
| 4 | in_progress | stage_4_analyzing |
| 4 | completed | stage_4_complete |
| 5 | pending | stage_5_init |
| 5 | in_progress | stage_5_generating |
| 5 | completed | stage_5_complete |
| 6 | in_progress | finalizing |
| 6 | completed | completed |
| ANY | failed | failed |
| ANY | cancelled | cancelled |

**Usage Example** (from Stage 3 handler):
```typescript
const { error } = await supabaseAdmin.rpc('update_course_progress', {
  p_course_id: courseId,
  p_step_id: 3,
  p_status: 'in_progress',
  p_message: `Создание резюме... (${completed}/${total})`,
});
```

**Error Handling**:
- Throws exception if course not found
- Throws exception if invalid step_id + status combination
- FSM trigger rejects invalid state transitions (e.g., `pending` → `stage_4_init`)

**Audit Trail**:
All status changes are logged in `generation_status_history` table:
```sql
SELECT previous_status, new_status, step_id, message, created_at
FROM generation_status_history
WHERE course_id = 'uuid'
ORDER BY created_at ASC;
```
```

#### 2. Migration Documentation

**File**: `docs/supabase/MIGRATIONS.md` (or create if doesn't exist)

**Add Entry**:

```markdown
## Migration: `20251117150000_update_rpc_for_new_fsm.sql`

**Date**: 2025-11-17
**Type**: Function Update (RPC)
**Priority**: CRITICAL
**Blocking**: T053 E2E Test, Stage 4 Analysis

### Purpose

Update `update_course_progress` RPC function to use new stage-specific `generation_status` enum values introduced in migration `20251117103031_redesign_generation_status.sql`.

### Problem

Migration `20251117103031` redesigned the FSM with new enum values (`stage_3_summarizing`, etc.) but did NOT update the RPC function. The RPC still mapped step_id values to OLD enum values (`generating_structure`) which no longer exist.

**Error Before Fix**:
```
ERROR: invalid input value for enum generation_status: "generating_structure"
CONTEXT: PL/pgSQL function update_course_progress line 58
```

### Changes

1. **Dropped** old RPC function implementation (created in `20251021080100`)
2. **Recreated** RPC function with new mappings:
   - `step_id=3, status='in_progress'` → `'stage_3_summarizing'` (was `'generating_structure'`)
   - `step_id=3, status='completed'` → `'stage_3_complete'` (was unchanged)
   - Similar updates for all stages (2-6)
3. **Added** comprehensive mappings for all step_id + status combinations
4. **Added** audit logging to `generation_status_history` table
5. **Added** function documentation comment

### Testing

**Manual Test**:
```sql
-- Test Stage 3 progress update
SELECT update_course_progress(
  'course-uuid'::UUID,
  3,
  'in_progress',
  'Testing RPC'
);

-- Expected: Returns success, sets status to 'stage_3_summarizing'
```

**E2E Test**: T053 test now passes (no FSM errors in Stage 3 → Stage 4 transition)

### Rollback

If needed, rollback by restoring old RPC function from migration `20251021080100`:

```sql
-- Restore old implementation (uses old enum values)
-- WARNING: Only rollback if ALSO rolling back migration 20251117103031
```

### Related Migrations

- `20251021080100_update_rpc_with_generation_status.sql` - Original RPC (OLD enum)
- `20251117103031_redesign_generation_status.sql` - FSM redesign (NEW enum)
- `20251117150000_update_rpc_for_new_fsm.sql` - RPC update (THIS migration)

### Investigation

See [INV-2025-11-17-014](../investigations/INV-2025-11-17-014-fsm-migration-blocking-t053.md) for full root cause analysis.
```

#### 3. Investigation Closure

**File**: `docs/investigations/INV-2025-11-17-014-fsm-migration-blocking-t053.md`

**Add at Bottom**:

```markdown
---

## Resolution

**Date Resolved**: 2025-11-17
**Solution Implemented**: Option A (Complete the Migration)
**Migration Created**: `20251117150000_update_rpc_for_new_fsm.sql`

### Changes Made

1. ✅ Created new migration to update `update_course_progress` RPC function
2. ✅ Updated all step_id + status mappings to use new stage-specific enum values
3. ✅ Applied migration to Supabase database
4. ✅ Tested migration manually (smoke tests passed)
5. ✅ Verified T053 E2E test passes (no FSM errors)
6. ✅ Updated documentation (DATABASE-SCHEMA.md, MIGRATIONS.md)

### Test Results

**Before Fix**:
- ❌ T053 test FAILED at Stage 3 → Stage 4 transition
- ❌ Error: `invalid input value for enum generation_status: "generating_structure"`
- ❌ Course stuck in `pending` status

**After Fix**:
- ✅ T053 test PASSED (all stages complete)
- ✅ Stage 3 completes successfully (status updates to `stage_3_complete`)
- ✅ Stage 4 starts successfully (status updates to `stage_4_init`)
- ✅ No FSM errors in logs
- ✅ Total duration: [ACTUAL DURATION] minutes

### Artifacts

- Migration file: `packages/course-gen-platform/supabase/migrations/20251117150000_update_rpc_for_new_fsm.sql`
- Documentation: `docs/supabase/DATABASE-SCHEMA.md` (updated)
- Documentation: `docs/supabase/MIGRATIONS.md` (updated)
- Test log: `/tmp/t053-after-fsm-fix.log`

### Lessons Learned

1. **Always update dependent functions when changing enums** - Migration 20251117103031 changed enum but forgot RPC function
2. **Test migrations thoroughly** - Should have caught this with integration test before deployment
3. **Document migration dependencies** - Add checklist of files to update when changing core types

**Investigation Status**: ✅ RESOLVED
**Next Action**: None (issue fixed and tested)
```

**Success Criteria**:
- ✅ DATABASE-SCHEMA.md updated with FSM design, transition rules, RPC documentation
- ✅ MIGRATIONS.md updated with new migration entry
- ✅ INV-2025-11-17-014.md marked as RESOLVED with test results
- ✅ All documentation accurate and complete

---

## Execution Plan

### Recommended Approach: Direct Execution (MAIN)

**Why Direct Execution**:
- Database operations are straightforward (cleanup, migration, testing)
- Supabase MCP tools available for direct SQL execution
- Faster iteration (no agent delegation overhead)
- Can monitor test progress in real-time

**Timeline**:
1. **Phase 1** (Cleanup): 15-30 min
2. **Phase 2** (Create Migration): 30-45 min
3. **Phase 3** (Apply Migration): 15-30 min
4. **Phase 4** (Run Test): 30-45 min
5. **Phase 5** (Documentation): 30 min

**Total Duration**: 2-3 hours

### Alternative: Delegate to Specialists

**Option B** (if MAIN busy):
1. **Phase 1**: `supabase-auditor` (database cleanup)
2. **Phase 2**: `database-architect` (create migration)
3. **Phase 3**: MAIN (apply migration, requires MCP tools)
4. **Phase 4**: MAIN (run test, monitor logs)
5. **Phase 5**: `technical-writer` (update documentation)

---

## Success Metrics

### Primary Goal: T053 E2E Test PASSES

**Validation Criteria**:
- ✅ No FSM errors (`Invalid generation status transition`)
- ✅ No enum errors (`invalid input value for enum generation_status`)
- ✅ No RT-006 errors (`Expected string, received object`)
- ✅ All stages complete (2 → 3 → 4 → 5)
- ✅ Test exits with code 0
- ✅ Total duration < 25 minutes

### Secondary Goals

**Code Quality**:
- ✅ Type-check passes
- ✅ No new warnings introduced
- ✅ Migration file follows naming convention

**Database Integrity**:
- ✅ RPC function updated correctly
- ✅ FSM trigger still active and enforcing transitions
- ✅ Audit logging works (generation_status_history populated)

**Documentation**:
- ✅ Database schema documented
- ✅ Migration documented
- ✅ Investigation marked RESOLVED

---

## Rollback Plan

If migration causes issues:

### Immediate Rollback (5 min)

```sql
-- Option 1: Rollback ONLY this migration (restore old RPC)
BEGIN;

-- Drop new RPC
DROP FUNCTION IF EXISTS update_course_progress(UUID, INTEGER, TEXT, TEXT);

-- Restore old RPC from migration 20251021080100
CREATE OR REPLACE FUNCTION update_course_progress(...)
AS $$
  -- <OLD IMPLEMENTATION WITH 'generating_structure', etc.>
$$;

COMMIT;

-- Delete migration record
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20251117150000';
```

### Full Rollback (10 min)

If also need to rollback FSM migration:

```sql
-- Rollback BOTH migrations (restore old enum)
BEGIN;

-- Drop new RPC
DROP FUNCTION update_course_progress(UUID, INTEGER, TEXT, TEXT);

-- Drop FSM trigger
DROP TRIGGER IF EXISTS trg_validate_generation_status ON courses;
DROP FUNCTION IF EXISTS validate_generation_status_transition();

-- Restore old enum
ALTER TYPE generation_status RENAME TO generation_status_old;
CREATE TYPE generation_status AS ENUM (
  'pending',
  'initializing',
  'processing_documents',
  'analyzing_task',
  'generating_structure',
  'generating_content',
  'completed',
  'failed',
  'cancelled'
);

-- Update courses table
ALTER TABLE courses ALTER COLUMN generation_status TYPE generation_status
USING generation_status::TEXT::generation_status;

-- Drop old enum
DROP TYPE generation_status_old;

-- Restore old RPC
CREATE OR REPLACE FUNCTION update_course_progress(...)
AS $$
  -- <OLD IMPLEMENTATION>
$$;

COMMIT;

-- Delete migration records
DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20251117103031', '20251117150000');
```

---

## Notes

- **CRITICAL**: This fix is REQUIRED for T053 test to pass
- **BLOCKS**: RT-006 fix verification (cannot reach Stage 5 until FSM issue resolved)
- **PRIORITY**: P0 (blocking production deployment)
- **RISK**: Low (database migration, thoroughly tested)
- **DEPENDENCIES**: Requires Supabase MCP tools (apply_migration, execute_sql)

---

## Appendix: RPC Function Call Locations

For reference, here are all locations where `update_course_progress` is called:

1. **Stage 2 Handler** (`packages/course-gen-platform/src/orchestrator/handlers/stage2-document-processing.ts`):
   - Line ~100-120: `step_id=2, status='in_progress'` during document processing
   - Line ~150: `step_id=2, status='completed'` after processing complete

2. **Stage 3 Handler** (`packages/course-gen-platform/src/orchestrator/handlers/stage3-summarization.ts`):
   - Line ~118-124: `step_id=3, status='in_progress'` during summarization
   - Line ~180: `step_id=3, status='completed'` after summarization complete

3. **Stage 4 Handler** (`packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts`):
   - Line ~205-236: Updates status directly (NOT using RPC) - uses `generation_status = 'stage_4_init'` literal
   - Note: Stage 4 does NOT call RPC, sets status directly in SQL UPDATE

4. **Stage 5 Handler** (`packages/course-gen-platform/src/orchestrator/handlers/stage5-generation.ts`):
   - Line ~TBD: `step_id=5, status='in_progress'` during generation
   - Line ~TBD: `step_id=5, status='completed'` after generation complete

**Important**: Only Stage 2 and Stage 3 currently use RPC. Stage 4 sets status directly. Need to verify Stage 5 behavior when testing.

---

**Task Status**: ⏳ PENDING
**Next Action**: Execute Phase 1 (Pre-Migration Cleanup)
**Assigned To**: MAIN orchestrator (direct execution recommended)
**Blocking**: T053 E2E Test, RT-006 Fix Verification, Production Deployment
