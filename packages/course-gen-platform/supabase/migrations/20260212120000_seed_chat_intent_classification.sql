-- Migration: Add chat_intent_classification phase to llm_model_config
-- Purpose:
--   1. Update CHECK constraint to include 'chat_intent_classification'
--   2. Seed a global config row for the new phase
--
-- chat_intent_classification: Fast, low-token classification of user intent
-- in the course chat feature (refine vs regenerate vs navigate, etc.)
-- Uses mimo-v2-flash (cheap/fast) with qwen3-235b fallback.
--
-- ROLLBACK PROCEDURE (manual):
--   1. DELETE FROM llm_model_config WHERE phase_name = 'chat_intent_classification';
--   2. Restore previous constraint from 20260211190000_add_chat_model_configs.sql

-- ============================================================================
-- Step 1: Update CHECK constraint to include chat_intent_classification
-- ============================================================================

ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check CHECK (
  phase_name = ANY (ARRAY[
    -- Chat phases (original)
    'chat_full_regeneration', 'chat_global_guidance', 'chat_node_refinement',
    -- Chat phases (stage-specific refinement)
    'chat_stage_5_refinement', 'chat_stage_6_refinement',
    -- Chat intent classification (new)
    'chat_intent_classification',
    -- Inline operations
    'inline_block_regeneration', 'inline_element_crud',
    -- Global / emergency / fallback
    'emergency', 'global_default', 'quality_fallback',
    -- Stage 2
    'stage_2_summarization',
    -- Stage 3
    'stage_3_classification',
    -- Stage 4
    'stage_4_clarifying', 'stage_4_classification', 'stage_4_expert', 'stage_4_scope', 'stage_4_synthesis',
    -- Stage 5
    'stage_5_escalation', 'stage_5_metadata',
    'stage_5_simple', 'stage_5_normal', 'stage_5_complex',
    -- Stage 6
    'stage_6_arbiter', 'stage_6_delta_judge', 'stage_6_judge',
    'stage_6_patcher', 'stage_6_rag_planning', 'stage_6_refinement', 'stage_6_section_expander',
    -- Stage 7
    'stage_7_audio', 'stage_7_card', 'stage_7_cover', 'stage_7_presentation', 'stage_7_quiz', 'stage_7_video',
    -- Legacy phase aliases (used by some older configs)
    'phase_1_classification', 'phase_2_scope', 'phase_3_expert', 'phase_4_synthesis', 'phase_6_rag_planning'
  ])
);

COMMENT ON CONSTRAINT llm_model_config_phase_name_check ON llm_model_config IS
  'Valid phase names including chat_intent_classification (2026-02-12)';

-- ============================================================================
-- Step 2: Seed chat_intent_classification config
-- ============================================================================

INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    stage_number, language, context_tier, max_retries
) VALUES (
    gen_random_uuid(), 'global', 'chat_intent_classification',
    'xiaomi/mimo-v2-flash', 'qwen/qwen3-235b-a22b-2507',
    0.1, 200, true, 1,
    0, 'any', 'standard', 3
) ON CONFLICT DO NOTHING;
