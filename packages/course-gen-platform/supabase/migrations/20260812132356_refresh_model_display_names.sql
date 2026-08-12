-- The admin screen labels each row with primary_display_name / fallback_display_name.
-- Those were written by hand alongside the old models and the routing refresh did
-- not touch them, so pipeline-admin was showing "Kimi K2 Thinking" on a row that
-- routes to openai/gpt-5.6-luna. A label that contradicts the value it labels is
-- worse than no label.
--
-- Derived from model_id here so the two cannot drift apart again by hand.
--
-- Refs mc2-t6iec

CREATE OR REPLACE FUNCTION pg_temp.model_display_name(model_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE model_id
    WHEN '~deepseek/deepseek-v4-flash-latest' THEN 'DeepSeek V4 Flash (latest)'
    WHEN 'openai/gpt-5.6-luna' THEN 'GPT-5.6 Luna'
    WHEN 'z-ai/glm-5.2' THEN 'GLM 5.2'
    WHEN 'minimax/minimax-m3' THEN 'MiniMax M3'
    WHEN 'google/gemini-3-flash-preview' THEN 'Gemini 3 Flash Preview'
    WHEN 'openai/gpt-5-image-mini' THEN 'GPT-5 Image Mini'
    WHEN 'google/gemini-2.5-flash-image' THEN 'Gemini 2.5 Flash Image'
    ELSE NULL
  END
$$;

UPDATE llm_model_config
SET primary_display_name = COALESCE(pg_temp.model_display_name(model_id), primary_display_name),
    fallback_display_name = CASE
      WHEN fallback_model_id IS NULL THEN NULL
      ELSE COALESCE(pg_temp.model_display_name(fallback_model_id), fallback_display_name)
    END,
    updated_at = now(),
    version = version + 1
WHERE is_active;
