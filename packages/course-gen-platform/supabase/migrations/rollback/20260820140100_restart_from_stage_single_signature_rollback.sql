-- ============================================================================
-- Rollback: 20260820140100_restart_from_stage_single_signature
-- ============================================================================
--
-- Restores the trace cleanup to stage_2%..stage_6% and drops the
-- estimated_cost_usd resync. Keeps the single signature and the admin bypass:
-- recreating the second overload would put the database back into the state
-- where no RPC call to this function can be resolved at all, which is not a
-- state worth being able to roll back to.
--
-- Nothing here restores traces a restart has already deleted. Those rows are
-- gone under either version of the function; only the cost figure differs.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

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
  v_deleted_nodes INTEGER;
  v_is_admin BOOLEAN;
BEGIN
  IF p_stage_number < 2 OR p_stage_number > 6 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid stage number. Must be between 2 and 6.',
      'code', 'INVALID_STAGE'
    );
  END IF;

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

  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND role IN ('admin', 'superadmin')
  ) INTO v_is_admin;

  IF v_course.user_id != p_user_id AND NOT v_is_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Access denied. You do not own this course.',
      'code', 'FORBIDDEN'
    );
  END IF;

  v_target_status := CASE p_stage_number
    WHEN 2 THEN 'stage_2_init'
    WHEN 3 THEN 'stage_3_init'
    WHEN 4 THEN 'stage_4_init'
    WHEN 5 THEN 'stage_5_init'
    WHEN 6 THEN 'stage_5_complete'
  END;

  v_old_status := v_course.generation_status::TEXT;

  IF v_course.generation_status = 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot restart from pending status. Generation has not started yet.',
      'code', 'INVALID_STATE'
    );
  END IF;

  PERFORM set_config('app.bypass_fsm_validation', 'true', true);

  UPDATE courses
  SET
    generation_status = v_target_status::generation_status,
    error_message = NULL,
    error_details = NULL,
    error_code = NULL,
    failed_at_stage = NULL,
    analysis_result = CASE
      WHEN p_stage_number <= 4 THEN NULL
      ELSE analysis_result
    END,
    course_structure = CASE
      WHEN p_stage_number <= 5 THEN NULL
      ELSE course_structure
    END,
    generation_completed_at = NULL,
    completed_at = NULL,
    last_progress_update = NOW(),
    updated_at = NOW()
  WHERE id = p_course_id;

  PERFORM set_config('app.bypass_fsm_validation', 'false', true);

  v_deleted_nodes := 0;
  IF p_stage_number <= 5 THEN
    DELETE FROM course_nodes WHERE course_id = p_course_id;
    GET DIAGNOSTICS v_deleted_nodes = ROW_COUNT;
  END IF;

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
      'admin_bypass', v_is_admin,
      'data_cleared', jsonb_build_object(
        'analysis_result', p_stage_number <= 4,
        'course_structure', p_stage_number <= 5,
        'course_nodes_deleted', v_deleted_nodes,
        'traces_deleted', v_deleted_traces
      )
    )
  );

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
      'courseNodesDeleted', v_deleted_nodes,
      'tracesDeleted', v_deleted_traces
    )
  );

  RETURN v_result;
END;
$$;

COMMIT;
