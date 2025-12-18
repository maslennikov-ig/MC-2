-- Migration: Extend llm_model_config with versioning support
-- Purpose: Add version tracking, is_active flag, and expanded phase support for Admin Pipeline Dashboard
-- Date: 2025-12-03
-- Related: specs/015-admin-pipeline-dashboard/data-model.md

-- ============================================================================
-- Add versioning columns
-- ============================================================================

ALTER TABLE llm_model_config ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE llm_model_config ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE llm_model_config ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);

-- Update existing rows to have version=1 and is_active=true
UPDATE llm_model_config SET version = 1, is_active = true WHERE version IS NULL OR is_active IS NULL;

-- ============================================================================
-- Expand phase_name constraint to support 12 phases
-- ============================================================================

-- Drop existing constraint
ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

-- Add new constraint with all 12 phases
ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check
  CHECK (phase_name = ANY (ARRAY[
    'phase_1_classification',
    'phase_2_scope',
    'phase_3_expert',
    'phase_4_synthesis',
    'phase_6_rag_planning',
    'emergency',
    'quality_fallback',
    'stage_3_classification',
    'stage_5_metadata',
    'stage_5_sections',
    'stage_6_judge',
    'stage_6_refinement'
  ]::text[]));

-- ============================================================================
-- Create versioning indexes
-- ============================================================================

-- Partial unique index: Only one active config per type+phase+course
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_model_config_active
  ON llm_model_config(config_type, phase_name, COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active = true;

-- Index for version history queries
CREATE INDEX IF NOT EXISTS idx_llm_model_config_history
  ON llm_model_config(config_type, phase_name, course_id, version DESC);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN llm_model_config.version IS 'Version number for this configuration (increments on each update)';
COMMENT ON COLUMN llm_model_config.is_active IS 'Whether this is the currently active version (only one active per type/phase/course)';
COMMENT ON COLUMN llm_model_config.created_by IS 'UUID of the user who created this version';
