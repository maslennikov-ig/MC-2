-- ============================================================================
-- Migration: Add generation_status guard to initialize_fsm_with_outbox
-- Purpose: Prevent race condition where concurrent requests both pass
--          application-level guard and create duplicate FSM_INITIALIZED events.
-- Date: 2026-03-19
-- Issue: mc2-mqi66
-- ============================================================================
--
-- Changes:
--   1. Add WHERE clause guard: only allow FSM init when generation_status
--      is NULL (new course) or in terminal/initial states
--   2. Distinguish "course not found" from "already in progress" errors
--
-- Race condition scenario (before this fix):
--   Request A: SELECT course (status=NULL) → pass guard → ... slow work ...
--   Request B: SELECT course (status=NULL) → pass guard → ... slow work ...
--   Request A: RPC init (overwrites to stage_2_init) ← succeeds
--   Request B: RPC init (overwrites to stage_2_init) ← ALSO succeeds (BAD!)
--
-- After this fix:
--   Request A: RPC UPDATE WHERE status IS NULL → succeeds, sets stage_2_init
--   Request B: RPC UPDATE WHERE status IS NULL → NOT FOUND (stage_2_init ≠ NULL)
--              → raises 'Course generation already in progress'
--
-- ============================================================================

-- Must DROP first because we're replacing the function body
DROP FUNCTION IF EXISTS initialize_fsm_with_outbox(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB);
DROP FUNCTION IF EXISTS initialize_fsm_with_outbox(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT);

CREATE OR REPLACE FUNCTION initialize_fsm_with_outbox(
  p_entity_id UUID,
  p_user_id UUID,
  p_organization_id UUID,
  p_idempotency_key TEXT,
  p_initiated_by TEXT,
  p_initial_state TEXT,
  p_job_data JSONB,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_target_queue TEXT DEFAULT 'course-generation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_course_record RECORD;
  v_outbox_entries JSONB := '[]'::jsonb;
  v_existing_idempotency RECORD;
  v_job JSONB;
  v_outbox_id UUID;
  v_state_version INT := 1;
  v_created_by VARCHAR(20);
BEGIN
  -- Step 0: Validate and normalize p_initiated_by
  v_created_by := CASE
    WHEN p_initiated_by IN ('API', 'QUEUE', 'WORKER') THEN p_initiated_by
    WHEN p_initiated_by IN ('TEST', 'ADMIN') THEN 'API'
    ELSE 'API'
  END;

  -- Step 1: Idempotency Check (Database-Level)
  SELECT * INTO v_existing_idempotency
  FROM idempotency_keys
  WHERE key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_existing_idempotency.result;
  END IF;

  -- Step 2: Update FSM State with generation_status guard
  -- Only allow initialization from terminal/initial states.
  -- This is the DB-level race condition protection.
  UPDATE courses
  SET
    generation_status = p_initial_state::generation_status,
    updated_at = NOW()
  WHERE id = p_entity_id
    AND (generation_status IS NULL
         OR generation_status IN ('pending', 'completed', 'failed', 'cancelled'))
  RETURNING * INTO v_course_record;

  IF NOT FOUND THEN
    -- Distinguish: course doesn't exist vs already in progress
    PERFORM 1 FROM courses WHERE id = p_entity_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Course generation already in progress for course %', p_entity_id
        USING ERRCODE = '23505'; -- unique_violation code, maps to CONFLICT
    ELSE
      RAISE EXCEPTION 'Course not found: %', p_entity_id;
    END IF;
  END IF;

  -- Step 3: Record FSM Event (Audit Trail)
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
      'target_queue', p_target_queue
    ),
    v_created_by,
    p_user_id
  );

  -- Step 4: Create Job Outbox Entries
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

  -- Step 5: Store Idempotency Key
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

  -- Step 6: Return Result
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

GRANT EXECUTE ON FUNCTION initialize_fsm_with_outbox TO service_role;
GRANT EXECUTE ON FUNCTION initialize_fsm_with_outbox TO authenticated;

COMMENT ON FUNCTION initialize_fsm_with_outbox IS 'Atomic FSM initialization with transactional outbox pattern and DB-level race condition guard. Only allows init from NULL/pending/completed/failed/cancelled states. Uses ERRCODE 23505 for "already in progress" to enable CONFLICT handling in application layer.';
