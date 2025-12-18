-- ============================================================================
-- RPC: restart_from_stage
-- Purpose: Allow restarting course generation from a specific stage
-- Date: 2025-12-07
-- Author: Claude Code (Database Specialist)
-- ============================================================================

-- Security: This function uses SECURITY DEFINER to bypass FSM trigger validation
-- and allow direct status transitions for restart scenarios.
-- Access is controlled by checking user ownership of the course.

CREATE OR REPLACE FUNCTION public.restart_from_stage(
  p_course_id UUID,
  p_stage_number INTEGER,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course RECORD;
  v_target_status TEXT;
  v_old_status TEXT;
  v_result JSONB;
BEGIN
  -- 1. Validate stage number (2-6 are valid, 1 is initialization)
  IF p_stage_number < 2 OR p_stage_number > 6 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid stage number. Must be between 2 and 6.',
      'code', 'INVALID_STAGE'
    );
  END IF;

  -- 2. Get course and verify ownership
  SELECT id, user_id, generation_status, organization_id
  INTO v_course
  FROM courses
  WHERE id = p_course_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Course not found',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- 3. Verify ownership
  IF v_course.user_id != p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Access denied. You do not own this course.',
      'code', 'FORBIDDEN'
    );
  END IF;

  -- 4. Determine target status based on stage
  v_target_status := CASE p_stage_number
    WHEN 2 THEN 'stage_2_init'
    WHEN 3 THEN 'stage_3_init'
    WHEN 4 THEN 'stage_4_init'
    WHEN 5 THEN 'stage_5_init'
    WHEN 6 THEN 'stage_5_complete' -- Stage 6 starts from Stage 5 complete
  END;

  -- 5. Store old status for logging
  v_old_status := v_course.generation_status::TEXT;

  -- 6. Check if restart is allowed from current status
  -- Restart is only allowed from completed, failed, cancelled, or stage_X_complete/awaiting_approval states
  IF v_course.generation_status NOT IN (
    'completed', 'failed', 'cancelled',
    'stage_2_complete', 'stage_2_awaiting_approval',
    'stage_3_complete', 'stage_3_awaiting_approval',
    'stage_4_complete', 'stage_4_awaiting_approval',
    'stage_5_complete', 'stage_5_awaiting_approval'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cannot restart from status: %s. Course must be in completed, failed, or a stable stage state.', v_course.generation_status),
      'code', 'INVALID_STATE'
    );
  END IF;

  -- 7. Disable trigger temporarily and update status
  -- We use a direct UPDATE bypassing the trigger by setting a session variable
  PERFORM set_config('app.bypass_fsm_validation', 'true', true);

  UPDATE courses
  SET
    generation_status = v_target_status::generation_status,
    error_message = NULL,
    last_progress_update = NOW(),
    updated_at = NOW()
  WHERE id = p_course_id;

  -- Reset bypass flag
  PERFORM set_config('app.bypass_fsm_validation', 'false', true);

  -- 8. Log the transition
  INSERT INTO generation_status_history (
    course_id,
    old_status,
    new_status,
    changed_by,
    trigger_source,
    metadata
  ) VALUES (
    p_course_id,
    v_old_status::generation_status,
    v_target_status::generation_status,
    p_user_id,
    'restart_from_stage_rpc',
    jsonb_build_object(
      'stage_number', p_stage_number,
      'initiated_at', NOW()
    )
  );

  -- 9. Return success
  v_result := jsonb_build_object(
    'success', true,
    'courseId', p_course_id,
    'previousStatus', v_old_status,
    'newStatus', v_target_status,
    'stageNumber', p_stage_number,
    'organizationId', v_course.organization_id
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.restart_from_stage TO authenticated;

-- Update FSM validation trigger to respect bypass flag
CREATE OR REPLACE FUNCTION validate_generation_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_transitions JSONB;
  v_bypass TEXT;
BEGIN
  -- Check if bypass flag is set (for restart_from_stage RPC)
  v_bypass := current_setting('app.bypass_fsm_validation', true);
  IF v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  -- Allow NULL -> any status (first initialization)
  IF OLD.generation_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prevent changes if status didn't actually change
  IF NEW.generation_status = OLD.generation_status THEN
    RETURN NEW;
  END IF;

  -- Define valid stage-based transitions
  -- Updated 2025-12-07: unchanged from 2025-11-26 version
  v_valid_transitions := '{
    "pending": ["stage_2_init", "stage_4_init", "cancelled"],
    "stage_2_init": ["stage_2_processing", "stage_2_complete", "stage_4_init", "failed", "cancelled"],
    "stage_2_processing": ["stage_2_complete", "failed", "cancelled"],
    "stage_2_complete": ["stage_2_awaiting_approval", "stage_3_init", "stage_3_summarizing", "stage_4_init", "failed", "cancelled"],
    "stage_2_awaiting_approval": ["stage_3_init", "cancelled"],

    "stage_3_init": ["stage_3_summarizing", "stage_2_complete", "failed", "cancelled"],
    "stage_3_summarizing": ["stage_3_complete", "stage_2_complete", "failed", "cancelled"],
    "stage_3_complete": ["stage_3_awaiting_approval", "stage_4_init", "failed", "cancelled"],
    "stage_3_awaiting_approval": ["stage_4_init", "cancelled"],

    "stage_4_init": ["stage_4_analyzing", "failed", "cancelled"],
    "stage_4_analyzing": ["stage_4_complete", "failed", "cancelled"],
    "stage_4_complete": ["stage_4_awaiting_approval", "stage_5_init", "failed", "cancelled"],
    "stage_4_awaiting_approval": ["stage_5_init", "cancelled"],

    "stage_5_init": ["stage_5_generating", "failed", "cancelled"],
    "stage_5_generating": ["stage_5_complete", "failed", "cancelled"],
    "stage_5_complete": ["stage_5_awaiting_approval", "finalizing", "failed", "cancelled"],
    "stage_5_awaiting_approval": ["stage_5_complete", "finalizing", "cancelled"],

    "finalizing": ["completed", "failed", "cancelled"],
    "completed": ["pending"],
    "failed": ["pending"],
    "cancelled": ["pending"]
  }'::JSONB;

  -- Check if transition is valid
  IF NOT (v_valid_transitions->OLD.generation_status::text) ? NEW.generation_status::text THEN
    RAISE EXCEPTION 'Invalid generation status transition: % -> % (course_id: %)',
      OLD.generation_status,
      NEW.generation_status,
      NEW.id
    USING HINT = 'Valid transitions from ' || OLD.generation_status || ': ' ||
                  (v_valid_transitions->OLD.generation_status::text)::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.restart_from_stage IS 'Restart course generation from a specific stage. Bypasses FSM validation. Stage 2-6 supported. Ownership validated.';
