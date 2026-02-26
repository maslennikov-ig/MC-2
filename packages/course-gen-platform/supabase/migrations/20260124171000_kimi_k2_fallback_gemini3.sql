-- Migration: Обновить fallback модель для premium фаз на Gemini 3 Flash Preview
-- Заменяем google/gemini-2.5-flash на google/gemini-3-flash-preview

-- 1. stage_4_expert (standard tier)
UPDATE llm_model_config
SET fallback_model_id = 'google/gemini-3-flash-preview',
    updated_at = NOW()
WHERE phase_name = 'stage_4_expert'
  AND context_tier = 'standard'
  AND config_type = 'global'
  AND is_active = true;

-- 2. stage_4_synthesis (standard tier)
UPDATE llm_model_config
SET fallback_model_id = 'google/gemini-3-flash-preview',
    updated_at = NOW()
WHERE phase_name = 'stage_4_synthesis'
  AND context_tier = 'standard'
  AND config_type = 'global'
  AND is_active = true;

-- 3. stage_5_metadata (standard tier)
UPDATE llm_model_config
SET fallback_model_id = 'google/gemini-3-flash-preview',
    updated_at = NOW()
WHERE phase_name = 'stage_5_metadata'
  AND context_tier = 'standard'
  AND config_type = 'global'
  AND is_active = true;
