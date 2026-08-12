-- Model routing refresh against the live OpenRouter catalogue (snapshot 2026-08-12).
--
-- Decisions recorded in mc2-t6iec:
--   simple work   -> ~deepseek/deepseek-v4-flash-latest  ($0.08/$0.252 per 1M, 1M ctx)
--   complex work  -> openai/gpt-5.6-luna                 ($0.10/$0.600 per 1M, 1.05M ctx)
--   z-ai/glm-5    -> z-ai/glm-5.2
--   judges keep three distinct vendors so CLEV voting stays independent
--   `emergency` stays on google/gemini-3-flash-preview: an OpenAI outage must not
--   take out both the primary path and its emergency fallback.
--
-- The `~` in `~deepseek/deepseek-v4-flash-latest` is part of the OpenRouter id
-- (an alias that always redirects to the newest V4 Flash), not a typo.
--
-- Reasoning is deliberately NOT enabled here. It needs its own column and a
-- separate token budget (mc2-v9xom): OpenRouter bills reasoning tokens out of
-- max_tokens, so switching it on at today's budgets would truncate answers.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Judges: three roles, three vendors (OpenAI / Z.ai / MiniMax).
--    Done before the general rules so the blanket remap cannot flatten them.
-- ---------------------------------------------------------------------------
UPDATE llm_model_config
SET model_id = 'openai/gpt-5.6-luna', updated_at = now(), version = version + 1
WHERE is_active AND phase_name = 'stage_6_judge' AND judge_role = 'primary';

UPDATE llm_model_config
SET model_id = 'z-ai/glm-5.2', updated_at = now(), version = version + 1
WHERE is_active AND phase_name = 'stage_6_judge' AND judge_role = 'secondary';

UPDATE llm_model_config
SET model_id = 'minimax/minimax-m3', updated_at = now(), version = version + 1
WHERE is_active AND phase_name = 'stage_6_judge' AND judge_role = 'tiebreaker';

-- ---------------------------------------------------------------------------
-- 2. Simple tier.
-- ---------------------------------------------------------------------------
UPDATE llm_model_config
SET model_id = '~deepseek/deepseek-v4-flash-latest', updated_at = now(), version = version + 1
WHERE is_active AND judge_role IS NULL AND phase_name <> 'emergency'
  AND model_id = 'deepseek/deepseek-v4-flash';

-- ---------------------------------------------------------------------------
-- 3. Complex tier. Retires deepseek-v4-pro, kimi-k2-thinking, kimi-k2.5,
--    qwen3.7-plus, qwen3-235b-a22b-2507, gemini-3.5-flash and the
--    extended-tier gemini-3-flash-preview.
-- ---------------------------------------------------------------------------
UPDATE llm_model_config
SET model_id = 'openai/gpt-5.6-luna', updated_at = now(), version = version + 1
WHERE is_active AND judge_role IS NULL AND phase_name <> 'emergency'
  AND model_id IN (
    'deepseek/deepseek-v4-pro',
    'moonshotai/kimi-k2-thinking',
    'moonshotai/kimi-k2.5',
    'qwen/qwen3.7-plus',
    'qwen/qwen3-235b-a22b-2507',
    'google/gemini-3.5-flash',
    'google/gemini-3-flash-preview'
  );

-- ---------------------------------------------------------------------------
-- 4. GLM upgrade for any non-judge row still on glm-5.
-- ---------------------------------------------------------------------------
UPDATE llm_model_config
SET model_id = 'z-ai/glm-5.2', updated_at = now(), version = version + 1
WHERE is_active AND judge_role IS NULL AND model_id = 'z-ai/glm-5';

-- ---------------------------------------------------------------------------
-- 5. global_default: standard is the cheap catch-all, extended the wide-context
--    one. The previous rows had this the wrong way round.
-- ---------------------------------------------------------------------------
UPDATE llm_model_config
SET model_id = '~deepseek/deepseek-v4-flash-latest', updated_at = now(), version = version + 1
WHERE is_active AND phase_name = 'global_default' AND context_tier = 'standard';

UPDATE llm_model_config
SET model_id = 'openai/gpt-5.6-luna', updated_at = now(), version = version + 1
WHERE is_active AND phase_name = 'global_default' AND context_tier = 'extended';

-- ---------------------------------------------------------------------------
-- 6. Fallbacks must cross vendors, otherwise a provider outage takes the
--    fallback down with the primary. Text phases only; images handled below.
-- ---------------------------------------------------------------------------
UPDATE llm_model_config
SET fallback_model_id = '~deepseek/deepseek-v4-flash-latest', updated_at = now(), version = version + 1
WHERE is_active AND fallback_model_id IS NOT NULL
  AND model_id IN ('openai/gpt-5.6-luna', 'z-ai/glm-5.2')
  AND phase_name NOT IN ('stage_7_card', 'stage_7_cover');

UPDATE llm_model_config
SET fallback_model_id = 'openai/gpt-5.6-luna', updated_at = now(), version = version + 1
WHERE is_active AND fallback_model_id IS NOT NULL
  AND model_id = '~deepseek/deepseek-v4-flash-latest'
  AND phase_name NOT IN ('stage_7_card', 'stage_7_cover');

UPDATE llm_model_config
SET fallback_model_id = '~deepseek/deepseek-v4-flash-latest', updated_at = now(), version = version + 1
WHERE is_active AND fallback_model_id IS NOT NULL
  AND model_id = 'minimax/minimax-m3';

-- ---------------------------------------------------------------------------
-- 7. Image phases fell back to a text model, which cannot produce an image.
--    Cross-fall them onto each other instead.
-- ---------------------------------------------------------------------------
UPDATE llm_model_config
SET fallback_model_id = 'google/gemini-2.5-flash-image', updated_at = now(), version = version + 1
WHERE is_active AND phase_name = 'stage_7_card' AND model_id = 'openai/gpt-5-image-mini';

UPDATE llm_model_config
SET fallback_model_id = 'openai/gpt-5-image-mini', updated_at = now(), version = version + 1
WHERE is_active AND phase_name = 'stage_7_cover' AND model_id = 'google/gemini-2.5-flash-image';

-- ---------------------------------------------------------------------------
-- 8. Settings that exceeded the provider's own limits (mc2-d2g3c).
--    gemini-2.5-flash-image has a 32768 total context and emits up to 8192,
--    so the input budget cannot be the platform-wide 128000 default.
-- ---------------------------------------------------------------------------
UPDATE llm_model_config
SET max_context_tokens = 24000, updated_at = now(), version = version + 1
WHERE is_active AND phase_name = 'stage_7_cover'
  AND model_id = 'google/gemini-2.5-flash-image'
  AND max_context_tokens > 24000;

COMMIT;
