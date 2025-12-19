-- Migration: Fix phase_name constraint to match TypeScript PhaseName type
-- Purpose: Allow stage_4_* names and ensure constraint matches code
-- Date: 2025-12-19
-- Related: .tmp/current/fix-model-config-tier-selection.md (Issue 4)
--
-- Problem: Database CHECK constraint was missing stage_4_* names and other phases
-- from TypeScript PhaseName type. Database was manually updated but migrations
-- didn't reflect this change.

-- ============================================================================
-- Update phase_name constraint to match TypeScript PhaseName type
-- ============================================================================

-- Drop existing constraint
ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

-- Add updated constraint with ALL phase names from TypeScript PhaseName type
-- Source: packages/shared-types/src/model-config.ts
ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check
  CHECK (phase_name = ANY (ARRAY[
    -- Stage 2: Document Processing (Summarization)
    'stage_2_summarization',
    'stage_2_standard_ru',
    'stage_2_standard_en',
    'stage_2_extended_ru',
    'stage_2_extended_en',
    -- Stage 3: Classification
    'stage_3_classification',
    -- Stage 4: Analysis (NEW names - previously phase_1-4)
    'stage_4_classification',
    'stage_4_scope',
    'stage_4_expert',
    'stage_4_synthesis',
    -- Stage 5: Structure Generation
    'stage_5_metadata',
    'stage_5_sections',
    -- Stage 6: Lesson Content
    'stage_6_rag_planning',
    'stage_6_judge',
    'stage_6_refinement',
    -- Stage 6: Targeted Refinement
    'stage_6_arbiter',
    'stage_6_patcher',
    'stage_6_section_expander',
    'stage_6_delta_judge',
    -- Special
    'emergency',
    'quality_fallback'
  ]::text[]));

-- ============================================================================
-- Migrate any old phase_* names to stage_4_* names
-- Note: These updates are idempotent (will affect 0 rows if already migrated)
-- ============================================================================

UPDATE llm_model_config SET phase_name = 'stage_4_classification' WHERE phase_name = 'phase_1_classification';
UPDATE llm_model_config SET phase_name = 'stage_4_scope' WHERE phase_name = 'phase_2_scope';
UPDATE llm_model_config SET phase_name = 'stage_4_expert' WHERE phase_name = 'phase_3_expert';
UPDATE llm_model_config SET phase_name = 'stage_4_synthesis' WHERE phase_name = 'phase_4_synthesis';
UPDATE llm_model_config SET phase_name = 'stage_6_rag_planning' WHERE phase_name = 'phase_6_rag_planning';

-- ============================================================================
-- Comment
-- ============================================================================

COMMENT ON CONSTRAINT llm_model_config_phase_name_check ON llm_model_config IS
  'Ensures phase_name matches TypeScript PhaseName type from packages/shared-types/src/model-config.ts';
