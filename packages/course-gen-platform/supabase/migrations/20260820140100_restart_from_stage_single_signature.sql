-- ============================================================================
-- Migration: restart_from_stage becomes one function again
-- Purpose:   Remove the overload that made every RPC call unresolvable, keep
--            the admin bypass it carried, and stop the restart from leaving
--            stale cost behind
-- Issues:    mc2-wxvyr (ambiguous overload), mc2-fyn4f (stale traces and total)
-- ============================================================================
--
-- 1. THE AMBIGUITY
--
-- The database held two functions:
--
--   restart_from_stage(p_course_id uuid, p_stage_number integer, p_user_id uuid)
--   restart_from_stage(p_course_id uuid, p_user_id uuid, p_stage_number integer)
--
-- Same name, same parameter NAMES, different order. Both callers pass named
-- arguments — `supabase.rpc('restart_from_stage', { p_course_id, p_stage_number,
-- p_user_id })` — and a named call matches both candidates exactly:
--
--   ERROR 42725: function public.restart_from_stage(p_course_id => uuid,
--                p_stage_number => integer, p_user_id => uuid) is not unique
--   HINT: Could not choose a best candidate function.
--
-- Supabase's own documentation is blunt about it: "make the name of the
-- function unique as overloaded functions are not supported." So both
-- `restartStage` (lifecycle router) and FULL_REGENERATE from chat have been
-- failing since 20260321090724_add_admin_bypass_to_restart_from_stage created
-- the second one.
--
-- `20260413120000_drop_legacy_restart_from_stage_overload.sql` was written to
-- fix this and never reached the database — the drift gate only reports
-- migrations newer than the last applied one, so a gap in the middle of history
-- is invisible to it forever (mc2-y23na).
--
-- That migration is deliberately NOT what runs here. Dropping the legacy
-- overload alone would also have dropped the admin/superadmin bypass that
-- 20260321090724 deliberately added, silently, four months after anyone
-- remembered adding it. The bypass is folded into the canonical signature
-- instead, so the capability survives and the ambiguity does not. The old file
-- stays in the repository and is a harmless no-op if it is ever applied: its
-- DROP is `IF EXISTS` and its two assertions both hold after this migration.
--
-- 2. THE COST LEFT BEHIND
--
-- The trace cleanup covered stage_2% .. stage_6%. Stage 7 rows survived a
-- restart, so a restart from stage 2 — which re-runs the pipeline through
-- enrichments — counted the previous run's stage-7 spend alongside the new one,
-- and kept traces for lessons that no longer exist.
--
-- `stage_edit` rows deliberately survive, and this comment exists so the next
-- reader does not "fix" that: they are what a user spent on chat and inline
-- edits. That money was really spent and is not being redone. Restarting
-- generation does not refund it.
--
-- The DELETE also never touched `courses.estimated_cost_usd`, which is the
-- cached SUM of exactly the rows it had just removed. Regeneration usually
-- corrected it at the next `updateCourseEstimatedCost`, but a restart whose
-- regeneration failed early left the course permanently claiming the cost of a
-- run that no longer exists. It is resynced here, in the same transaction as
-- the delete, from the rows that survive.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.restart_from_stage(UUID, UUID, INTEGER);

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
  v_estimated_cost NUMERIC;
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

  -- Folded in from the dropped overload: an admin or superadmin may restart a
  -- course they do not own. Losing this was the cost of the simpler repair.
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

  -- Traces for every stage that is about to be redone. stage_7 is included
  -- because a restart re-runs the pipeline through enrichments; stage_1 is not,
  -- because upload is never redone. stage_edit is deliberately absent — see the
  -- header.
  DELETE FROM generation_trace
  WHERE course_id = p_course_id
    AND (
      (p_stage_number <= 2 AND stage LIKE 'stage_2%')
      OR (p_stage_number <= 3 AND stage LIKE 'stage_3%')
      OR (p_stage_number <= 4 AND stage LIKE 'stage_4%')
      OR (p_stage_number <= 5 AND stage LIKE 'stage_5%')
      OR (p_stage_number <= 6 AND stage LIKE 'stage_6%')
      OR stage LIKE 'stage_7%'
    );

  GET DIAGNOSTICS v_deleted_traces = ROW_COUNT;

  -- The cached total is a SUM over the rows just deleted, so it is resynced
  -- here rather than left for whatever runs next.
  SELECT COALESCE(SUM(cost_usd), 0)
  INTO v_estimated_cost
  FROM generation_trace
  WHERE course_id = p_course_id;

  UPDATE courses
  SET estimated_cost_usd = v_estimated_cost
  WHERE id = p_course_id;

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
        'traces_deleted', v_deleted_traces,
        'estimated_cost_usd', v_estimated_cost
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
      'tracesDeleted', v_deleted_traces,
      'estimatedCostUsd', v_estimated_cost
    )
  );

  RETURN v_result;
END;
$$;

-- The whole point of this migration is that exactly one function answers to
-- this name. Assert it rather than trust it: the ambiguity was invisible for
-- four months precisely because nothing checked.
DO $$
DECLARE
  v_count INTEGER;
  v_signatures TEXT;
BEGIN
  SELECT count(*), string_agg(p.oid::regprocedure::text, ', ')
  INTO v_count, v_signatures
  FROM pg_proc p
  WHERE p.proname = 'restart_from_stage'
    AND p.pronamespace = 'public'::regnamespace;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'restart_from_stage must have exactly one signature, found %: %',
      v_count, v_signatures;
  END IF;

  -- A SECURITY DEFINER function owned by postgres with a mutable search_path is
  -- the shape the dropped overload had, and Supabase's linter flags it
  -- (0011_function_search_path_mutable). Do not let it come back.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'restart_from_stage'
      AND p.pronamespace = 'public'::regnamespace
      AND p.proconfig @> ARRAY['search_path=public']
  ) THEN
    RAISE EXCEPTION 'restart_from_stage must pin search_path=public';
  END IF;
END;
$$;

COMMIT;
