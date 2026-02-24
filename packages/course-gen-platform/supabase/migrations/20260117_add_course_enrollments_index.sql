-- Migration: 20260117_add_course_enrollments_index.sql
-- Date: 2026-01-17
-- Author: Claude Code (database-architect)
-- Purpose: Add composite index on course_enrollments(user_id, course_id) for RPC performance
--
-- This index optimizes the query pattern used by update_lesson_progress and
-- get_lesson_progress RPC functions which filter by both user_id AND course_id:
--
--   SELECT id, progress FROM course_enrollments
--   WHERE user_id = p_user_id AND course_id = p_course_id;
--
-- Note: A unique constraint index (enrollments_user_course_unique) already exists
-- on these columns, but adding an explicit index ensures the query planner
-- consistently uses the optimal access path regardless of statistics.

-- Create composite index for user_id + course_id lookups
CREATE INDEX IF NOT EXISTS idx_course_enrollments_user_course
ON course_enrollments(user_id, course_id);

-- Add comment explaining the index purpose
COMMENT ON INDEX idx_course_enrollments_user_course IS
'Optimizes RPC functions update_lesson_progress and get_lesson_progress which query by user_id AND course_id';
