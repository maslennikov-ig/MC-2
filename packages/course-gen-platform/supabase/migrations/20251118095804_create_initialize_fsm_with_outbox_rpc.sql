-- ============================================================================
-- Create initialize_fsm_with_outbox RPC Function
-- Purpose: Atomic FSM initialization + job outbox creation in single transaction
-- Date: 2025-11-18
-- Dependencies: 20251118094238_create_transactional_outbox_tables.sql
-- Investigation: TASK-2025-11-18-TRANSACTIONAL-OUTBOX-IMPLEMENTATION.md
-- ============================================================================
--
-- Critical Function:
--   This function eliminates race conditions by executing ALL operations
--   (FSM state update, outbox insertion, audit logging, idempotency storage)
--   within a SINGLE PostgreSQL transaction (BEGIN...COMMIT).
--
-- Atomicity Guarantee:
--   If ANY operation fails, the ENTIRE transaction rolls back:
--   - No FSM state update without corresponding outbox entries
--   - No outbox entries without FSM state
--   - No partial idempotency records
--
-- Idempotency Pattern:
--   1. Check database idempotency_keys table (cache miss safety)
--   2. Return cached result if key exists
--   3. Execute transaction ONLY if key doesn't exist
--   4. Store result in idempotency_keys for future requests
--
-- Security:
--   - SECURITY DEFINER: Runs with creator privileges (bypasses RLS)
--   - search_path protection: Prevents search_path hijacking attacks
--
-- Performance:
--   - Target execution time: <50ms
--   - Index support: idx_job_outbox_entity, idx_idempotency_expires
--   - Minimal locking: Row-level locks on courses table only
--
-- ============================================================================

-- Drop existing function if exists (idempotent migration)
DROP FUNCTION IF EXISTS initialize_fsm_with_outbox(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB);

-- ============================================================================
-- Function: initialize_fsm_with_outbox
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
  p_metadata JSONB DEFAULT '{}'::jsonb
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
      'idempotency_key', p_idempotency_key
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

    -- Accumulate outbox entry metadata for return value
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
      'outboxEntries', v_outbox_entries
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
  --       { outbox_id, queue_name, entity_id, job_data, job_options, ... }
  --     ]
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
    'outboxEntries', v_outbox_entries
  );

  -- ============================================================================
  -- Implicit COMMIT: All operations succeed or rollback together
  -- ============================================================================
END;
$$;

-- ============================================================================
-- Permissions
-- ============================================================================
-- Grant execute to service_role (backend orchestrator)
-- Background processor uses service_role credentials

GRANT EXECUTE ON FUNCTION initialize_fsm_with_outbox TO service_role;

-- Grant execute to authenticated users (API endpoints)
-- Allows user-initiated course generation via API

GRANT EXECUTE ON FUNCTION initialize_fsm_with_outbox TO authenticated;

-- ============================================================================
-- Documentation
-- ============================================================================
COMMENT ON FUNCTION initialize_fsm_with_outbox IS 'Atomic FSM initialization with transactional outbox pattern. Eliminates race conditions by creating FSM state + outbox entries in single PostgreSQL COMMIT. Supports idempotency via database-level cache (idempotency_keys table). Returns JSONB matching TypeScript InitializeFSMResult interface.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Created:
--   1. initialize_fsm_with_outbox RPC function (SECURITY DEFINER)
--   2. Permissions granted to service_role + authenticated
--
-- Function Signature:
--   initialize_fsm_with_outbox(
--     entity_id UUID,
--     user_id UUID,
--     organization_id UUID,
--     idempotency_key TEXT,
--     initiated_by TEXT,
--     initial_state TEXT,
--     job_data JSONB,
--     metadata JSONB DEFAULT '{}'
--   ) RETURNS JSONB
--
-- Atomicity:
--   - All operations in single transaction (implicit BEGIN...COMMIT)
--   - FSM state update + outbox inserts + audit log + idempotency key
--   - Rollback on ANY error (course not found, FK violation, etc.)
--
-- Idempotency:
--   - Database-level check via idempotency_keys table
--   - Returns cached result for duplicate requests
--   - 48-hour TTL (expires_at column)
--
-- Security:
--   - SECURITY DEFINER: Runs with creator privileges (bypasses RLS)
--   - search_path protection: Prevents search_path hijacking
--
-- Performance:
--   - Target: <50ms execution time
--   - Minimal locking: Row-level UPDATE lock on courses table
--   - Index support: idx_job_outbox_entity, idx_idempotency_expires
--
-- Next Steps:
--   1. Test function with sample data (see testing section below)
--   2. Integrate with InitializeFSMCommandHandler (TypeScript)
--   3. Implement background processor (outbox polling)
--   4. Add monitoring for outbox processing lag
--
-- Testing Queries (see below for examples):
--   - Success case: Valid course_id + jobs
--   - Idempotency case: Call twice with same key
--   - Error case: Nonexistent course_id
--   - Performance: EXPLAIN ANALYZE for <50ms verification
--
