-- Migration: 20260210120000_atomic_course_deletion.sql
-- Purpose: Create an RPC function for atomic (transactional) course deletion.
--
-- Problem: The course deletion API routes perform 6+ sequential DELETE operations
-- without a transaction wrapper. If any step fails mid-way, orphaned records remain,
-- leaving the database in an inconsistent state.
--
-- Solution: A single PL/pgSQL function that runs all deletions within one transaction.
-- PostgreSQL wraps every function call in a transaction automatically, so if any
-- DELETE fails, the entire operation rolls back atomically.
--
-- Key insight from FK analysis:
--   Almost ALL child tables reference courses(id) with ON DELETE CASCADE.
--   The ONLY exception is `lesson_progress` which uses NO ACTION on both
--   its course_id and lesson_id FKs. Therefore, the function only needs to:
--     1. Delete lesson_progress rows (would block CASCADE otherwise)
--     2. Delete the course row (CASCADE handles everything else)
--
--   CASCADE chain: courses -> sections -> lessons -> (lesson_contents, assets, etc.)
--   Also cascades: generation_trace, fsm_events, job_status, job_outbox, etc.
--   Storage trigger: trg_cleanup_course_storage fires BEFORE DELETE on courses,
--   cleaning up files in the course-enrichments bucket automatically.
--
-- SECURITY: SECURITY DEFINER with restricted search_path.
-- Called via service_role (admin client), so RLS is already bypassed.
--
-- ROLLBACK: DROP FUNCTION delete_course_cascade(uuid);

CREATE OR REPLACE FUNCTION public.delete_course_cascade(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course record;
  v_lesson_progress_deleted integer;
BEGIN
  -- 1. Verify course exists and capture metadata for the response
  SELECT id, title INTO v_course
  FROM courses
  WHERE id = p_course_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Course not found'
    );
  END IF;

  -- 2. Delete lesson_progress rows that would block CASCADE.
  --    lesson_progress has NO ACTION on both course_id and lesson_id FKs,
  --    so it must be cleaned up explicitly before the course row is removed.
  DELETE FROM lesson_progress WHERE course_id = p_course_id;
  GET DIAGNOSTICS v_lesson_progress_deleted = ROW_COUNT;

  -- 3. Delete the course row.
  --    All other child tables use ON DELETE CASCADE, so PostgreSQL will
  --    automatically remove rows from: sections, lessons, lesson_contents,
  --    assets, generation_trace, fsm_events, file_catalog, job_status,
  --    job_outbox, idempotency_keys, course_enrollments, course_edits,
  --    course_chat_messages, clarifying_questions, generation_status_history,
  --    lesson_enrichments, llm_model_config, lms_import_jobs, rag_context_cache,
  --    refinement_config, system_metrics, document_priorities.
  --    error_logs.course_id will be SET NULL (not deleted).
  --    The BEFORE DELETE trigger trg_cleanup_course_storage will clean up
  --    Storage bucket files automatically.
  DELETE FROM courses WHERE id = p_course_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_course_id', p_course_id,
    'deleted_course_title', v_course.title,
    'lesson_progress_deleted', v_lesson_progress_deleted
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.delete_course_cascade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_course_cascade(uuid) TO service_role;

COMMENT ON FUNCTION public.delete_course_cascade(uuid) IS
  'Atomically deletes a course and all related data within a single transaction. '
  'Explicitly removes lesson_progress rows (NO ACTION FK), then deletes the course '
  'row and lets ON DELETE CASCADE handle all other child tables. '
  'Returns JSON with success status and deleted course metadata.';
