-- Rollback migration for pause/resume functionality
-- WARNING: This will lose all pause data if reverted!
--
-- Reverses: 20260114100000_add_generation_pause_fields.sql
-- Related: 20260114110000_add_rls_policies_for_pause.sql (documentation only, no rollback needed)

-- Drop helper functions (in reverse order of creation)
DROP FUNCTION IF EXISTS resume_course_generation(uuid, uuid);
DROP FUNCTION IF EXISTS pause_course_generation(uuid, uuid);
DROP FUNCTION IF EXISTS is_generation_paused(uuid);

-- Drop index
DROP INDEX IF EXISTS idx_courses_generation_paused;

-- Drop columns (this will permanently delete pause data!)
ALTER TABLE courses
DROP COLUMN IF EXISTS generation_paused_at,
DROP COLUMN IF EXISTS generation_paused_by;

-- Note: GRANT statements don't need rollback as they're on functions being dropped
