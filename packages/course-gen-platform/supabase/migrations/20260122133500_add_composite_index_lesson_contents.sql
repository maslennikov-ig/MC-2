-- =============================================================================
-- Migration: Add Composite Index for increment_lessons_completed Query
-- Optimizes: COUNT(DISTINCT lesson_id) WHERE course_id = X AND status = 'completed'
-- =============================================================================

-- Composite index for the exact query pattern used in increment_lessons_completed
-- This is more efficient than separate indexes (course_id) + (status) which require
-- bitmap AND operation
CREATE INDEX IF NOT EXISTS idx_lesson_contents_course_status_completed
  ON lesson_contents(course_id, status)
  WHERE status = 'completed';  -- Partial index - only indexes completed lessons

-- Comment documenting the purpose
COMMENT ON INDEX idx_lesson_contents_course_status_completed IS
'Optimizes COUNT(DISTINCT lesson_id) in increment_lessons_completed RPC. Partial index covering only completed lessons for smaller index size and faster lookups.';
