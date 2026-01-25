-- Change fallback to Gemini 3 Flash Preview (newer, better)
UPDATE llm_model_config
SET
  fallback_model_id = 'google/gemini-3-flash-preview',
  fallback_display_name = 'Gemini 3 Flash',
  updated_at = NOW()
WHERE phase_name = 'stage_4_clarifying';
