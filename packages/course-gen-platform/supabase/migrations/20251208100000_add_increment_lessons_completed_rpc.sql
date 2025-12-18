-- Add RPC function to update lessons_completed counter
-- Purpose: Update generation_progress.lessons_completed when Stage 6 saves a lesson
-- Date: 2025-12-08
-- Updated: Count unique lessons to handle regenerations correctly

/**
 * Update the lessons_completed counter in generation_progress JSONB
 *
 * This function counts unique completed lessons from lesson_contents table
 * and updates the counter. This correctly handles lesson regenerations
 * (when the same lesson is generated multiple times).
 *
 * Called by Stage 6 handler after successfully saving lesson content.
 *
 * @param p_course_id - Course UUID
 * @returns Updated lessons_completed count (unique lessons)
 */
CREATE OR REPLACE FUNCTION increment_lessons_completed(
  p_course_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_unique_count INTEGER;
BEGIN
  -- Count unique completed lessons (not all records, to handle regenerations)
  SELECT COUNT(DISTINCT lesson_id)
  INTO v_unique_count
  FROM lesson_contents
  WHERE course_id = p_course_id
    AND status = 'completed';

  -- Update the counter with actual unique count
  UPDATE courses
  SET
    generation_progress = jsonb_set(
      COALESCE(generation_progress, '{}'::jsonb),
      '{lessons_completed}',
      to_jsonb(v_unique_count)
    ),
    updated_at = NOW()
  WHERE id = p_course_id;

  RETURN v_unique_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_lessons_completed(UUID) TO authenticated;

-- Also grant to service role for backend calls
GRANT EXECUTE ON FUNCTION increment_lessons_completed(UUID) TO service_role;

COMMENT ON FUNCTION increment_lessons_completed IS 'Update lessons_completed counter based on unique completed lessons in lesson_contents. Handles regenerations correctly.';
