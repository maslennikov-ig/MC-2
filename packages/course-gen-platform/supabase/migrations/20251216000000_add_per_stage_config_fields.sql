-- Migration: Add per-stage configuration fields to llm_model_config
-- Purpose: Allow configuring quality threshold, max retries, and timeout per phase
-- instead of global settings

-- Add new columns
ALTER TABLE llm_model_config
ADD COLUMN quality_threshold numeric(3,2) CHECK (quality_threshold >= 0 AND quality_threshold <= 1),
ADD COLUMN max_retries integer DEFAULT 3 CHECK (max_retries >= 0 AND max_retries <= 10),
ADD COLUMN timeout_ms integer CHECK (timeout_ms IS NULL OR timeout_ms >= 1000);

-- Add column comments for documentation
COMMENT ON COLUMN llm_model_config.quality_threshold IS 'Quality threshold for phase validation (0-1). NULL uses hardcoded default.';
COMMENT ON COLUMN llm_model_config.max_retries IS 'Maximum retry attempts for phase (0-10). Default 3.';
COMMENT ON COLUMN llm_model_config.timeout_ms IS 'Phase timeout in milliseconds. NULL means no timeout (infinite).';

-- =============================================================================
-- Set default values for key phases (migrating hardcoded values to database)
-- =============================================================================

-- Stage 2 phases: quality_threshold = 0.75, max_retries = 3
-- Source: packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-6-summarization.ts
--   - Line 43: DEFAULT_SUMMARIZATION_CONFIG.qualityThreshold = 0.75
--   - Line 283: maxRetries = 3
UPDATE llm_model_config
SET quality_threshold = 0.75, max_retries = 3
WHERE phase_name LIKE 'stage_2_%' AND is_active = true;

-- Stage 5 sections: max_retries = 3
-- Source: packages/course-gen-platform/src/stages/stage5-generation/phases/generation-phases.ts
--   - Line 74: RETRY_ATTEMPTS_PER_SECTION = 3
UPDATE llm_model_config
SET max_retries = 3
WHERE phase_name = 'stage_5_sections' AND is_active = true;

-- Stage 6 lesson content: timeout_ms = 300000 (5 minutes)
-- Source: packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts
--   - Line 156: JOB_TIMEOUT_MS = 300_000
UPDATE llm_model_config
SET timeout_ms = 300000
WHERE phase_name LIKE 'stage_6_%' AND is_active = true;
