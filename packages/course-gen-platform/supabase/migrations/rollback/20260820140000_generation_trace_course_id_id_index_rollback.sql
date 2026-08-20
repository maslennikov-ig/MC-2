-- ============================================================================
-- Rollback: 20260820140000_generation_trace_course_id_id_index
-- ============================================================================
--
-- Puts the single-column index back before removing the composite, so the
-- transaction never leaves `generation_trace.course_id` unindexed. Nothing but
-- read performance changes either way — no data is touched.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

CREATE INDEX IF NOT EXISTS idx_generation_trace_course_id
  ON public.generation_trace (course_id);

DROP INDEX IF EXISTS public.idx_generation_trace_course_id_id;

COMMIT;
