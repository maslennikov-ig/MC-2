-- Migration: Update unique indexes to support multiple judge configs per language
-- The current index prevents multiple active configs for same phase_name

-- Drop old indexes that don't account for language and judge_role
DROP INDEX IF EXISTS idx_llm_model_config_active_global;
DROP INDEX IF EXISTS idx_llm_model_config_active_course;

-- Create new unique index for global configs including language, context_tier, and judge_role
-- This allows: one active config per (phase_name, language, context_tier, judge_role) combination
CREATE UNIQUE INDEX idx_llm_model_config_active_global_v2
ON llm_model_config (config_type, phase_name, language, context_tier, judge_role)
WHERE is_active = true AND config_type = 'global';

-- Create new unique index for course overrides
CREATE UNIQUE INDEX idx_llm_model_config_active_course_v2
ON llm_model_config (config_type, phase_name, course_id, language, context_tier, judge_role)
WHERE is_active = true AND config_type = 'course_override';

-- Create index for efficient judge lookups by language
CREATE INDEX IF NOT EXISTS idx_llm_model_config_judges_by_language
ON llm_model_config (phase_name, language, judge_role, is_active)
WHERE phase_name = 'stage_6_judge' AND is_active = true;
