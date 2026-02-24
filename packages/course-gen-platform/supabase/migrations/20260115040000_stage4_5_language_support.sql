-- ============================================================
-- Stage 4-5 Language Support Migration
-- ============================================================
--
-- This migration:
-- 1. Removes unused records (code uses per-phase names, not language-suffixed names)
-- 2. Adds missing tier records for Stage 4 phases
-- 3. Adds missing tier records for Stage 5 phases
-- 4. Enables language-aware model selection via fetchPhaseConfigFromDb
--
-- Code changes (already applied):
-- - fetchPhaseConfigFromDb now accepts language parameter with cascading lookup
-- - Stage 4 phases pass language to getModelForPhase
-- - Stage 5 uses getModelForPhase('stage_5_metadata'/'stage_5_sections')
--

-- ============================================================
-- STAGE 4: Cleanup unused + add missing tiers
-- ============================================================

-- Delete unused Stage 4 records (code calls getModelForPhase('stage_4_classification'), not 'stage_4_standard_ru')
DELETE FROM llm_model_config
WHERE phase_name IN (
  'stage_4_standard_ru', 'stage_4_standard_en',
  'stage_4_extended_ru', 'stage_4_extended_en'
);

-- Add extended tier for classification, scope, synthesis (currently only have standard)
-- Using gemini-2.5-flash for extended context handling
INSERT INTO llm_model_config (config_type, phase_name, stage_number, language, context_tier, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, is_active)
VALUES
  ('global', 'stage_4_classification', 4, 'any', 'extended', 'google/gemini-2.5-flash', 'xiaomi/mimo-v2-flash:free', 0.7, 4096, 128000, true),
  ('global', 'stage_4_scope', 4, 'any', 'extended', 'google/gemini-2.5-flash', 'xiaomi/mimo-v2-flash:free', 0.7, 4096, 128000, true),
  ('global', 'stage_4_synthesis', 4, 'any', 'extended', 'google/gemini-2.5-flash', 'xiaomi/mimo-v2-flash:free', 0.7, 6000, 128000, true)
ON CONFLICT (phase_name, language, context_tier) DO NOTHING;

-- Add standard tier for expert (currently only has extended)
INSERT INTO llm_model_config (config_type, phase_name, stage_number, language, context_tier, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, is_active)
VALUES
  ('global', 'stage_4_expert', 4, 'any', 'standard', 'xiaomi/mimo-v2-flash:free', 'google/gemini-2.5-flash', 0.5, 8000, 128000, true)
ON CONFLICT (phase_name, language, context_tier) DO NOTHING;

-- ============================================================
-- STAGE 5: Cleanup unused + add missing tiers
-- ============================================================

-- Delete unused Stage 5 records (code now uses getModelForPhase('stage_5_metadata'/'stage_5_sections'))
DELETE FROM llm_model_config
WHERE phase_name IN (
  'stage_5_standard_ru', 'stage_5_standard_en',
  'stage_5_extended_ru', 'stage_5_extended_en'
);

-- Add extended tier for metadata and sections (currently only have standard)
INSERT INTO llm_model_config (config_type, phase_name, stage_number, language, context_tier, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, is_active)
VALUES
  ('global', 'stage_5_metadata', 5, 'any', 'extended', 'google/gemini-2.5-flash', 'moonshotai/kimi-k2-0905', 0.7, 4096, 128000, true),
  ('global', 'stage_5_sections', 5, 'any', 'extended', 'google/gemini-2.5-flash', 'moonshotai/kimi-k2-0905', 0.7, 8000, 128000, true)
ON CONFLICT (phase_name, language, context_tier) DO NOTHING;

-- Add language-specific records for Stage 5 phases (RU/EN optimized models)
-- RU: Qwen3 235B for best Russian quality
-- EN: DeepSeek v3.1 Terminus for best English quality
INSERT INTO llm_model_config (config_type, phase_name, stage_number, language, context_tier, model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, is_active)
VALUES
  -- Stage 5 Metadata - language-specific
  ('global', 'stage_5_metadata', 5, 'ru', 'standard', 'qwen/qwen3-235b-a22b-2507', 'moonshotai/kimi-k2-0905', 0.7, 4096, 128000, true),
  ('global', 'stage_5_metadata', 5, 'en', 'standard', 'deepseek/deepseek-v3.1-terminus', 'moonshotai/kimi-k2-0905', 0.7, 4096, 128000, true),
  ('global', 'stage_5_metadata', 5, 'ru', 'extended', 'google/gemini-2.5-flash', 'qwen/qwen3-235b-a22b-2507', 0.7, 4096, 128000, true),
  ('global', 'stage_5_metadata', 5, 'en', 'extended', 'google/gemini-2.5-flash', 'deepseek/deepseek-v3.1-terminus', 0.7, 4096, 128000, true),
  -- Stage 5 Sections - language-specific
  ('global', 'stage_5_sections', 5, 'ru', 'standard', 'qwen/qwen3-235b-a22b-2507', 'moonshotai/kimi-k2-0905', 0.7, 8000, 128000, true),
  ('global', 'stage_5_sections', 5, 'en', 'standard', 'deepseek/deepseek-v3.1-terminus', 'moonshotai/kimi-k2-0905', 0.7, 8000, 128000, true),
  ('global', 'stage_5_sections', 5, 'ru', 'extended', 'google/gemini-2.5-flash', 'qwen/qwen3-235b-a22b-2507', 0.7, 8000, 128000, true),
  ('global', 'stage_5_sections', 5, 'en', 'extended', 'google/gemini-2.5-flash', 'deepseek/deepseek-v3.1-terminus', 0.7, 8000, 128000, true)
ON CONFLICT (phase_name, language, context_tier) DO NOTHING;

-- ============================================================
-- Verification query (run manually to verify)
-- ============================================================
-- SELECT phase_name, language, context_tier, model_id, is_active
-- FROM llm_model_config
-- WHERE stage_number IN (4, 5)
-- ORDER BY stage_number, phase_name, language, context_tier;
