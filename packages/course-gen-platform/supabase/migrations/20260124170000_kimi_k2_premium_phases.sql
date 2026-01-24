-- Migration: Внедрение KIMI K2 на ключевых этапах генерации
-- Заменяем xiaomi/mimo-v2-flash:free на moonshotai/kimi-k2-0905
-- для stage_4_expert, stage_4_synthesis, stage_5_metadata (только standard tier)
--
-- Обоснование:
-- - stage_4_expert: определяет глубину материала (~$0.020/курс)
-- - stage_4_synthesis: формирует Analysis Report (~$0.015/курс)
-- - stage_5_metadata: определяет структуру курса (~$0.012/курс)
-- ИТОГО: ~$0.047/курс дополнительно
--
-- Extended tier остаётся на Gemini 2.5 Flash (качественная модель)

-- 1. stage_4_expert (standard tier)
UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-0905',
    updated_at = NOW()
WHERE phase_name = 'stage_4_expert'
  AND context_tier = 'standard'
  AND config_type = 'global'
  AND is_active = true;

-- 2. stage_4_synthesis (standard tier)
UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-0905',
    updated_at = NOW()
WHERE phase_name = 'stage_4_synthesis'
  AND context_tier = 'standard'
  AND config_type = 'global'
  AND is_active = true;

-- 3. stage_5_metadata (standard tier)
UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-0905',
    updated_at = NOW()
WHERE phase_name = 'stage_5_metadata'
  AND context_tier = 'standard'
  AND config_type = 'global'
  AND is_active = true;
