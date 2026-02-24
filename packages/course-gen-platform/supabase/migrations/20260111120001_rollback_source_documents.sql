-- Rollback Migration: Remove source_documents column from lessons table
-- To apply: Run this migration manually if you need to rollback 20260111120000
-- WARNING: This will permanently delete source_documents data from all lessons

-- Drop the GIN index first
DROP INDEX IF EXISTS idx_lessons_source_documents;

-- Remove the column
ALTER TABLE lessons DROP COLUMN IF EXISTS source_documents;

-- Note: Column comments are automatically removed when the column is dropped
