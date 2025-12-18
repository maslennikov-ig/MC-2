-- Migration: 20251202143100_fix_priority_composite_index.sql
-- Purpose: Fix composite index to include both course_id and priority
--
-- The previous migration created idx_file_catalog_priority on (priority) only.
-- This migration drops that index and recreates it as a proper composite index
-- on (course_id, priority) for optimal query performance.

-- Drop the incorrectly created index
DROP INDEX IF EXISTS idx_file_catalog_priority;

-- Recreate as composite index on (course_id, priority)
CREATE INDEX IF NOT EXISTS idx_file_catalog_priority
ON file_catalog (course_id, priority);

COMMENT ON INDEX idx_file_catalog_priority IS
'Composite index for fast lookups by course and priority level. Optimizes document prioritization queries.';
