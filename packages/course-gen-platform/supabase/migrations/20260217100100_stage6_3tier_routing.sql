-- Migration: Add Stage 6 3-tier generation routing (simple/normal/complex)
-- Mirrors Stage 5 importance-based routing pattern for difficulty_level

-- Step 1: Drop and re-create CHECK constraint to allow new phase names
ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check CHECK (
  phase_name IN (
    'global_default',
    'stage_2_summarization', 'stage_2_standard_ru', 'stage_2_standard_en', 'stage_2_extended_ru', 'stage_2_extended_en',
    'stage_3_classification',
    'stage_4_clarifying', 'stage_4_classification', 'stage_4_scope', 'stage_4_expert', 'stage_4_synthesis',
    'stage_4_standard_ru', 'stage_4_standard_en', 'stage_4_extended_ru', 'stage_4_extended_en',
    'stage_5_metadata', 'stage_5_sections', 'stage_5_tier1', 'stage_5_escalation',
    'stage_5_simple', 'stage_5_normal', 'stage_5_complex',
    'stage_5_standard_ru', 'stage_5_standard_en', 'stage_5_extended_ru', 'stage_5_extended_en',
    'stage_6_judge', 'stage_6_refinement', 'stage_6_rag_planning',
    'stage_6_simple', 'stage_6_normal', 'stage_6_complex',
    'stage_6_standard_ru', 'stage_6_standard_en', 'stage_6_extended_ru', 'stage_6_extended_en',
    'stage_6_arbiter', 'stage_6_patcher', 'stage_6_section_expander', 'stage_6_delta_judge',
    'stage_7_cover', 'stage_7_card', 'stage_7_video', 'stage_7_audio', 'stage_7_quiz', 'stage_7_presentation', 'stage_7_document',
    'chat_intent_classification', 'chat_node_refinement', 'chat_global_guidance', 'chat_full_regeneration',
    'chat_stage_5_refinement', 'chat_stage_6_refinement',
    'inline_block_regeneration', 'inline_element_crud',
    'emergency', 'quality_fallback'
  )
);

-- Step 2: Insert 6 rows for Stage 6 3-tier routing (3 tiers × 2 context_tiers)
-- Uses INSERT ... WHERE NOT EXISTS for idempotency (safe to re-run)
INSERT INTO llm_model_config (config_type, phase_name, model_id, fallback_model_id, temperature, max_tokens, is_active, language, context_tier, stage_number, max_context_tokens, max_retries, timeout_ms)
SELECT v.* FROM (VALUES
  -- stage_6_simple: standard
  ('global', 'stage_6_simple', 'moonshotai/kimi-k2-thinking', 'google/gemini-2.5-flash', 0.70, 8000, true, 'any', 'standard', 6, 128000, 3, 300000),
  -- stage_6_simple: extended
  ('global', 'stage_6_simple', 'google/gemini-2.5-flash', 'moonshotai/kimi-k2-thinking', 0.70, 8000, true, 'any', 'extended', 6, 128000, 3, 300000),
  -- stage_6_normal: standard
  ('global', 'stage_6_normal', 'moonshotai/kimi-k2-thinking', 'google/gemini-2.5-flash', 0.70, 8000, true, 'any', 'standard', 6, 128000, 3, 300000),
  -- stage_6_normal: extended
  ('global', 'stage_6_normal', 'google/gemini-2.5-flash', 'moonshotai/kimi-k2-thinking', 0.70, 8000, true, 'any', 'extended', 6, 128000, 3, 300000),
  -- stage_6_complex: standard (premium model)
  ('global', 'stage_6_complex', 'qwen/qwen3.5-plus-02-15', 'moonshotai/kimi-k2-thinking', 0.70, 8000, true, 'any', 'standard', 6, 128000, 3, 300000),
  -- stage_6_complex: extended
  ('global', 'stage_6_complex', 'moonshotai/kimi-k2-thinking', 'qwen/qwen3.5-plus-02-15', 0.70, 8000, true, 'any', 'extended', 6, 128000, 3, 300000)
) AS v(config_type, phase_name, model_id, fallback_model_id, temperature, max_tokens, is_active, language, context_tier, stage_number, max_context_tokens, max_retries, timeout_ms)
WHERE NOT EXISTS (
  SELECT 1 FROM llm_model_config m
  WHERE m.config_type = v.config_type
    AND m.phase_name = v.phase_name
    AND m.context_tier = v.context_tier
    AND m.language = v.language
    AND m.is_active = true
);
