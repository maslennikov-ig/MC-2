-- Reasoning was not expressible at all: no column here, no parameter in the
-- request builder. Adding it needs its own token budget, because OpenRouter
-- bills reasoning tokens out of the same max_tokens as the answer — switching
-- it on at today's budgets would truncate replies rather than improve them.
--
-- Refs mc2-v9xom

ALTER TABLE llm_model_config
  ADD COLUMN IF NOT EXISTS reasoning_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reasoning_effort text,
  ADD COLUMN IF NOT EXISTS reasoning_max_tokens integer;

ALTER TABLE llm_model_config
  DROP CONSTRAINT IF EXISTS llm_model_config_reasoning_effort_check;
ALTER TABLE llm_model_config
  ADD CONSTRAINT llm_model_config_reasoning_effort_check
  CHECK (reasoning_effort IS NULL OR reasoning_effort IN ('low', 'medium', 'high'));

ALTER TABLE llm_model_config
  DROP CONSTRAINT IF EXISTS llm_model_config_reasoning_budget_check;
ALTER TABLE llm_model_config
  ADD CONSTRAINT llm_model_config_reasoning_budget_check
  CHECK (
    reasoning_max_tokens IS NULL
    OR (reasoning_max_tokens > 0 AND reasoning_max_tokens <= 64000)
  );

-- Reasoning without a reserved budget is the failure mode this guards against:
-- the model spends the answer's tokens on thinking and returns a stub.
ALTER TABLE llm_model_config
  DROP CONSTRAINT IF EXISTS llm_model_config_reasoning_needs_budget_check;
ALTER TABLE llm_model_config
  ADD CONSTRAINT llm_model_config_reasoning_needs_budget_check
  CHECK (reasoning_enabled = false OR reasoning_max_tokens IS NOT NULL);

COMMENT ON COLUMN llm_model_config.reasoning_enabled IS
  'Send the OpenRouter reasoning parameter for this phase. Only for phases where deliberation is worth the tokens.';
COMMENT ON COLUMN llm_model_config.reasoning_max_tokens IS
  'Tokens reserved for reasoning, added on top of max_tokens rather than taken from it.';

-- Turn it on only where the work is genuinely hard: the complex Stage 6 tier and
-- the two paths that run after something has already failed.
UPDATE llm_model_config
SET reasoning_enabled = true,
    reasoning_effort = 'high',
    reasoning_max_tokens = 8000,
    updated_at = now(),
    version = version + 1
WHERE is_active
  AND phase_name IN ('stage_6_complex', 'stage_5_escalation', 'stage_6_auto_last_chance');
