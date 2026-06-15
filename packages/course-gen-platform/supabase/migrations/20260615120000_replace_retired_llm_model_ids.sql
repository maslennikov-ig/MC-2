-- Migration: replace retired OpenRouter model IDs in active LLM configuration.
-- Keeps historical migrations intact, but normalizes fresh databases to the
-- current runtime model matrix.

WITH replacements(old_id, new_id, display_name) AS (
  VALUES
    ('qwen/qwen3.5-plus-02-15', 'qwen/qwen3.7-plus', 'Qwen3.7 Plus'),
    ('deepseek/deepseek-v3.2', 'deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash'),
    ('openai/gpt-5.4', 'google/gemini-3.5-flash', 'Gemini 3.5 Flash'),
    ('minimax/minimax-m2.5', 'minimax/minimax-m3', 'Minimax M3'),
    ('openai/gpt-oss-120b', 'deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash')
)
UPDATE llm_model_config AS config
SET model_id = replacements.new_id,
    primary_display_name = CASE
      WHEN config.primary_display_name IS NOT NULL THEN replacements.display_name
      ELSE config.primary_display_name
    END
FROM replacements
WHERE config.model_id = replacements.old_id;

WITH replacements(old_id, new_id, display_name) AS (
  VALUES
    ('qwen/qwen3.5-plus-02-15', 'qwen/qwen3.7-plus', 'Qwen3.7 Plus'),
    ('deepseek/deepseek-v3.2', 'deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash'),
    ('openai/gpt-5.4', 'google/gemini-3.5-flash', 'Gemini 3.5 Flash'),
    ('minimax/minimax-m2.5', 'minimax/minimax-m3', 'Minimax M3'),
    ('openai/gpt-oss-120b', 'deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash')
)
UPDATE llm_model_config AS config
SET fallback_model_id = replacements.new_id,
    fallback_display_name = CASE
      WHEN config.fallback_display_name IS NOT NULL THEN replacements.display_name
      ELSE config.fallback_display_name
    END
FROM replacements
WHERE config.fallback_model_id = replacements.old_id;

UPDATE llm_model_config
SET fallback_model_id = 'qwen/qwen3-235b-a22b-2507',
    fallback_display_name = CASE
      WHEN fallback_display_name IS NOT NULL THEN 'Qwen3 235B A22B'
      ELSE fallback_display_name
    END
WHERE model_id = fallback_model_id
  AND model_id = 'deepseek/deepseek-v4-flash';

WITH display_names(model_id, display_name) AS (
  VALUES
    ('qwen/qwen3.7-plus', 'Qwen3.7 Plus'),
    ('deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash'),
    ('deepseek/deepseek-v4-pro', 'DeepSeek V4 Pro'),
    ('google/gemini-3.5-flash', 'Gemini 3.5 Flash'),
    ('google/gemini-3-flash-preview', 'Gemini 3 Flash Preview'),
    ('google/gemini-2.5-flash-image', 'Gemini 2.5 Flash Image'),
    ('openai/gpt-5-image-mini', 'GPT-5 Image Mini'),
    ('minimax/minimax-m3', 'Minimax M3'),
    ('qwen/qwen3-235b-a22b-2507', 'Qwen3 235B A22B'),
    ('moonshotai/kimi-k2-thinking', 'Kimi K2 Thinking'),
    ('moonshotai/kimi-k2.5', 'Kimi K2.5'),
    ('z-ai/glm-5', 'GLM-5')
)
UPDATE llm_model_config AS config
SET primary_display_name = display_names.display_name
FROM display_names
WHERE config.model_id = display_names.model_id
  AND config.primary_display_name IS DISTINCT FROM display_names.display_name;

WITH display_names(model_id, display_name) AS (
  VALUES
    ('qwen/qwen3.7-plus', 'Qwen3.7 Plus'),
    ('deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash'),
    ('deepseek/deepseek-v4-pro', 'DeepSeek V4 Pro'),
    ('google/gemini-3.5-flash', 'Gemini 3.5 Flash'),
    ('google/gemini-3-flash-preview', 'Gemini 3 Flash Preview'),
    ('google/gemini-2.5-flash-image', 'Gemini 2.5 Flash Image'),
    ('openai/gpt-5-image-mini', 'GPT-5 Image Mini'),
    ('minimax/minimax-m3', 'Minimax M3'),
    ('qwen/qwen3-235b-a22b-2507', 'Qwen3 235B A22B'),
    ('moonshotai/kimi-k2-thinking', 'Kimi K2 Thinking'),
    ('moonshotai/kimi-k2.5', 'Kimi K2.5'),
    ('z-ai/glm-5', 'GLM-5')
)
UPDATE llm_model_config AS config
SET fallback_display_name = display_names.display_name
FROM display_names
WHERE config.fallback_model_id = display_names.model_id
  AND config.fallback_display_name IS DISTINCT FROM display_names.display_name;
