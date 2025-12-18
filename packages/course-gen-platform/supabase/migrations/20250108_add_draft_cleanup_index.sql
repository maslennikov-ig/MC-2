-- ============================================================================
-- Migration: 20250108_add_draft_cleanup_index.sql
-- Purpose: Add composite index to optimize cleanup queries for old draft courses
-- Author: infrastructure-specialist
-- Date: 2025-01-08
-- Spec: docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md (section 3.4.1)
-- ============================================================================
--
-- This migration adds a composite partial index to optimize the cleanup query:
--   DELETE FROM courses
--   WHERE status = 'draft'
--     AND generation_status IS NULL
--     AND created_at < NOW() - INTERVAL '24 hours'
--
-- The partial index only includes rows that match the WHERE clause conditions,
-- significantly improving query performance while minimizing index size.
--
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE COMPOSITE PARTIAL INDEX
-- ============================================================================

-- Create composite index for efficient cleanup queries
-- This is a partial index that only includes draft courses with NULL generation_status
-- Common pattern: WHERE status = 'draft' AND generation_status IS NULL AND created_at < cutoff
-- Use case: Hourly cleanup job executed by Edge Function
CREATE INDEX IF NOT EXISTS idx_courses_draft_cleanup
  ON courses (status, generation_status, created_at)
  WHERE status = 'draft' AND generation_status IS NULL;

-- ============================================================================
-- PART 2: ANALYZE INDEX EFFICIENCY
-- ============================================================================

-- Add comment explaining the index purpose
COMMENT ON INDEX idx_courses_draft_cleanup IS
  'Partial composite index for efficient cleanup of old unused draft courses. Optimizes DELETE queries in cleanup-old-drafts Edge Function.';

-- ============================================================================
-- PART 3: VERIFICATION QUERY
-- ============================================================================

-- Verify the index was created successfully
DO $$
DECLARE
  v_index_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'courses'
      AND indexname = 'idx_courses_draft_cleanup'
  ) INTO v_index_exists;

  IF v_index_exists THEN
    RAISE NOTICE 'SUCCESS: Index idx_courses_draft_cleanup created successfully';
  ELSE
    RAISE WARNING 'WARNING: Index idx_courses_draft_cleanup not found';
  END IF;
END $$;

-- ============================================================================
-- PART 4: INDEX SIZE AND STATISTICS
-- ============================================================================

-- Query to check index size and usage (run after migration)
-- Uncomment to run manually:
/*
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE indexrelname = 'idx_courses_draft_cleanup';
*/

-- ============================================================================
-- PART 5: PERFORMANCE TESTING QUERY
-- ============================================================================

-- Query to test index usage (run manually to verify EXPLAIN plan):
-- EXPLAIN (ANALYZE, BUFFERS)
-- DELETE FROM courses
-- WHERE status = 'draft'
--   AND generation_status IS NULL
--   AND created_at < NOW() - INTERVAL '24 hours';
--
-- Expected result: Should show "Index Scan using idx_courses_draft_cleanup"

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================

-- To rollback this migration (remove the index):
-- DROP INDEX IF EXISTS idx_courses_draft_cleanup;

-- Note: It's safe to drop this index if the cleanup job is disabled.
-- However, without the index, cleanup queries will be significantly slower
-- on tables with many rows.

-- ============================================================================
-- PERFORMANCE NOTES
-- ============================================================================

-- Index characteristics:
-- - Type: B-tree composite index
-- - Partial: Only includes rows WHERE status = 'draft' AND generation_status IS NULL
-- - Columns: (status, generation_status, created_at)
-- - Order: Optimized for the cleanup query pattern
--
-- Benefits:
-- - Drastically reduces query time for cleanup operations
-- - Minimal storage overhead (only indexes relevant rows)
-- - Supports both equality (status, generation_status) and range (created_at) conditions
--
-- Expected performance improvement:
-- - Without index: Full table scan (O(n) where n = total courses)
-- - With index: Index scan (O(log m) where m = draft courses)
-- - For 1000 total courses with 50 drafts: ~20x faster

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
