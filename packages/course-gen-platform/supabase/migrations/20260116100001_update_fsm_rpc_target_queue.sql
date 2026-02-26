-- ============================================================================
-- Migration: Update initialize_fsm_with_outbox RPC for target_queue Support
-- Purpose: Add p_target_queue parameter for environment-based job routing
-- Date: 2026-01-16
-- Issue: mc2-1avq
-- Dependencies: 20260116100000_add_target_queue_to_job_outbox.sql
-- ============================================================================
--
-- Changes:
--   1. Add p_target_queue parameter (TEXT, DEFAULT 'course-generation')
--   2. Pass target_queue to job_outbox INSERT
--   3. Include target_queue in outboxEntries response
--
-- Backward Compatibility:
--   - p_target_queue is LAST parameter with DEFAULT value
--   - Existing callers (without p_target_queue) continue working
--   - Default 'course-generation' matches Production behavior
--
-- ============================================================================

-- ============================================================================
-- Step 1: Drop Existing Function
-- ============================================================================
-- Required because we're changing the function signature
-- Note: Dropping function does NOT affect existing outbox entries

DROP FUNCTION IF EXISTS initialize_fsm_with_outbox(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB);
DROP FUNCTION IF EXISTS initialize_fsm_with_outbox(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT);

-- ============================================================================
-- Step 2: Create Updated Function with target_queue Parameter
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

  -- NEW: Target queue for environment isolation (LAST for backward compat)
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
BEGIN
  -- ============================================================================
  -- Step 0: Validate and normalize p_initiated_by
  -- ============================================================================
  -- fsm_events.created_by CHECK constraint: 'API', 'QUEUE', or 'WORKER'
  -- Map common values and validate

  v_created_by := CASE
    WHEN p_initiated_by IN ('API', 'QUEUE', 'WORKER') THEN p_initiated_by
    WHEN p_initiated_by IN ('TEST', 'ADMIN') THEN 'API'  -- Map test/admin to API
    ELSE 'API'  -- Default to API for unknown values
  END;

  -- ============================================================================
  -- Step 1: Idempotency Check (Database-Level)
  -- ============================================================================
  -- Purpose: Handle Redis cache misses by checking database
  -- Scenario: Redis down/evicted → fall back to PostgreSQL idempotency_keys
  --
  -- IMPORTANT: This check happens BEFORE the transaction starts to avoid
  -- unnecessary row locks if the request is a duplicate.

  SELECT * INTO v_existing_idempotency
  FROM idempotency_keys
  WHERE key = p_idempotency_key;

  IF FOUND THEN
    -- Return cached result (idempotent response)
    RETURN v_existing_idempotency.result;
  END IF;

  -- ============================================================================
  -- Step 2: Update FSM State in courses Table
  -- ============================================================================
  -- Purpose: Initialize generation_status to initial state (e.g., 'stage_2_init')
  -- Atomicity: Part of same transaction as outbox inserts below
  --
  -- Row-level lock: FOR UPDATE (implicit via UPDATE statement)
  -- Ensures no concurrent FSM initialization for same course

  UPDATE courses
  SET
    generation_status = p_initial_state::generation_status,
    updated_at = NOW()
  WHERE id = p_entity_id
  RETURNING * INTO v_course_record;

  -- Error handling: Course must exist
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course not found: %', p_entity_id;
  END IF;

  -- ============================================================================
  -- Step 3: Record FSM Event (Audit Trail)
  -- ============================================================================
  -- Purpose: Immutable log of FSM initialization for debugging/analytics
  -- Table: fsm_events (audit trail, never deleted)

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
      'initiated_by', p_initiated_by,  -- Store original value
      'metadata', p_metadata,
      'idempotency_key', p_idempotency_key,
      'target_queue', p_target_queue  -- NEW: Include in audit trail
    ),
    v_created_by,  -- Use validated value
    p_user_id
  );

  -- ============================================================================
  -- Step 4: Create Job Outbox Entries (Transactional Queue)
  -- ============================================================================
  -- Purpose: Queue BullMQ jobs within same transaction as FSM update
  -- Background processor: Polls job_outbox → creates BullMQ jobs asynchronously
  --
  -- Critical: These inserts happen in SAME COMMIT as FSM state update
  -- Result: Workers CANNOT execute before FSM state exists in database
  --
  -- NEW: target_queue column enables environment isolation

  FOR v_job IN SELECT * FROM jsonb_array_elements(p_job_data)
  LOOP
    INSERT INTO job_outbox (
      entity_id,
      queue_name,
      job_data,
      job_options,
      target_queue  -- NEW: Environment-specific queue name
    ) VALUES (
      p_entity_id,
      v_job->>'queue',
      v_job->'data',
      COALESCE(v_job->'options', '{}'::jsonb),
      p_target_queue  -- NEW: Use parameter value
    ) RETURNING outbox_id INTO v_outbox_id;

    -- Accumulate outbox entry metadata for return value
    v_outbox_entries := v_outbox_entries || jsonb_build_object(
      'outbox_id', v_outbox_id,
      'queue_name', v_job->>'queue',
      'entity_id', p_entity_id,
      'job_data', v_job->'data',
      'job_options', COALESCE(v_job->'options', '{}'::jsonb),
      'target_queue', p_target_queue,  -- NEW: Include in response
      'processed_at', NULL::timestamptz,
      'created_at', NOW()
    );
  END LOOP;

  -- ============================================================================
  -- Step 5: Store Idempotency Key (Database-Level Cache)
  -- ============================================================================
  -- Purpose: Prevent duplicate executions if Redis cache miss occurs
  -- TTL: 48 hours (expires_at column, cleaned via pg_cron)
  --
  -- IMPORTANT: Result MUST match TypeScript InitializeFSMResult interface
  -- Fields: fsmState (entity_id, state, version, created_by, created_at)
  --         outboxEntries (array of outbox metadata)

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
      'target_queue', p_target_queue  -- NEW: Include in cached result
    ),
    p_entity_id,
    NOW() + INTERVAL '48 hours'
  );

  -- ============================================================================
  -- Step 6: Return Result (TypeScript InitializeFSMResult Interface)
  -- ============================================================================
  -- Format:
  --   {
  --     fsmState: {
  --       entity_id: UUID,
  --       state: string,
  --       version: number,
  --       created_by: UUID,
  --       created_at: timestamp
  --     },
  --     outboxEntries: [
  --       { outbox_id, queue_name, entity_id, job_data, job_options, target_queue, ... }
  --     ],
  --     target_queue: string  // NEW
  --   }
  --
  -- NOTE: TypeScript handler adds 'fromCache: false' wrapper

  RETURN jsonb_build_object(
    'fsmState', jsonb_build_object(
      'entity_id', p_entity_id,
      'state', p_initial_state,
      'version', v_state_version,
      'created_by', p_user_id,
      'created_at', v_course_record.created_at
    ),
    'outboxEntries', v_outbox_entries,
    'target_queue', p_target_queue  -- NEW: Include in response
  );

  -- ============================================================================
  -- Implicit COMMIT: All operations succeed or rollback together
  -- ============================================================================
