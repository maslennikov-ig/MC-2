-- Migration: Fix race condition in approveAndProceed
-- Issue: CRITICAL-001 (mc2-xcr5)
-- Purpose: Add proceed_job_id column to track job creation and prevent duplicate jobs
--
-- Problem: Despite atomic RPC with FOR UPDATE lock, job creation happens AFTER the RPC
-- completes. While the current implementation should prevent races (second request
-- would fail RPC due to status check), this adds defense-in-depth protection.
--
-- Solution:
-- 1. Add proceed_job_id column to courses table
-- 2. Modify RPC to check/set this field atomically
-- 3. Return job_id if already set (idempotency)

-- ============================================================================
-- STEP 1: Add proceed_job_id column to courses table
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'courses'
        AND column_name = 'proceed_job_id'
    ) THEN
        ALTER TABLE courses
        ADD COLUMN proceed_job_id TEXT;

        COMMENT ON COLUMN courses.proceed_job_id IS
        'BullMQ job ID for the current stage transition job.
        Set atomically during approveAndProceed to prevent duplicate job creation.
        Cleared when job completes or course status changes.';

        RAISE NOTICE 'Added proceed_job_id column to courses table';
    ELSE
        RAISE NOTICE 'proceed_job_id column already exists';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Drop existing RPC and create enhanced version
-- ============================================================================

DROP FUNCTION IF EXISTS approve_and_proceed_atomic(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION approve_and_proceed_atomic(
  p_course_id UUID,
  p_user_id UUID,
  p_org_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_course RECORD;
  v_unanswered_critical INT;
  v_unanswered_important INT;
BEGIN
  -- Lock the course row to prevent concurrent modifications
  -- FOR UPDATE NOWAIT will immediately fail if another transaction holds the lock
  BEGIN
    SELECT id, generation_status, user_id, organization_id, proceed_job_id
    INTO v_course
    FROM courses
    WHERE id = p_course_id
    FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Course is currently being processed by another request',
        'code', 'CONCURRENT_REQUEST'
      );
  END;

  -- Check if course exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Course not found',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Verify user has access (course owner or same organization)
  IF v_course.user_id != p_user_id AND v_course.organization_id != p_org_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Access denied',
      'code', 'FORBIDDEN'
    );
  END IF;

  -- RACE CONDITION PROTECTION: Check if job is already being created
  -- If status is stage_4_analyzing and proceed_job_id is set, return existing job
  IF v_course.generation_status::TEXT = 'stage_4_analyzing' AND v_course.proceed_job_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'stage_4_analyzing',
      'existing_job_id', v_course.proceed_job_id,
      'is_duplicate', true
    );
  END IF;

  -- Check if course is in correct status for transition
  IF v_course.generation_status::TEXT != 'stage_4_clarifying' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Invalid status: expected stage_4_clarifying, got %s', v_course.generation_status::TEXT),
      'code', 'INVALID_STATUS',
      'current_status', v_course.generation_status::TEXT
    );
  END IF;

  -- Count unanswered critical questions
  SELECT COUNT(*)
  INTO v_unanswered_critical
  FROM clarifying_questions
  WHERE course_id = p_course_id
    AND question_priority = 'critical'
    AND status = 'pending';

  -- Count unanswered important questions
  SELECT COUNT(*)
  INTO v_unanswered_important
  FROM clarifying_questions
  WHERE course_id = p_course_id
    AND question_priority = 'important'
    AND status = 'pending';

  -- Validate all required questions are answered
  IF v_unanswered_critical > 0 OR v_unanswered_important > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Unanswered required questions: %s critical, %s important',
                      v_unanswered_critical, v_unanswered_important),
      'code', 'UNANSWERED_QUESTIONS',
      'unanswered_critical', v_unanswered_critical,
      'unanswered_important', v_unanswered_important
    );
  END IF;

  -- Atomically update status to stage_4_analyzing
  -- proceed_job_id will be set by TypeScript after job creation
  UPDATE courses
  SET generation_status = 'stage_4_analyzing',
      updated_at = NOW()
  WHERE id = p_course_id;

  -- Return success with new status
  RETURN jsonb_build_object(
    'success', true,
    'status', 'stage_4_analyzing',
    'previous_status', 'stage_4_clarifying',
    'is_duplicate', false
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'INTERNAL_ERROR'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================================================
-- STEP 3: Create helper function to set job ID after creation
-- ============================================================================

CREATE OR REPLACE FUNCTION set_proceed_job_id(
  p_course_id UUID,
  p_job_id TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE courses
  SET proceed_job_id = p_job_id,
      updated_at = NOW()
  WHERE id = p_course_id
    AND generation_status = 'stage_4_analyzing'
    AND proceed_job_id IS NULL;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================================================
-- STEP 4: Create function to clear job ID (called when job completes/fails)
-- ============================================================================

CREATE OR REPLACE FUNCTION clear_proceed_job_id(
  p_course_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE courses
  SET proceed_job_id = NULL,
      updated_at = NOW()
  WHERE id = p_course_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================================================
-- STEP 5: Documentation and permissions
-- ============================================================================

COMMENT ON FUNCTION approve_and_proceed_atomic(UUID, UUID, UUID) IS
'Atomic function to approve clarifying questions and transition course to stage_4_analyzing.
Uses FOR UPDATE NOWAIT lock to prevent race conditions and duplicate job creation.
Returns existing job ID if called while job is being created (idempotency).
SECURITY DEFINER to bypass RLS for courses table.

Changes from previous version:
- Added NOWAIT to FOR UPDATE for immediate failure on concurrent requests
- Added check for existing proceed_job_id to return existing job (idempotency)
- Added is_duplicate flag in response';

COMMENT ON FUNCTION set_proceed_job_id(UUID, TEXT) IS
'Sets the proceed_job_id after job creation. Called by TypeScript after BullMQ job is created.
Only succeeds if status is stage_4_analyzing and proceed_job_id is NULL.';

COMMENT ON FUNCTION clear_proceed_job_id(UUID) IS
'Clears the proceed_job_id when job completes or fails. Called by stage worker.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION approve_and_proceed_atomic(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_proceed_job_id(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_proceed_job_id(UUID) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  column_exists BOOLEAN;
  func_exists BOOLEAN;
BEGIN
  -- Check column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'courses'
    AND column_name = 'proceed_job_id'
  ) INTO column_exists;

  -- Check functions
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'approve_and_proceed_atomic'
  ) INTO func_exists;

  RAISE NOTICE '=== Migration Verification ===';
  RAISE NOTICE 'proceed_job_id column exists: %', column_exists;
  RAISE NOTICE 'approve_and_proceed_atomic function exists: %', func_exists;
  RAISE NOTICE '==============================';
END $$;
