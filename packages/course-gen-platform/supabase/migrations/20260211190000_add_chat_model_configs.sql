-- Migration: Add chat stage-specific refinement and inline operation model configs
-- Purpose:
--   1. Add new phase names to the CHECK constraint:
--      - chat_stage_5_refinement: Chat-driven refinement for Stage 5 content
--      - chat_stage_6_refinement: Chat-driven refinement for Stage 6 content
--      - inline_block_regeneration: Regenerate individual content blocks in-place
--      - inline_element_crud: Add/edit/delete elements within a content block
--   2. Insert model config rows for the new phases
--   3. Update existing chat phases to use kimi-k2 models
--   4. Ensure existing chat phases have rows (idempotent inserts)

-- ============================================================================
-- Step 1: Drop old constraint and add updated one with new phase names
-- ============================================================================

ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check CHECK (
  phase_name = ANY (ARRAY[
    -- Chat phases (original)
    'chat_full_regeneration', 'chat_global_guidance', 'chat_node_refinement',
    -- Chat phases (new stage-specific refinement)
    'chat_stage_5_refinement', 'chat_stage_6_refinement',
    -- Inline operations (new)
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
  'Valid phase names including chat stage-specific refinement and inline operation phases (2026-02-11)';

-- ============================================================================
-- Step 2: Insert new chat stage-specific refinement configs
-- ============================================================================

-- Chat Stage 5 refinement: kimi-k2 primary, kimi-k2.5 fallback
-- Used for chat-driven edits to Stage 5 (lesson content generation) output
INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    stage_number, language, context_tier, max_retries
) VALUES (
    gen_random_uuid(), 'global', 'chat_stage_5_refinement',
    'moonshotai/kimi-k2-0905', 'moonshotai/kimi-k2.5',
    0.70, 8192, true, 1,
    5, 'any', 'standard', 3
);

-- Chat Stage 6 refinement: deepseek-v3.2 primary, qwen3-235b fallback
-- Used for chat-driven edits to Stage 6 (quality refinement) output
INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    stage_number, language, context_tier, max_retries
) VALUES (
    gen_random_uuid(), 'global', 'chat_stage_6_refinement',
    'deepseek/deepseek-v3.2', 'qwen/qwen3-235b-a22b-2507',
    0.70, 8192, true, 1,
    6, 'any', 'standard', 3
);

-- ============================================================================
-- Step 3: Update existing chat phases to use kimi-k2 models
-- ============================================================================

UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-0905', fallback_model_id = 'moonshotai/kimi-k2.5'
WHERE phase_name = 'chat_node_refinement' AND is_active = true;

UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-0905', fallback_model_id = 'moonshotai/kimi-k2.5'
WHERE phase_name = 'chat_global_guidance' AND is_active = true;

UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-0905', fallback_model_id = 'moonshotai/kimi-k2.5'
WHERE phase_name = 'chat_full_regeneration' AND is_active = true;

-- ============================================================================
-- Step 4: Ensure existing chat phases have rows (idempotent)
-- If rows were somehow missing, insert them with kimi-k2 models
-- ============================================================================

-- chat_node_refinement: insert if missing
INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    language, context_tier, max_retries
)
SELECT
    gen_random_uuid(), 'global', 'chat_node_refinement',
    'moonshotai/kimi-k2-0905', 'moonshotai/kimi-k2.5',
    0.70, 8192, true, 1,
    'any', 'standard', 3
WHERE NOT EXISTS (
    SELECT 1 FROM llm_model_config
    WHERE phase_name = 'chat_node_refinement' AND is_active = true
);

-- chat_global_guidance: insert if missing
INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    language, context_tier, max_retries
)
SELECT
    gen_random_uuid(), 'global', 'chat_global_guidance',
    'moonshotai/kimi-k2-0905', 'moonshotai/kimi-k2.5',
    0.70, 8192, true, 1,
    'any', 'standard', 3
WHERE NOT EXISTS (
    SELECT 1 FROM llm_model_config
    WHERE phase_name = 'chat_global_guidance' AND is_active = true
);

-- chat_full_regeneration: insert if missing
INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    language, context_tier, max_retries
)
SELECT
    gen_random_uuid(), 'global', 'chat_full_regeneration',
    'moonshotai/kimi-k2-0905', 'moonshotai/kimi-k2.5',
    0.70, 8192, true, 1,
    'any', 'standard', 3
WHERE NOT EXISTS (
    SELECT 1 FROM llm_model_config
    WHERE phase_name = 'chat_full_regeneration' AND is_active = true
);

-- ============================================================================
-- Step 5: Insert inline operation configs
-- ============================================================================

-- inline_block_regeneration: mimo-v2-flash primary, qwen3-235b fallback
-- Used for regenerating a single block of content in-place (fast, cheap model)
INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    stage_number, language, context_tier, max_retries
) VALUES (
    gen_random_uuid(), 'global', 'inline_block_regeneration',
    'xiaomi/mimo-v2-flash', 'qwen/qwen3-235b-a22b-2507',
    0.70, 2000, true, 1,
    NULL, 'any', 'standard', 3
);

-- inline_element_crud: mimo-v2-flash primary, qwen3-235b fallback
-- Used for adding/editing/deleting individual elements within content blocks
INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    stage_number, language, context_tier, max_retries
) VALUES (
    gen_random_uuid(), 'global', 'inline_element_crud',
    'xiaomi/mimo-v2-flash', 'qwen/qwen3-235b-a22b-2507',
    0.70, 4000, true, 1,
    NULL, 'any', 'standard', 3
);
