-- ============================================================
-- Stage 5: Tier 1 and Escalation Model Configs
-- ============================================================
--
-- This migration adds configurable models for Stage 5:
-- 1. stage_5_tier1: Standard complexity sections (replaces hardcoded MODELS.tier1_oss120b)
-- 2. stage_5_escalation: Retry/escalation models (replaces hardcoded language-specific selection)
--
-- Code changes:
-- - model-selector.ts: Uses getModelForPhase('stage_5_tier1') instead of hardcoded
-- - generator-core.ts: Uses getModelForPhase('stage_5_escalation') instead of hardcoded
--
-- Admin panel: Change models via Admin -> LLM Config -> stage_5_tier1 / stage_5_escalation
--

-- ============================================================
-- Update CHECK constraint to include new phase names
-- ============================================================

ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check CHECK (phase_name = ANY (ARRAY[
  'global_default'::text,
  'stage_2_summarization'::text, 'stage_2_standard_ru'::text, 'stage_2_standard_en'::text, 'stage_2_extended_ru'::text, 'stage_2_extended_en'::text,
  'stage_3_classification'::text,
  'stage_4_classification'::text, 'stage_4_scope'::text, 'stage_4_expert'::text, 'stage_4_synthesis'::text, 'stage_4_standard_ru'::text, 'stage_4_standard_en'::text, 'stage_4_extended_ru'::text, 'stage_4_extended_en'::text,
  'stage_5_metadata'::text, 'stage_5_sections'::text, 'stage_5_tier1'::text, 'stage_5_escalation'::text, 'stage_5_standard_ru'::text, 'stage_5_standard_en'::text, 'stage_5_extended_ru'::text, 'stage_5_extended_en'::text,
  'stage_6_rag_planning'::text, 'stage_6_judge'::text, 'stage_6_refinement'::text, 'stage_6_arbiter'::text, 'stage_6_patcher'::text, 'stage_6_section_expander'::text, 'stage_6_delta_judge'::text, 'stage_6_standard_ru'::text, 'stage_6_standard_en'::text, 'stage_6_extended_ru'::text, 'stage_6_extended_en'::text,
  'stage_7_cover'::text, 'stage_7_card'::text, 'stage_7_video'::text, 'stage_7_audio'::text, 'stage_7_quiz'::text, 'stage_7_presentation'::text, 'stage_7_document'::text,
  'chat_node_refinement'::text, 'chat_global_guidance'::text, 'chat_full_regeneration'::text,
  'emergency'::text, 'quality_fallback'::text
]));

-- ============================================================
-- STAGE 5 TIER 1: Standard complexity sections
-- ============================================================
-- Used when complexity < 0.75 AND criticality < 0.80
-- Previously hardcoded as MODELS.tier1_oss120b

INSERT INTO llm_model_config (config_type, phase_name, stage_number, language, context_tier, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, is_active)
VALUES
  -- Standard tier: GPT OSS 120B with Kimi fallback
  ('global', 'stage_5_tier1', 5, 'any', 'standard', 'openai/gpt-oss-120b', 'moonshotai/kimi-k2-0905', 0.7, 30000, 128000, true),
  -- Extended tier: Gemini 2.5 Flash for large contexts
  ('global', 'stage_5_tier1', 5, 'any', 'extended', 'google/gemini-2.5-flash', 'openai/gpt-oss-120b', 0.7, 30000, 128000, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- STAGE 5 ESCALATION: Retry/quality escalation models
-- ============================================================
-- Used when Tier 1 fails and retry is needed
-- Previously hardcoded as MODELS.ru_lessons_primary / MODELS.en_lessons_primary

INSERT INTO llm_model_config (config_type, phase_name, stage_number, language, context_tier, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, is_active)
VALUES
  -- Russian: Qwen3 235B (best for Russian quality)
  ('global', 'stage_5_escalation', 5, 'ru', 'standard', 'qwen/qwen3-235b-a22b-2507', 'moonshotai/kimi-k2-0905', 0.7, 30000, 128000, true),
  -- English: DeepSeek v3.1 Terminus (best for English quality)
  ('global', 'stage_5_escalation', 5, 'en', 'standard', 'deepseek/deepseek-v3.1-terminus', 'moonshotai/kimi-k2-0905', 0.7, 30000, 128000, true),
  -- Any/fallback: Kimi K2 (universal fallback)
  ('global', 'stage_5_escalation', 5, 'any', 'standard', 'moonshotai/kimi-k2-0905', 'google/gemini-2.5-flash', 0.7, 30000, 128000, true),
  -- Extended tiers for large contexts
  ('global', 'stage_5_escalation', 5, 'ru', 'extended', 'google/gemini-2.5-flash', 'qwen/qwen3-235b-a22b-2507', 0.7, 30000, 128000, true),
  ('global', 'stage_5_escalation', 5, 'en', 'extended', 'google/gemini-2.5-flash', 'deepseek/deepseek-v3.1-terminus', 0.7, 30000, 128000, true),
  ('global', 'stage_5_escalation', 5, 'any', 'extended', 'google/gemini-2.5-flash', 'moonshotai/kimi-k2-0905', 0.7, 30000, 128000, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Verification query (run manually to verify)
-- ============================================================
-- SELECT phase_name, language, context_tier, model_id, fallback_model_id, is_active
-- FROM llm_model_config
-- WHERE phase_name IN ('stage_5_tier1', 'stage_5_escalation')
-- ORDER BY phase_name, language, context_tier;