END;
$$;

-- ============================================================================
-- Step 3: Permissions
-- ============================================================================
-- Grant execute to service_role (backend orchestrator)
-- Background processor uses service_role credentials

GRANT EXECUTE ON FUNCTION initialize_fsm_with_outbox TO service_role;

-- Grant execute to authenticated users (API endpoints)
-- Allows user-initiated course generation via API

GRANT EXECUTE ON FUNCTION initialize_fsm_with_outbox TO authenticated;

-- ============================================================================
-- Step 4: Documentation
-- ============================================================================
COMMENT ON FUNCTION initialize_fsm_with_outbox IS 'Atomic FSM initialization with transactional outbox pattern. Eliminates race conditions by creating FSM state + outbox entries in single PostgreSQL COMMIT. Supports idempotency via database-level cache (idempotency_keys table). NEW: p_target_queue parameter enables DEV/Production environment isolation. Returns JSONB matching TypeScript InitializeFSMResult interface.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Changes from original function:
--   1. Added p_target_queue TEXT parameter (DEFAULT 'course-generation')
--   2. INSERT into job_outbox now includes target_queue column
--   3. outboxEntries response includes target_queue field
--   4. Idempotency cached result includes target_queue
--   5. FSM event audit trail includes target_queue in event_data
--
-- Function Signature (NEW):
--   initialize_fsm_with_outbox(
--     p_entity_id UUID,
--     p_user_id UUID,
--     p_organization_id UUID,
--     p_idempotency_key TEXT,
--     p_initiated_by TEXT,
--     p_initial_state TEXT,
--     p_job_data JSONB,
--     p_metadata JSONB DEFAULT '{}',
--     p_target_queue TEXT DEFAULT 'course-generation'  -- NEW
--   ) RETURNS JSONB
--
-- Backward Compatibility:
--   - Existing callers without p_target_queue continue working
--   - Default value matches existing Production behavior
--
-- Next Steps:
--   1. Update OutboxProcessor to filter by target_queue column
--   2. Update TypeScript InitializeFSMCommandHandler to pass target_queue
--   3. Configure BULLMQ_QUEUE_NAME env var per environment
--
