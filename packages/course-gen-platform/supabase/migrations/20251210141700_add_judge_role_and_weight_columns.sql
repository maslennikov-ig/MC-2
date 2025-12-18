-- Migration: Add judge_role and weight columns to llm_model_config
-- Purpose: Support CLEV 3-judge voting system (primary/secondary/tiebreaker)

-- Add judge_role column for distinguishing judge roles
ALTER TABLE llm_model_config
ADD COLUMN IF NOT EXISTS judge_role text
CHECK (judge_role IN ('primary', 'secondary', 'tiebreaker') OR judge_role IS NULL);

-- Add weight column for judge accuracy-based weights
-- Formula: w = 1 / (1 + exp(-accuracy))
-- Typical range: 0.70 - 0.80
ALTER TABLE llm_model_config
ADD COLUMN IF NOT EXISTS weight numeric(4,2)
CHECK (weight IS NULL OR (weight >= 0 AND weight <= 1));

-- Add comment for documentation
COMMENT ON COLUMN llm_model_config.judge_role IS 'Judge role for CLEV voting: primary, secondary, or tiebreaker';
COMMENT ON COLUMN llm_model_config.weight IS 'Judge accuracy-based weight for CLEV voting (0-1)';

-- Create index for efficient judge lookups
CREATE INDEX IF NOT EXISTS idx_llm_model_config_judge_role
ON llm_model_config(phase_name, language, judge_role)
WHERE judge_role IS NOT NULL AND is_active = true;
