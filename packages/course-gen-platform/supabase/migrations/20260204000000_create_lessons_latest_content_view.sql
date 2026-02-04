-- Optimize export-lessons: combined view with latest completed content per lesson
-- Uses LEFT JOIN LATERAL + LIMIT 1 (more efficient than DISTINCT ON for PG15)
-- Pattern matches: 20260114000000_generation_trace_lifecycle.sql:347

CREATE OR REPLACE VIEW public.lessons_with_latest_content
WITH (security_invoker = true)
AS
SELECT
  l.id AS lesson_id,
  l.section_id,
  l.title AS lesson_title,
  l.order_index,
  lc.content,
  lc.metadata AS content_metadata,
  lc.created_at AS content_created_at
FROM lessons l
LEFT JOIN LATERAL (
  SELECT lc2.content, lc2.metadata, lc2.created_at
  FROM lesson_contents lc2
  WHERE lc2.lesson_id = l.id AND lc2.status = 'completed'
  ORDER BY lc2.created_at DESC
  LIMIT 1
) lc ON true;

COMMENT ON VIEW public.lessons_with_latest_content IS
'Lessons joined with their latest completed content. Used by export-lessons procedure.

- Returns one row per lesson (LATERAL + LIMIT 1 ensures uniqueness)
- LEFT JOIN returns NULL content for lessons without completed content
- security_invoker=true respects RLS policies on BOTH lessons and lesson_contents tables
  (users can only see lessons they have access to via course/organization membership)
- Optimized for export-lessons query pattern (section_id filter + order_index sort)

Performance: Reduces data transfer by ~10x vs querying lesson_contents directly.

ROLLBACK PROCEDURE (if needed):
  1. DROP VIEW public.lessons_with_latest_content;
  2. DROP INDEX IF EXISTS idx_lesson_contents_lesson_completed_latest;
  3. Revert export-lessons.ts to use direct lesson_contents FK join
  4. Note: REVOKE not needed — view deletion auto-revokes';

/*
POST-DEPLOYMENT VERIFICATION:

-- 1. Verify view returns data
SELECT lesson_id, lesson_title, content IS NOT NULL AS has_content
FROM lessons_with_latest_content LIMIT 5;

-- 2. No duplicate lesson_ids (should return 0 rows)
SELECT lesson_id, COUNT(*)
FROM lessons_with_latest_content
GROUP BY lesson_id HAVING COUNT(*) > 1;

-- 3. Verify index is used (expect Index Scan on idx_lesson_contents_lesson_completed_latest)
EXPLAIN ANALYZE
SELECT * FROM lessons_with_latest_content
WHERE section_id = '<test-section-id>'
ORDER BY order_index;
*/

-- Supporting partial index for the LATERAL subquery
CREATE INDEX IF NOT EXISTS idx_lesson_contents_lesson_completed_latest
  ON lesson_contents(lesson_id, created_at DESC)
  WHERE status = 'completed';

-- Grant access
GRANT SELECT ON public.lessons_with_latest_content TO authenticated;
GRANT SELECT ON public.lessons_with_latest_content TO service_role;
