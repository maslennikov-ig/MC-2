-- Migration: Fix llm_model_config active configuration index
-- Purpose: Replace broken COALESCE-based unique index with separate partial indexes
-- Date: 2025-12-03
-- Related: specs/015-admin-pipeline-dashboard/data-model.md
-- Fixes: Critical bug where only one active global config could exist across all phases

-- ============================================================================
-- Problem Description:
-- ============================================================================
-- The previous index used COALESCE(course_id, '00000000-0000-0000-0000-000000000000')
-- which caused all NULL course_id values (global configs) to be treated as the same value.
-- This prevented having multiple active global configurations across different phases.
--
-- Example of what was broken:
-- ✗ Cannot have: phase_1_classification (global, active) AND phase_2_scope (global, active)
-- ✗ Error: duplicate key value violates unique constraint
--
-- What should work:
-- ✓ phase_1_classification (global, active) - allowed
-- ✓ phase_2_scope (global, active) - allowed
-- ✓ phase_1_classification (course_123, active) - allowed
-- ✗ phase_1_classification (global, active) - second one not allowed (correct!)

-- ============================================================================
-- Drop the broken index
-- ============================================================================

DROP INDEX IF EXISTS idx_llm_model_config_active;

-- ============================================================================
-- Create correct partial indexes
-- ============================================================================

-- For global configs: Only one active config per config_type + phase_name
-- This allows different phases to have different active global configs
CREATE UNIQUE INDEX idx_llm_model_config_active_global
  ON llm_model_config(config_type, phase_name)
  WHERE is_active = true AND config_type = 'global';

-- For course overrides: Only one active config per config_type + phase_name + course_id
-- This allows each course to have its own active override per phase
CREATE UNIQUE INDEX idx_llm_model_config_active_course
  ON llm_model_config(config_type, phase_name, course_id)
  WHERE is_active = true AND config_type = 'course_override';

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON INDEX idx_llm_model_config_active_global IS
  'Ensures only one active global config per phase (allows different phases to have different active configs)';

COMMENT ON INDEX idx_llm_model_config_active_course IS
  'Ensures only one active course override per phase per course';
