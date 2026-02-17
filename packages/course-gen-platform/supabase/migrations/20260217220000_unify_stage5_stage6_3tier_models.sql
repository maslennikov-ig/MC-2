-- Migration: Unify Stage 5 and Stage 6 3-tier model routing
-- Consistent model hierarchy across both stages:
--   simple  → xiaomi/mimo-v2-flash       (fast, cheap)
--   normal  → moonshotai/kimi-k2-thinking (thinking model, main workhorse)
--   complex → qwen/qwen3.5-plus-02-15    (premium model)

-- ============================================================================
-- Stage 5: Update simple tier (was openai/gpt-oss-120b → xiaomi/mimo-v2-flash)
-- ============================================================================
UPDATE llm_model_config
SET model_id = 'xiaomi/mimo-v2-flash',
    fallback_model_id = 'moonshotai/kimi-k2-thinking'
WHERE phase_name = 'stage_5_simple' AND context_tier = 'standard' AND is_active = true;

UPDATE llm_model_config
SET fallback_model_id = 'xiaomi/mimo-v2-flash'
WHERE phase_name = 'stage_5_simple' AND context_tier = 'extended' AND is_active = true;

-- ============================================================================
-- Stage 5: Update normal tier (was xiaomi/mimo-v2-flash → moonshotai/kimi-k2-thinking)
-- ============================================================================
UPDATE llm_model_config
SET model_id = 'moonshotai/kimi-k2-thinking'
WHERE phase_name = 'stage_5_normal' AND context_tier = 'standard' AND is_active = true;

UPDATE llm_model_config
SET fallback_model_id = 'moonshotai/kimi-k2-thinking'
WHERE phase_name = 'stage_5_normal' AND context_tier = 'extended' AND is_active = true;

-- ============================================================================
-- Stage 5: Update complex tier (was moonshotai/kimi-k2-thinking → qwen/qwen3.5-plus-02-15)
-- ============================================================================
UPDATE llm_model_config
SET model_id = 'qwen/qwen3.5-plus-02-15',
    fallback_model_id = 'moonshotai/kimi-k2-thinking'
WHERE phase_name = 'stage_5_complex' AND context_tier = 'standard' AND is_active = true;

UPDATE llm_model_config
SET fallback_model_id = 'qwen/qwen3.5-plus-02-15'
WHERE phase_name = 'stage_5_complex' AND context_tier = 'extended' AND is_active = true;

-- ============================================================================
-- Stage 6: Update simple tier (was moonshotai/kimi-k2-thinking → xiaomi/mimo-v2-flash)
-- ============================================================================
UPDATE llm_model_config
SET model_id = 'xiaomi/mimo-v2-flash',
    fallback_model_id = 'moonshotai/kimi-k2-thinking'
WHERE phase_name = 'stage_6_simple' AND context_tier = 'standard' AND is_active = true;

UPDATE llm_model_config
SET fallback_model_id = 'xiaomi/mimo-v2-flash'
WHERE phase_name = 'stage_6_simple' AND context_tier = 'extended' AND is_active = true;
