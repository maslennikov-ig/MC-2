-- Migration: Add emergency phase config for standard tier
--
-- Problem: The 'emergency' phase only had 'extended' tier, but code looks for 'standard' by default.
-- This caused "database unavailable" errors during document summarization Phase 6.
--
-- Solution: Add 'standard' tier record for emergency phase.

INSERT INTO llm_model_config (
  config_type,
  phase_name,
  model_id,
  temperature,
  max_tokens,
  context_tier,
  is_active,
  max_context_tokens
)
SELECT
  'global',
  'emergency',
  'x-ai/grok-4-fast',  -- Grok 4 Fast has 2M context window
  0.7,
  30000,
  'standard',
  true,
  2000000
WHERE NOT EXISTS (
  SELECT 1 FROM llm_model_config
  WHERE phase_name = 'emergency' AND context_tier = 'standard'
);

COMMENT ON TABLE llm_model_config IS 'LLM model configurations by phase/stage with tier support. Emergency phase now has both standard and extended tiers.';
