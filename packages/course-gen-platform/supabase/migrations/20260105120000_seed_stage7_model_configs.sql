-- Migration: Seed Stage 7 enrichment model configurations
--
-- Updates:
-- 1. Adds Stage 7 phases to llm_model_config_phase_name_check constraint
-- 2. Inserts 7 new model configs for enrichment activities
--
-- Stage 7 Enrichments:
-- - cover: Image generation (Gemini 2.5 Flash Image Preview, 16:9, $0.038)
-- - card: Image generation (GPT-5 Image Mini, 1:1 1024x1024, $0.007)
-- - video: Video script generation (MiMo V2 Flash)
-- - audio: TTS script generation (MiMo V2 Flash)
-- - quiz: Quiz question generation (MiMo V2 Flash)
-- - presentation: Slide content generation (MiMo V2 Flash)

-- Step 1: Drop the existing check constraint
ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

-- Step 2: Add updated check constraint with Stage 6 tier phases and Stage 7 phases
ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check
CHECK (phase_name = ANY (ARRAY[
  -- Global
  'global_default'::text,
  -- Stage 2
  'stage_2_summarization'::text,
  'stage_2_standard_ru'::text, 'stage_2_standard_en'::text,
  'stage_2_extended_ru'::text, 'stage_2_extended_en'::text,
  -- Stage 3
  'stage_3_classification'::text,
  -- Stage 4
  'stage_4_classification'::text, 'stage_4_scope'::text, 'stage_4_expert'::text, 'stage_4_synthesis'::text,
  'stage_4_standard_ru'::text, 'stage_4_standard_en'::text,
  'stage_4_extended_ru'::text, 'stage_4_extended_en'::text,
  -- Stage 5
  'stage_5_metadata'::text, 'stage_5_sections'::text,
  'stage_5_standard_ru'::text, 'stage_5_standard_en'::text,
  'stage_5_extended_ru'::text, 'stage_5_extended_en'::text,
  -- Stage 6
  'stage_6_rag_planning'::text, 'stage_6_judge'::text, 'stage_6_refinement'::text,
  'stage_6_arbiter'::text, 'stage_6_patcher'::text, 'stage_6_section_expander'::text, 'stage_6_delta_judge'::text,
  'stage_6_standard_ru'::text, 'stage_6_standard_en'::text,
  'stage_6_extended_ru'::text, 'stage_6_extended_en'::text,
  -- Stage 7: Enrichments
  'stage_7_cover'::text, 'stage_7_card'::text,
  'stage_7_video'::text, 'stage_7_audio'::text,
  'stage_7_quiz'::text, 'stage_7_presentation'::text, 'stage_7_document'::text,
  -- Special
  'emergency'::text, 'quality_fallback'::text
]));

-- Step 3: Insert Stage 7 model configurations
INSERT INTO llm_model_config (
    config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, language, context_tier, is_active,
    primary_display_name, fallback_display_name
) VALUES
-- Cover (16:9 image generation for lesson covers)
('global', 'stage_7_cover', 'google/gemini-2.5-flash-image-preview', 'xiaomi/mimo-v2-flash:free',
 0.7, 1024, 'any', 'standard', true, 'Gemini 2.5 Flash Image', 'MiMo V2 Flash'),

-- Card (1:1 square image generation for thumbnails)
('global', 'stage_7_card', 'openai/gpt-5-image-mini', 'xiaomi/mimo-v2-flash:free',
 0.7, 1024, 'any', 'standard', true, 'GPT-5 Image Mini', 'MiMo V2 Flash'),

-- Video (script generation)
('global', 'stage_7_video', 'xiaomi/mimo-v2-flash:free', 'openai/gpt-4o-mini',
 0.7, 8000, 'any', 'standard', true, 'MiMo V2 Flash', 'GPT-4o Mini'),

-- Audio (TTS script generation)
('global', 'stage_7_audio', 'xiaomi/mimo-v2-flash:free', 'openai/gpt-4o-mini',
 0.7, 8000, 'any', 'standard', true, 'MiMo V2 Flash', 'GPT-4o Mini'),

-- Quiz (question generation)
('global', 'stage_7_quiz', 'xiaomi/mimo-v2-flash:free', 'openai/gpt-4o-mini',
 0.7, 4096, 'any', 'standard', true, 'MiMo V2 Flash', 'GPT-4o Mini'),

-- Presentation (slide content generation)
('global', 'stage_7_presentation', 'xiaomi/mimo-v2-flash:free', 'openai/gpt-4o-mini',
 0.7, 8000, 'any', 'standard', true, 'MiMo V2 Flash', 'GPT-4o Mini');

-- NOTE: stage_7_document NOT included - handler not implemented yet
-- Add when document-handler.ts is created

-- =============================================================================
-- ROLLBACK (if needed):
-- =============================================================================
-- DELETE FROM llm_model_config WHERE phase_name LIKE 'stage_7_%';
-- ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;
-- ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check
-- CHECK (phase_name = ANY (ARRAY[... previous constraint values ...]));
-- =============================================================================
