-- Migration: Fix chat config duplicates + seed chat_intent_classification
-- Purpose:
--   1. Update CHECK constraint to include chat_intent_classification
--   2. Delete duplicate rows for chat_stage_5/6_refinement (caused by double-applied migration)
--   3. Seed chat_intent_classification config
--
-- Root cause: Migration 20260211_add_chat_model_configs was applied twice
-- (versions 20260211171702 and 20260211172808), creating duplicate rows.
-- Migration 20260212_seed_chat_intent_classification was never applied.

-- ============================================================================
-- Step 1: Update CHECK constraint to include chat_intent_classification
-- ============================================================================

ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check CHECK (
  phase_name = ANY (ARRAY[
    -- Chat phases
    'chat_full_regeneration', 'chat_global_guidance', 'chat_node_refinement',
    'chat_stage_5_refinement', 'chat_stage_6_refinement',
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
    -- Legacy phase aliases
    'phase_1_classification', 'phase_2_scope', 'phase_3_expert', 'phase_4_synthesis', 'phase_6_rag_planning'
  ])
);

COMMENT ON CONSTRAINT llm_model_config_phase_name_check ON llm_model_config IS
  'Valid phase names including chat_intent_classification (2026-02-14 fix)';

-- ============================================================================
-- Step 2: Delete duplicate chat_stage_5_refinement (keep oldest)
-- ============================================================================

DELETE FROM llm_model_config
WHERE phase_name = 'chat_stage_5_refinement'
  AND id NOT IN (
    SELECT id FROM llm_model_config
    WHERE phase_name = 'chat_stage_5_refinement'
    ORDER BY created_at ASC
    LIMIT 1
  );

-- ============================================================================
-- Step 3: Delete duplicate chat_stage_6_refinement (keep oldest)
-- ============================================================================

DELETE FROM llm_model_config
WHERE phase_name = 'chat_stage_6_refinement'
  AND id NOT IN (
    SELECT id FROM llm_model_config
    WHERE phase_name = 'chat_stage_6_refinement'
    ORDER BY created_at ASC
    LIMIT 1
  );

-- ============================================================================
-- Step 4: Seed chat_intent_classification (idempotent)
-- ============================================================================

INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    stage_number, language, context_tier, max_retries
) SELECT
    gen_random_uuid(), 'global', 'chat_intent_classification',
    'xiaomi/mimo-v2-flash', 'qwen/qwen3-235b-a22b-2507',
    0.1, 200, true, 1,
    NULL, 'any', 'standard', 3
WHERE NOT EXISTS (
    SELECT 1 FROM llm_model_config
    WHERE phase_name = 'chat_intent_classification' AND is_active = true
);
