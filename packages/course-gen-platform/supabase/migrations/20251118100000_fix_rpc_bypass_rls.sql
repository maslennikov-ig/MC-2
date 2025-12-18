-- ============================================================================
-- Fix initialize_fsm_with_outbox RPC to Bypass RLS
-- Date: 2025-11-18
-- Issue: RPC function is blocked by RLS policies even with SECURITY DEFINER
-- Solution: Add SET row_security = off to bypass RLS for postgres-owned function
-- Investigation: TASK-2025-11-18-FIX-TRANSACTION-VISIBILITY-ISSUE.md
-- ============================================================================

-- Drop existing function
DROP FUNCTION IF EXISTS initialize_fsm_with_outbox(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB);

-- Recreate with row_security = off
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
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off  -- <<< FIX: Bypass RLS policies
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
  UPDATE courses
  SET
    generation_status = p_initial_state::generation_status,
    updated_at = NOW()
  WHERE id = p_entity_id
  RETURNING * INTO v_course_record;

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
      'idempotency_key', p_idempotency_key
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
      job_options
    ) VALUES (
      p_entity_id,
      v_job->>'queue',
      v_job->'data',
      COALESCE(v_job->'options', '{}'::jsonb)
    ) RETURNING outbox_id INTO v_outbox_id;

    v_outbox_entries := v_outbox_entries || jsonb_build_object(
      'outbox_id', v_outbox_id,
      'queue_name', v_job->>'queue',
      'entity_id', p_entity_id,
      'job_data', v_job->'data',
      'job_options', COALESCE(v_job->'options', '{}'::jsonb),
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
      'outboxEntries', v_outbox_entries
    ),
    p_entity_id,
    NOW() + INTERVAL '48 hours'
  );

  -- ============================================================================
  -- Step 6: Return Result
  -- ============================================================================
  RETURN jsonb_build_object(
    'fsmState', jsonb_build_object(
      'entity_id', p_entity_id,
      'state', p_initial_state,
      'version', v_state_version,
      'created_by', p_user_id,
      'created_at', v_course_record.created_at
    ),
    'outboxEntries', v_outbox_entries
  );
END;
$$;

-- ============================================================================
-- Permissions (same as before)
-- ============================================================================
GRANT EXECUTE ON FUNCTION initialize_fsm_with_outbox TO service_role;
GRANT EXECUTE ON FUNCTION initialize_fsm_with_outbox TO authenticated;

-- ============================================================================
-- Documentation
-- ============================================================================
COMMENT ON FUNCTION initialize_fsm_with_outbox IS 'Atomic FSM initialization with transactional outbox pattern. Bypasses RLS via row_security=off since function is SECURITY DEFINER owned by postgres. Eliminates race conditions by creating FSM state + outbox entries in single PostgreSQL COMMIT.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Fixed: Added SET row_security = off to bypass RLS policies
-- Reason: RLS policies with qual=false were blocking all writes even from SECURITY DEFINER function
-- Result: Function can now write to job_outbox, fsm_events, idempotency_keys tables
