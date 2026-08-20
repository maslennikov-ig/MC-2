-- ============================================================================
-- Migration: generation_trace gets a (course_id, id) index
-- Purpose:   Stop the course-total re-sum from walking the primary key
-- Issue:     mc2-hjhy5
-- ============================================================================
--
-- `readCourseTraceRows` pages a course's traces with
--
--   WHERE course_id = $1 [AND id > $cursor] ORDER BY id LIMIT 1000
--
-- `generation_trace.id` defaults to `gen_random_uuid()`, so it is unrelated to
-- insertion order — which is exactly why the paging uses it as a cursor: a
-- concurrent insert can never shift a boundary row into the next page and be
-- counted twice.
--
-- The cost of that choice was an index the table did not have. With only
-- `idx_generation_trace_course_id` (course_id alone) the planner cannot satisfy
-- `ORDER BY id` from it, so it walks `generation_trace_pkey` in id order and
-- filters. Measured on dev against course c8ffafbd, 3067 rows of 37224:
--
--   before:  Index Scan generation_trace_pkey
--            Rows Removed by Filter: 11352   buffers 12973   85 ms
--   after:   Index Scan (course_id, id)
--            Rows Removed by Filter: 0       buffers  1009   10 ms
--
-- The work scales with the size of the whole table, not with the size of the
-- course: a course holding 1% of the rows pays roughly a hundred rows read per
-- row returned. `updateCourseEstimatedCost` runs on every stage-6 lesson
-- completion and after every edit, so this is a hot path that gets slower as
-- the platform is used, for reasons nothing in the query text suggests.
--
-- The single-column index is dropped rather than kept. `(course_id, id)` serves
-- every lookup `(course_id)` served — a b-tree answers a prefix of its columns —
-- so the table ends with the same number of indexes and insert cost does not
-- move. This is why the two statements belong in one transaction: at no point
-- is there a window with no index on `course_id`.
--
-- Not CONCURRENTLY: that cannot run inside a transaction, and it would leave
-- exactly that window. At 37k rows the plain build takes milliseconds.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

CREATE INDEX IF NOT EXISTS idx_generation_trace_course_id_id
  ON public.generation_trace (course_id, id);

DROP INDEX IF EXISTS public.idx_generation_trace_course_id;

COMMIT;
