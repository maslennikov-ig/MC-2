-- Migration: Seed chat_stage_5_refinement and chat_stage_6_refinement configs
-- Purpose: Add missing model config rows for chat stage refinement phases.
-- Without these, the chat flow throws 503 (SERVICE_UNAVAILABLE) because
-- model-config-service cannot find phase-specific configs for chat phases.
--
-- The constraint already includes these phase names (added in 20260212120000).

INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    stage_number, language, context_tier, max_retries
) VALUES (
    gen_random_uuid(), 'global', 'chat_stage_5_refinement',
    'xiaomi/mimo-v2-flash', 'qwen/qwen3-235b-a22b-2507',
    0.7, 8192, true, 1,
    5, 'any', 'standard', 3
) ON CONFLICT DO NOTHING;

INSERT INTO llm_model_config (
    id, config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, is_active, version,
    stage_number, language, context_tier, max_retries
) VALUES (
    gen_random_uuid(), 'global', 'chat_stage_6_refinement',
    'xiaomi/mimo-v2-flash', 'qwen/qwen3-235b-a22b-2507',
    0.7, 8192, true, 1,
    6, 'any', 'standard', 3
) ON CONFLICT DO NOTHING;
