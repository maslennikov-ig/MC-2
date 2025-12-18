-- Migration: Clean up obsolete global settings
-- Purpose: Remove settings that have been moved to per-stage configuration
-- Date: 2025-12-16
-- Related: Per-stage configuration refactoring
--
-- Context:
-- - quality_threshold → moved to llm_model_config.quality_threshold
-- - retry_attempts → moved to llm_model_config.max_retries
-- - timeout_per_phase → moved to llm_model_config.timeout_ms
-- - feature_flags.useDatabasePrompts → removed (always use DB)
-- - feature_flags.enableQualityValidation → removed (always enabled)
-- - feature_flags.enableCostTracking → removed (always enabled)
--
-- Only rag_token_budget remains in pipeline_global_settings.

-- ============================================================================
-- Remove Obsolete Settings
-- ============================================================================

-- Remove settings that have been moved to llm_model_config
DELETE FROM pipeline_global_settings
WHERE setting_key IN ('quality_threshold', 'retry_attempts', 'timeout_per_phase');

-- Update feature_flags to empty object (all flags removed)
UPDATE pipeline_global_settings
SET setting_value = '{}'::jsonb
WHERE setting_key = 'feature_flags';

-- ============================================================================
-- Update Table Documentation
-- ============================================================================

-- Update table comment to reflect new purpose
COMMENT ON TABLE pipeline_global_settings IS 'Global pipeline settings. Per-stage settings (quality threshold, retries, timeout) moved to llm_model_config. Only rag_token_budget remains here.';
