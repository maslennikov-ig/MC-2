-- Migration: approve_and_proceed_atomic_rpc
-- Purpose: Atomic RPC function for approveAndProceed to prevent race conditions
-- This function uses FOR UPDATE lock to ensure atomic status transition

-- Drop existing function if exists (idempotent)
DROP FUNCTION IF EXISTS approve_and_proceed_atomic(UUID, UUID, UUID);

-- Create the atomic RPC function
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
  SELECT id, generation_status, user_id, organization_id
  INTO v_course
  FROM courses
  WHERE id = p_course_id
  FOR UPDATE;

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
  UPDATE courses
  SET generation_status = 'stage_4_analyzing'
  WHERE id = p_course_id;

  -- Return success with new status
  RETURN jsonb_build_object(
    'success', true,
    'status', 'stage_4_analyzing',
    'previous_status', 'stage_4_clarifying'
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

-- Add comment for documentation
COMMENT ON FUNCTION approve_and_proceed_atomic(UUID, UUID, UUID) IS
'Atomic function to approve clarifying questions and transition course to stage_4_analyzing.
Uses FOR UPDATE lock to prevent race conditions. Returns JSONB with success status.
SECURITY DEFINER to bypass RLS for courses table.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION approve_and_proceed_atomic(UUID, UUID, UUID) TO authenticated;
