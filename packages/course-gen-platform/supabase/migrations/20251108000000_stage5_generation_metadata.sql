-- Migration: 20251108000000_stage5_generation_metadata.sql
-- Purpose: Add generation_metadata JSONB column to courses table for Stage 5 generation tracking
-- Dependencies: Requires courses table (created in earlier migrations)

-- Add generation_metadata column to courses table
ALTER TABLE courses ADD COLUMN IF NOT EXISTS generation_metadata JSONB;

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_courses_generation_metadata ON courses USING GIN (generation_metadata);

-- Add descriptive comment to column
COMMENT ON COLUMN courses.generation_metadata IS
'Stage 5 generation tracking metadata (JSONB): model usage per phase (metadata/sections/validation), token consumption, cost tracking, duration metrics, quality scores (Jina-v3 similarity), batch/retry counts, and creation timestamp. Enables performance analysis and cost optimization.';

-- Create validation function for FR-015 (minimum 10 lessons requirement)
CREATE OR REPLACE FUNCTION validate_minimum_lessons(course_structure JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  total_lessons INTEGER := 0;
  section JSONB;
BEGIN
  -- Count total lessons across all sections
  FOR section IN SELECT jsonb_array_elements(course_structure->'sections')
  LOOP
    total_lessons := total_lessons + jsonb_array_length(section->'lessons');
  END LOOP;

  -- FR-015: Minimum 10 lessons required
  RETURN total_lessons >= 10;
END;
$$;

COMMENT ON FUNCTION validate_minimum_lessons(JSONB) IS
'Validates that course structure has minimum 10 lessons (FR-015). Used in Stage 5 generation quality gates. Returns TRUE if valid, FALSE otherwise. Immutable function for index usage.';
