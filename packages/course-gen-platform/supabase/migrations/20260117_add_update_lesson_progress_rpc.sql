-- ============================================================================
-- Migration: 20260117_add_update_lesson_progress_rpc.sql
-- Purpose: Add RPC function for updating lesson progress in course enrollments
-- Author: database-architect
-- Date: 2026-01-17
-- ============================================================================

-- Function to update lesson progress for a user in a course
-- Handles both marking lessons complete and incomplete
-- Also updates last_accessed timestamp and last_accessed_lesson_id
CREATE OR REPLACE FUNCTION update_lesson_progress(
  p_user_id UUID,
  p_course_id UUID,
  p_lesson_id UUID,
  p_action TEXT  -- 'mark_complete' | 'mark_incomplete' | 'access'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment_id UUID;
  v_current_progress JSONB;
  v_lessons_completed JSONB;
  v_result JSONB;
BEGIN
  -- Validate action parameter
  IF p_action NOT IN ('mark_complete', 'mark_incomplete', 'access') THEN
    RAISE EXCEPTION 'Invalid action: %. Must be mark_complete, mark_incomplete, or access', p_action;
  END IF;

  -- Get or create enrollment
  SELECT id, progress INTO v_enrollment_id, v_current_progress
  FROM course_enrollments
  WHERE user_id = p_user_id AND course_id = p_course_id;

  -- If no enrollment exists, create one
  IF v_enrollment_id IS NULL THEN
    INSERT INTO course_enrollments (user_id, course_id, status, progress)
    VALUES (
      p_user_id,
      p_course_id,
      'active',
      jsonb_build_object(
        'lessons_completed', '[]'::jsonb,
        'last_accessed', NOW()::text,
        'last_accessed_lesson_id', p_lesson_id::text
      )
    )
    RETURNING id, progress INTO v_enrollment_id, v_current_progress;
  END IF;

  -- Get current lessons_completed array
  v_lessons_completed := COALESCE(v_current_progress->'lessons_completed', '[]'::jsonb);

  -- Update based on action
  IF p_action = 'mark_complete' THEN
    -- Add lesson_id if not already in array
    IF NOT (v_lessons_completed ? p_lesson_id::text) THEN
      v_lessons_completed := v_lessons_completed || to_jsonb(p_lesson_id::text);
    END IF;
  ELSIF p_action = 'mark_incomplete' THEN
    -- Remove lesson_id from array
    v_lessons_completed := (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      FROM jsonb_array_elements(v_lessons_completed) AS elem
      WHERE elem::text != ('"' || p_lesson_id::text || '"')
    );
  END IF;

  -- Build updated progress object
  v_result := jsonb_build_object(
    'lessons_completed', v_lessons_completed,
    'last_accessed', NOW()::text,
    'last_accessed_lesson_id', p_lesson_id::text
  );

  -- Update the enrollment
  UPDATE course_enrollments
  SET
    progress = v_result,
    status = CASE
      WHEN status = 'dropped' OR status = 'expired' THEN 'active'
      ELSE status
    END
  WHERE id = v_enrollment_id;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_lesson_progress(UUID, UUID, UUID, TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION update_lesson_progress IS
'Updates lesson progress for a user in a course.
Actions: mark_complete (add lesson to completed), mark_incomplete (remove lesson), access (just update timestamp).
Creates enrollment if not exists. Returns updated progress JSONB.';

-- ============================================================================
-- Function to get lesson progress for a user in a course
-- ============================================================================
CREATE OR REPLACE FUNCTION get_lesson_progress(
  p_user_id UUID,
  p_course_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress JSONB;
BEGIN
  SELECT progress INTO v_progress
  FROM course_enrollments
  WHERE user_id = p_user_id AND course_id = p_course_id;

  -- Return empty progress if no enrollment
  IF v_progress IS NULL THEN
    RETURN jsonb_build_object(
      'lessons_completed', '[]'::jsonb,
      'last_accessed', NULL,
      'last_accessed_lesson_id', NULL
    );
  END IF;

  RETURN v_progress;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_lesson_progress(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION get_lesson_progress IS
'Gets lesson progress for a user in a course. Returns empty progress if not enrolled.';
