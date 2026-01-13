-- Migration: Drop unused lesson content structures
-- Description: Removes legacy lesson_content table and unused columns from lessons table
--              Content is now stored in lesson_contents table (with versioning support)
--
-- VERIFICATION (run before migration):
-- SELECT COUNT(*) FROM lesson_content;                              -- Should be 0
-- SELECT COUNT(content), COUNT(content_text) FROM lessons;          -- Should both be 0
--
-- ROLLBACK: Not recommended - these structures are confirmed unused

-- ============================================================================
-- 1. Drop legacy lesson_content table (0 rows, only used in tests)
-- ============================================================================

-- Drop RLS policies first (if any)
DROP POLICY IF EXISTS "Users can view own lesson content" ON lesson_content;
DROP POLICY IF EXISTS "Users can manage own lesson content" ON lesson_content;

-- Drop the table
DROP TABLE IF EXISTS lesson_content;

-- ============================================================================
-- 2. Drop unused columns from lessons table
-- ============================================================================

-- content column - never populated, content stored in lesson_contents
ALTER TABLE lessons DROP COLUMN IF EXISTS content;

-- content_text column - never populated
ALTER TABLE lessons DROP COLUMN IF EXISTS content_text;

-- ============================================================================
-- 3. Add comment for documentation
-- ============================================================================

COMMENT ON TABLE lesson_contents IS 'Main table for lesson content with versioning support. Replaced legacy lesson_content table and lessons.content column.';
