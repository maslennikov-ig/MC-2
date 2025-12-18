-- Migration: Add failed_at_stage tracking for error display
-- Related: generation-error-handling-refactor.md Task 1
--
-- Purpose:
-- - Track which stage (2-6) failed during course generation
-- - Add error_code enum for classified error types
-- - Enable UI to show errors on the correct graph node
--
-- Changes:
-- 1. Add failed_at_stage column (smallint, nullable)
-- 2. Create stage_error_code enum type
-- 3. Add error_code column (stage_error_code, nullable)

-- Add column to track which stage failed
ALTER TABLE courses ADD COLUMN IF NOT EXISTS failed_at_stage smallint;

-- Create error code enum for classification
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stage_error_code') THEN
    CREATE TYPE stage_error_code AS ENUM (
      'LOCK_ACQUISITION_FAILED',
      'ORCHESTRATION_FAILED',
      'VALIDATION_FAILED',
      'QUALITY_THRESHOLD_NOT_MET',
      'DATABASE_ERROR',
      'TIMEOUT',
      'UNKNOWN'
    );
  END IF;
END$$;

-- Add error_code column
ALTER TABLE courses ADD COLUMN IF NOT EXISTS error_code stage_error_code;

-- Comment for documentation
COMMENT ON COLUMN courses.failed_at_stage IS 'Stage number (2-6) where generation failed. NULL if not failed or failed at initialization.';
COMMENT ON COLUMN courses.error_code IS 'Classified error code for monitoring and debugging.';
