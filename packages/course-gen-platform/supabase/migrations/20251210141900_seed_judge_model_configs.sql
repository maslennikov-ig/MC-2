-- Migration: Seed judge model configurations for CLEV voting system
-- Replaces single stage_6_judge with 3 judges per language

-- First, deactivate old single judge config (without judge_role)
UPDATE llm_model_config
SET is_active = false
WHERE phase_name = 'stage_6_judge' AND judge_role IS NULL;

-- Insert Russian content judges (generation model is qwen3, so judges exclude it)
INSERT INTO llm_model_config (
    config_type, phase_name, model_id, fallback_model_id, temperature, max_tokens,
    language, context_tier, is_active, judge_role, weight,
    primary_display_name, fallback_display_name
) VALUES
-- Russian: Primary judge (DeepSeek since qwen3 is used for generation)
('global', 'stage_6_judge', 'deepseek/deepseek-v3.1-terminus', 'openai/gpt-oss-120b',
 0.3, 4096, 'ru', 'extended', true, 'primary', 0.74,
 'DeepSeek V3.1 Terminus', 'GPT-OSS 120B'),

-- Russian: Secondary judge
('global', 'stage_6_judge', 'moonshotai/kimi-k2-0905', 'openai/gpt-oss-120b',
 0.3, 4096, 'ru', 'extended', true, 'secondary', 0.73,
 'Kimi K2', 'GPT-OSS 120B'),

-- Russian: Tiebreaker judge
('global', 'stage_6_judge', 'minimax/minimax-m2', 'openai/gpt-oss-120b',
 0.3, 4096, 'ru', 'extended', true, 'tiebreaker', 0.72,
 'Minimax M2', 'GPT-OSS 120B'),

-- English: Primary judge (Qwen3 since deepseek is used for generation)
('global', 'stage_6_judge', 'qwen/qwen3-235b-a22b-2507', 'openai/gpt-oss-120b',
 0.3, 4096, 'en', 'extended', true, 'primary', 0.75,
 'Qwen3 235B', 'GPT-OSS 120B'),

-- English: Secondary judge
('global', 'stage_6_judge', 'moonshotai/kimi-k2-0905', 'openai/gpt-oss-120b',
 0.3, 4096, 'en', 'extended', true, 'secondary', 0.73,
 'Kimi K2', 'GPT-OSS 120B'),

-- English: Tiebreaker judge
('global', 'stage_6_judge', 'minimax/minimax-m2', 'openai/gpt-oss-120b',
 0.3, 4096, 'en', 'extended', true, 'tiebreaker', 0.72,
 'Minimax M2', 'GPT-OSS 120B'),

-- Any language fallback: Primary judge
('global', 'stage_6_judge', 'qwen/qwen3-235b-a22b-2507', 'openai/gpt-oss-120b',
 0.3, 4096, 'any', 'extended', true, 'primary', 0.75,
 'Qwen3 235B', 'GPT-OSS 120B'),

-- Any language fallback: Secondary judge
('global', 'stage_6_judge', 'moonshotai/kimi-k2-0905', 'openai/gpt-oss-120b',
 0.3, 4096, 'any', 'extended', true, 'secondary', 0.73,
 'Kimi K2', 'GPT-OSS 120B'),

-- Any language fallback: Tiebreaker judge
('global', 'stage_6_judge', 'minimax/minimax-m2', 'openai/gpt-oss-120b',
 0.3, 4096, 'any', 'extended', true, 'tiebreaker', 0.72,
 'Minimax M2', 'GPT-OSS 120B');
