-- Add composite index (course_id, id) on course_nodes
-- Plan 8.1 requirement: enables efficient "get node X for course Y" lookups
-- and benefits RLS policies that filter by course_id.
-- Note: id is already PK, but this composite index avoids a second lookup
-- when both columns are used in WHERE clause (common in RLS-filtered queries).

CREATE INDEX IF NOT EXISTS idx_course_nodes_course_id
    ON course_nodes(course_id, id);
