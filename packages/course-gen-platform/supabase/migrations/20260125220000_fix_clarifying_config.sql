-- Fix stage_number and swap models for stage_4_clarifying
-- Primary: Kimi K2 (cheaper for 4000 tokens)
-- Fallback: Gemini 2.0 Thinking (reasoning capability)

UPDATE llm_model_config
SET
  stage_number = 4,
  model_id = 'moonshotai/kimi-k2-0905',
  fallback_model_id = 'google/gemini-2.0-flash-thinking-exp-01-21',
  primary_display_name = 'Kimi K2',
  fallback_display_name = 'Gemini 2.0 Thinking',
  updated_at = NOW()
WHERE phase_name = 'stage_4_clarifying';
