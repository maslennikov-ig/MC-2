-- Migration: Rename kimi-k2-0905 → kimi-k2-thinking globally
-- The model has been renamed on OpenRouter from kimi-k2-0905 to kimi-k2-thinking

-- Update primary model references
UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-thinking'
WHERE model_id = 'moonshotai/kimi-k2-0905';

-- Update fallback model references
UPDATE llm_model_config
SET fallback_model_id = 'moonshotai/kimi-k2-thinking'
WHERE fallback_model_id = 'moonshotai/kimi-k2-0905';
