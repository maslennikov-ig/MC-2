-- ============================================================================
-- Migration: Fix generation_progress When Stages Are Skipped
-- Purpose: Update generation_progress.current_step when initial_state skips stages
-- Date: 2026-01-28
-- Issue: mc2-r7mi
-- ============================================================================
--
-- Problem:
--   When all documents are cached (deduplicated), lifecycle.router.ts calls
--   initialize_fsm_with_outbox with initial_state='stage_3_init', skipping Stage 2.
--   However, generation_progress was NOT updated, causing UI to show Stage 2
--   as "in progress" with 0% even when all docs are already indexed.
--
-- Solution:
--   Modify initialize_fsm_with_outbox to also update generation_progress based on
--   p_initial_state value:
--   - stage_3_init: Mark step 1 (Stage 2) as completed, set current_step=3
--   - stage_4_init: Mark steps 1,2 (Stage 2,3) as completed, set current_step=4
--
-- Generation Progress JSONB Structure:
--   {
--     "current_step": 4,
--     "steps": [
--       {"id": 1, "name": "...", "status": "completed"},  // Stage 1 - Launch
--       {"id": 2, "name": "...", "status": "completed"},  // Stage 2 - Document Processing
--       {"id": 3, "name": "...", "status": "pending"},    // Stage 3 - Classification
--       {"id": 4, "name": "...", "status": "in_progress"},// Stage 4 - Analysis
--       {"id": 5, "name": "...", "status": "pending"}     // Stage 5+ - Generation
--     ]
--   }
--
-- Backward Compatibility:
--   - No parameter changes, maintains existing signature
--   - Only affects courses where p_initial_state skips stages
--   - Uses COALESCE to handle null generation_progress
--
-- ============================================================================

-- ============================================================================
-- Step 1: Drop Existing Function
-- ============================================================================
-- Required because we're modifying the function body
DROP FUNCTION IF EXISTS initialize_fsm_with_outbox(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT);

