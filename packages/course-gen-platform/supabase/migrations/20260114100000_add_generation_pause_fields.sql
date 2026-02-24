-- Migration: Add generation pause/stop control fields
-- Description: Enables pausing and stopping course generation at any stage

-- Add pause tracking fields to courses table
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS generation_paused_at timestamptz,
ADD COLUMN IF NOT EXISTS generation_paused_by uuid REFERENCES auth.users(id);

-- Add index for finding paused courses
CREATE INDEX IF NOT EXISTS idx_courses_generation_paused
ON courses (generation_paused_at)
WHERE generation_paused_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN courses.generation_paused_at IS 'Timestamp when generation was paused. NULL means not paused.';
COMMENT ON COLUMN courses.generation_paused_by IS 'User ID who paused the generation.';

-- Update the valid_generation_status_transition function to allow transitions from paused states
-- The existing function already handles 'cancelled' as a terminal state, and pause is handled at application level
-- by checking generation_paused_at field before processing jobs

-- Add helper function to check if course generation is paused
CREATE OR REPLACE FUNCTION is_generation_paused(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT generation_paused_at IS NOT NULL
  FROM courses
  WHERE id = p_course_id;
$$;

COMMENT ON FUNCTION is_generation_paused(uuid) IS 'Returns true if course generation is currently paused';

-- Add function to pause generation
CREATE OR REPLACE FUNCTION pause_course_generation(
  p_course_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course record;
  v_result jsonb;
BEGIN
  -- Get current course state
  SELECT id, generation_status, generation_paused_at
  INTO v_course
  FROM courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF v_course IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;

  -- Check if already paused
  IF v_course.generation_paused_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Generation is already paused');
  END IF;

  -- Check if generation is in progress (can only pause active generation)
  IF v_course.generation_status NOT IN (
    'stage_2_init', 'stage_2_processing',
    'stage_3_init', 'stage_3_summarizing',
    'stage_4_init', 'stage_4_analyzing',
    'stage_5_init', 'stage_5_generating',
    'stage_6_init', 'stage_6_generating'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Can only pause generation that is in progress',
      'current_status', v_course.generation_status
    );
  END IF;

  -- Pause the generation
  UPDATE courses
  SET
    generation_paused_at = NOW(),
    generation_paused_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_course_id;

  RETURN jsonb_build_object(
    'success', true,
    'paused_at', NOW(),
    'previous_status', v_course.generation_status
  );
END;
$$;

COMMENT ON FUNCTION pause_course_generation(uuid, uuid) IS 'Pauses course generation. Running jobs will complete but new jobs will wait.';

-- Add function to resume generation
CREATE OR REPLACE FUNCTION resume_course_generation(
  p_course_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course record;
  v_paused_duration interval;
BEGIN
  -- Get current course state
  SELECT id, generation_status, generation_paused_at
  INTO v_course
  FROM courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF v_course IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;

  -- Check if actually paused
  IF v_course.generation_paused_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Generation is not paused');
  END IF;

  -- Calculate pause duration for logging
  v_paused_duration := NOW() - v_course.generation_paused_at;

  -- Resume the generation
  UPDATE courses
  SET
    generation_paused_at = NULL,
    generation_paused_by = NULL,
    updated_at = NOW()
  WHERE id = p_course_id;

  RETURN jsonb_build_object(
    'success', true,
    'resumed_at', NOW(),
    'paused_duration_seconds', EXTRACT(EPOCH FROM v_paused_duration)::int,
    'current_status', v_course.generation_status
  );
END;
$$;

COMMENT ON FUNCTION resume_course_generation(uuid, uuid) IS 'Resumes paused course generation.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_generation_paused(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pause_course_generation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION resume_course_generation(uuid, uuid) TO authenticated;
