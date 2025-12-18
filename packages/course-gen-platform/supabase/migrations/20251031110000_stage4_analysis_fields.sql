-- Migration: 20251031110000_stage4_analysis_fields.sql
-- Purpose: Add analysis_result JSONB column to courses table for Stage 4 analysis output
-- Dependencies: Requires courses table (created in earlier migrations)

-- Add analysis_result column to courses table
ALTER TABLE courses ADD COLUMN IF NOT EXISTS analysis_result JSONB;

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_courses_analysis_result_gin ON courses USING GIN (analysis_result);

-- Add descriptive comment to column
COMMENT ON COLUMN courses.analysis_result IS 'Stage 4 analysis output (JSONB): course category, contextual language, topic analysis, recommended structure, pedagogical strategy, scope instructions, research flags';