-- ============================================================================
-- Step 2: Create Updated Function with generation_progress Fix
-- ============================================================================
CREATE OR REPLACE FUNCTION initialize_fsm_with_outbox(
  -- Entity identifiers
  p_entity_id UUID,
  p_user_id UUID,
  p_organization_id UUID,

  -- Idempotency
  p_idempotency_key TEXT,

  -- FSM metadata
  p_initiated_by TEXT,
  p_initial_state TEXT,

  -- Job data: [{ queue, data, options }, ...]
  p_job_data JSONB,

  -- Optional metadata for audit trail
  p_metadata JSONB DEFAULT '{}'::jsonb,

  -- Target queue for environment isolation
  p_target_queue TEXT DEFAULT 'course-generation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Course record after FSM state update
  v_course_record RECORD;

  -- Outbox entries created (accumulated)
  v_outbox_entries JSONB := '[]'::jsonb;

  -- Existing idempotency check
  v_existing_idempotency RECORD;

  -- Loop variables
  v_job JSONB;
  v_outbox_id UUID;

  -- FSM state version (simulated, since courses table doesn't have version column)
  v_state_version INT := 1;

  -- Validated created_by value (must be API, QUEUE, or WORKER)
  v_created_by VARCHAR(20);

  -- NEW: Updated generation_progress based on initial_state
  v_updated_progress JSONB;
BEGIN
  -- ============================================================================
  -- Step 0: Validate and normalize p_initiated_by
  -- ============================================================================
  v_created_by := CASE
    WHEN p_initiated_by IN ('API', 'QUEUE', 'WORKER') THEN p_initiated_by
    WHEN p_initiated_by IN ('TEST', 'ADMIN') THEN 'API'
    ELSE 'API'
  END;

  -- ============================================================================
  -- Step 1: Idempotency Check (Database-Level)
  -- ============================================================================
  SELECT * INTO v_existing_idempotency
  FROM idempotency_keys
  WHERE key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_existing_idempotency.result;
  END IF;

  -- ============================================================================
  -- Step 2: Update FSM State in courses Table
  -- ============================================================================
  -- NEW: Also update generation_progress when stages are skipped
  --
  -- When p_initial_state = 'stage_3_init':
  --   - Stage 2 was skipped (all documents deduplicated)
  --   - Mark step index 1 (id=2, "Stage 2") as completed
  --   - Set current_step = 3
  --
  -- When p_initial_state = 'stage_4_init':
  --   - Stages 2 and 3 were skipped (no documents at all)
  --   - Mark step indexes 1,2 (Stage 2, Stage 3) as completed
  --   - Set current_step = 4
  --
  -- Step array indexes (0-based):
  --   0: Stage 1 - Launch (id=1)
  --   1: Stage 2 - Document Processing (id=2)
  --   2: Stage 3 - Classification (id=3)
  --   3: Stage 4 - Analysis (id=4)
  --   4: Stage 5+ - Generation (id=5)

  UPDATE courses
  SET
    generation_status = p_initial_state::generation_status,
    updated_at = NOW(),
    -- NEW: Update generation_progress based on skipped stages
    generation_progress = CASE
      -- Stage 3 init: Stage 2 was skipped (documents deduplicated)
      WHEN p_initial_state = 'stage_3_init' AND generation_progress IS NOT NULL THEN
        jsonb_set(
          jsonb_set(
            generation_progress,
            '{current_step}',
            '3'::jsonb
          ),
          '{steps,1,status}',
          '"completed"'::jsonb
        )
      -- Stage 4 init: Stages 2 and 3 were skipped (no documents)
      WHEN p_initial_state = 'stage_4_init' AND generation_progress IS NOT NULL THEN
        jsonb_set(
          jsonb_set(
            jsonb_set(
              generation_progress,
              '{current_step}',
              '4'::jsonb
            ),
            '{steps,1,status}',
            '"completed"'::jsonb
          ),
          '{steps,2,status}',
          '"completed"'::jsonb
        )
      -- Default: Keep existing generation_progress (normal flow or null)
      ELSE generation_progress
    END
  WHERE id = p_entity_id
  RETURNING * INTO v_course_record;

  -- Error handling: Course must exist
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course not found: %', p_entity_id;
  END IF;

  -- ============================================================================
  -- Step 3: Record FSM Event (Audit Trail)
  -- ============================================================================
  INSERT INTO fsm_events (
    entity_id,
    event_type,
    event_data,
    created_by,
    user_id
  ) VALUES (
    p_entity_id,
    'FSM_INITIALIZED',
    jsonb_build_object(
      'initial_state', p_initial_state,
      'initiated_by', p_initiated_by,
      'metadata', p_metadata,
      'idempotency_key', p_idempotency_key,
      'target_queue', p_target_queue,
      'stages_skipped', CASE
        WHEN p_initial_state = 'stage_3_init' THEN ARRAY['stage_2']
        WHEN p_initial_state = 'stage_4_init' THEN ARRAY['stage_2', 'stage_3']
        ELSE ARRAY[]::TEXT[]
      END
    ),
    v_created_by,
    p_user_id
  );

  -- ============================================================================
  -- Step 4: Create Job Outbox Entries (Transactional Queue)
  -- ============================================================================
  FOR v_job IN SELECT * FROM jsonb_array_elements(p_job_data)
  LOOP
    INSERT INTO job_outbox (
      entity_id,
      queue_name,
      job_data,
      job_options,
      target_queue
    ) VALUES (
      p_entity_id,
      v_job->>'queue',
      v_job->'data',
      COALESCE(v_job->'options', '{}'::jsonb),
      p_target_queue
    ) RETURNING outbox_id INTO v_outbox_id;

    v_outbox_entries := v_outbox_entries || jsonb_build_object(
      'outbox_id', v_outbox_id,
      'queue_name', v_job->>'queue',
      'entity_id', p_entity_id,
      'job_data', v_job->'data',
      'job_options', COALESCE(v_job->'options', '{}'::jsonb),
      'target_queue', p_target_queue,
      'processed_at', NULL::timestamptz,
      'created_at', NOW()
    );
  END LOOP;

  -- ============================================================================
  -- Step 5: Store Idempotency Key (Database-Level Cache)
  -- ============================================================================
  INSERT INTO idempotency_keys (
    key,
    result,
    entity_id,
    expires_at
  ) VALUES (
    p_idempotency_key,
    jsonb_build_object(
      'fsmState', jsonb_build_object(
        'entity_id', p_entity_id,
        'state', p_initial_state,
        'version', v_state_version,
        'created_by', p_user_id,
        'created_at', v_course_record.created_at
      ),
      'outboxEntries', v_outbox_entries,
      'target_queue', p_target_queue
    ),
    p_entity_id,
    NOW() + INTERVAL '48 hours'
  );

  -- ============================================================================
  -- Step 6: Return Result (TypeScript InitializeFSMResult Interface)
  -- ============================================================================
  RETURN jsonb_build_object(
    'fsmState', jsonb_build_object(
      'entity_id', p_entity_id,
      'state', p_initial_state,
      'version', v_state_version,
      'created_by', p_user_id,
      'created_at', v_course_record.created_at
    ),
    'outboxEntries', v_outbox_entries,
    'target_queue', p_target_queue
  );
END;
$$;

-- ============================================================================
-- Step 3: Permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION initialize_fsm_with_outbox TO service_role;
GRANT EXECUTE ON FUNCTION initialize_fsm_with_outbox TO authenticated;

-- ============================================================================
-- Step 4: Documentation
-- ============================================================================
COMMENT ON FUNCTION initialize_fsm_with_outbox IS 'Atomic FSM initialization with transactional outbox pattern. Eliminates race conditions by creating FSM state + outbox entries in single PostgreSQL COMMIT. Supports idempotency via database-level cache. NEW (2026-01-28): Updates generation_progress.current_step when stages are skipped (stage_3_init skips Stage 2, stage_4_init skips Stages 2+3).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Changes from previous version:
--   1. Added generation_progress update in UPDATE courses SET clause
--   2. When stage_3_init: sets current_step=3, marks steps[1].status='completed'
--   3. When stage_4_init: sets current_step=4, marks steps[1,2].status='completed'
--   4. Added 'stages_skipped' to FSM event audit trail
--   5. Uses COALESCE-style null check (generation_progress IS NOT NULL)
--
-- Backward Compatibility:
--   - Same function signature (no new parameters)
--   - Only affects courses where initial_state skips stages
--   - Existing callers continue working unchanged
--
