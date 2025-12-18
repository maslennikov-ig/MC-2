-- ============================================================================
-- Migration: Fix restart_from_stage RPC
-- Purpose: Allow restart from active states and clear stage data on restart
-- Date: 2025-12-18
-- Author: Claude Code
-- ============================================================================
--
-- Problems Fixed:
-- 1. RPC only allowed restart from completed/failed/stage_X_complete states
--    - Now allows restart from ANY state (except pending)
--    - This enables restart when stuck in stage_4_analyzing, etc.
--
-- 2. RPC didn't clear stage-specific data on restart
--    - Now clears analysis_result for Stage 4+ restart
--    - Now clears course_structure for Stage 5+ restart
--    - Clears error_message, error_details, error_code, failed_at_stage
--
-- 3. RPC didn't clean up generation_trace records
--    - Now deletes trace records for stages >= restart target
--
-- ============================================================================

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
  v_deleted_traces INTEGER;
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
  -- NEW: Allow restart from ANY state except 'pending' (nothing to restart)
  -- This enables restart when stuck in active states like 'stage_4_analyzing'
  IF v_course.generation_status = 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot restart from pending status. Generation has not started yet.',
      'code', 'INVALID_STATE'
    );
  END IF;

  -- 7. Disable trigger temporarily and update status
  PERFORM set_config('app.bypass_fsm_validation', 'true', true);

  -- 8. Clear stage-specific data based on target stage
  UPDATE courses
  SET
    generation_status = v_target_status::generation_status,
    -- Clear error fields
    error_message = NULL,
    error_details = NULL,
    error_code = NULL,
    failed_at_stage = NULL,
    -- Clear stage 4+ data if restarting from stage 4 or earlier
    analysis_result = CASE
      WHEN p_stage_number <= 4 THEN NULL
      ELSE analysis_result
    END,
    -- Clear stage 5+ data if restarting from stage 5 or earlier
    course_structure = CASE
      WHEN p_stage_number <= 5 THEN NULL
      ELSE course_structure
    END,
    -- Reset completion timestamp
    generation_completed_at = NULL,
    completed_at = NULL,
    -- Update timestamps
    last_progress_update = NOW(),
    updated_at = NOW()
  WHERE id = p_course_id;

  -- Reset bypass flag
  PERFORM set_config('app.bypass_fsm_validation', 'false', true);

  -- 9. Delete generation_trace records for stages >= target
  -- Stage mapping: 'stage_4_%' for stage 4, 'stage_5_%' for stage 5, etc.
  DELETE FROM generation_trace
  WHERE course_id = p_course_id
    AND (
      (p_stage_number <= 2 AND stage LIKE 'stage_2%')
      OR (p_stage_number <= 3 AND stage LIKE 'stage_3%')
      OR (p_stage_number <= 4 AND stage LIKE 'stage_4%')
      OR (p_stage_number <= 5 AND stage LIKE 'stage_5%')
      OR (p_stage_number <= 6 AND stage LIKE 'stage_6%')
    );

  GET DIAGNOSTICS v_deleted_traces = ROW_COUNT;

  -- 10. Log the transition
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
      'initiated_at', NOW(),
      'data_cleared', jsonb_build_object(
        'analysis_result', p_stage_number <= 4,
        'course_structure', p_stage_number <= 5,
        'traces_deleted', v_deleted_traces
      )
    )
  );

  -- 11. Return success
  v_result := jsonb_build_object(
    'success', true,
    'courseId', p_course_id,
    'previousStatus', v_old_status,
    'newStatus', v_target_status,
    'stageNumber', p_stage_number,
    'organizationId', v_course.organization_id,
    'dataCleared', jsonb_build_object(
      'analysisResult', p_stage_number <= 4,
      'courseStructure', p_stage_number <= 5,
      'tracesDeleted', v_deleted_traces
    )
  );

  RETURN v_result;
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.restart_from_stage IS
'Restart course generation from a specific stage.
Allows restart from any state except pending.
Clears stage-specific data: analysis_result (stage 4+), course_structure (stage 5+).
Deletes generation_trace records for restarted stages.
Bypasses FSM validation. Stage 2-6 supported. Ownership validated.';

-- ============================================================================
-- Migration validation
-- ============================================================================

DO $$
BEGIN
  -- Verify function exists with updated logic
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'restart_from_stage'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'Migration failed: restart_from_stage function not found';
  END IF;

  RAISE NOTICE 'Migration 20251218_fix_restart_from_stage_rpc completed successfully';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Restart now allowed from any state except pending';
  RAISE NOTICE '  - Stage data (analysis_result, course_structure) cleared on restart';
  RAISE NOTICE '  - Error fields cleared on restart';
  RAISE NOTICE '  - Generation traces deleted for restarted stages';
END;
$$;
