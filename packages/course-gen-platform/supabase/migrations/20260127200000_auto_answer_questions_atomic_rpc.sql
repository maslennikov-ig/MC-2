-- Migration: auto_answer_questions_atomic_rpc
-- Purpose: Atomic RPC function for auto-answering all clarifying questions
-- This function uses a single transaction to ensure all-or-nothing updates.
-- Addresses HIGH-003: Transaction rollback for autoAnswer
--
-- Benefits:
-- 1. Atomicity: All updates succeed or all fail (no partial state)
-- 2. Performance: Single database round-trip instead of N updates
-- 3. Consistency: Row-level locking prevents concurrent modifications

-- Drop existing function if exists (idempotent)
DROP FUNCTION IF EXISTS auto_answer_questions_atomic(UUID);

-- Create the atomic RPC function
CREATE OR REPLACE FUNCTION auto_answer_questions_atomic(
  p_course_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_question RECORD;
  v_updated_count INT := 0;
  v_fallback_count INT := 0;
  v_total_count INT := 0;
  v_first_answer TEXT;
  v_user_answer JSONB;
  v_answered_at TIMESTAMPTZ := NOW();
BEGIN
  -- Count total pending questions first
  SELECT COUNT(*)
  INTO v_total_count
  FROM clarifying_questions
  WHERE course_id = p_course_id
    AND status = 'pending';

  -- Early exit if no pending questions
  IF v_total_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'updated_count', 0,
      'fallback_count', 0,
      'total_pending', 0,
      'message', 'No pending questions to auto-answer'
    );
  END IF;

  -- Lock and iterate through all pending questions
  -- Using FOR UPDATE to prevent concurrent modifications
  FOR v_question IN
    SELECT id, suggested_answers, question_type
    FROM clarifying_questions
    WHERE course_id = p_course_id
      AND status = 'pending'
    FOR UPDATE
  LOOP
    -- Extract first suggested answer text
    -- suggested_answers is JSONB array: [{"text": "...", "rationale": "..."}, ...]
    BEGIN
      v_first_answer := v_question.suggested_answers -> 0 ->> 'text';

      IF v_first_answer IS NULL OR v_first_answer = '' THEN
        -- Fallback if suggested_answers structure is invalid
        v_first_answer := 'Auto-selected by system';
        v_fallback_count := v_fallback_count + 1;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- Fallback on any JSON parsing error
        v_first_answer := 'Auto-selected by system';
        v_fallback_count := v_fallback_count + 1;
    END;

    -- Build user_answer JSONB based on question type
    -- For multi_choice, we use "values" array; for others, "value" string
    IF v_question.question_type = 'multi_choice' THEN
      v_user_answer := jsonb_build_object('values', jsonb_build_array(v_first_answer));
    ELSE
      v_user_answer := jsonb_build_object('value', v_first_answer);
    END IF;

    -- Update the question
    UPDATE clarifying_questions
    SET
      user_answer = v_user_answer,
      answer_source = 'suggested',
      selected_suggestion_index = 0,
      status = 'answered',
      answered_at = v_answered_at
    WHERE id = v_question.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  -- Return success with statistics
  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'fallback_count', v_fallback_count,
    'total_pending', v_total_count,
    'answered_at', v_answered_at
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Transaction automatically rolls back on exception
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'INTERNAL_ERROR',
      'updated_count', 0,
      'total_pending', v_total_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Add comment for documentation
COMMENT ON FUNCTION auto_answer_questions_atomic(UUID) IS
'Atomic function to auto-answer all pending clarifying questions for a course.
Uses a single transaction to ensure all-or-nothing updates.
Returns JSONB with: success, updated_count, fallback_count, total_pending.
SECURITY DEFINER to bypass RLS for clarifying_questions table.';

-- Grant execute permission to authenticated and service_role users
GRANT EXECUTE ON FUNCTION auto_answer_questions_atomic(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_answer_questions_atomic(UUID) TO service_role;

-- ============================================================================
-- VERIFICATION: Test the function structure
-- ============================================================================

DO $$
DECLARE
  v_function_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'auto_answer_questions_atomic'
  ) INTO v_function_exists;

  IF v_function_exists THEN
    RAISE NOTICE 'Migration successful: auto_answer_questions_atomic function created';
  ELSE
    RAISE EXCEPTION 'Migration failed: function not created';
  END IF;
END $$;
