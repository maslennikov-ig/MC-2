-- Migration: Link benchmarks to model config
-- Purpose: Add benchmark_id reference to llm_model_config for model quality tracking
-- Date: 2026-01-28
-- Related: 20260128201300_create_benchmark_tables.sql

-- ============================================================================
-- Add benchmark reference to llm_model_config
-- ============================================================================
-- This allows us to associate a model configuration with its latest benchmark
-- result for quality-aware model selection.

ALTER TABLE llm_model_config
ADD COLUMN IF NOT EXISTS benchmark_id UUID REFERENCES llm_model_benchmarks(id) ON DELETE SET NULL;

COMMENT ON COLUMN llm_model_config.benchmark_id IS 'Reference to latest benchmark for this model (for quality-aware selection)';

-- ============================================================================
-- Index for benchmark lookup
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_llm_model_config_benchmark ON llm_model_config(benchmark_id) WHERE benchmark_id IS NOT NULL;

-- ============================================================================
-- View: Model config with quality data
-- ============================================================================
-- Combines model configuration with latest benchmark scores for admin dashboard

CREATE OR REPLACE VIEW llm_model_config_with_quality AS
SELECT
  c.id,
  c.config_type,
  c.course_id,
  c.phase_name,
  c.model_id,
  c.fallback_model_id,
  c.temperature,
  c.max_tokens,
  c.created_at,
  c.updated_at,
  b.quality_tier,
  b.overall_quality_score,
  b.content_quality_score,
  b.error_rate,
  b.test_date AS benchmark_date
FROM llm_model_config c
LEFT JOIN llm_model_benchmarks b ON c.benchmark_id = b.id;

COMMENT ON VIEW llm_model_config_with_quality IS 'Model config with associated benchmark quality metrics';

-- ============================================================================
-- Function: Get recommended model for phase
-- ============================================================================
-- Returns the best available model for a phase based on benchmark quality

CREATE OR REPLACE FUNCTION get_recommended_model_for_phase(
  p_phase_name TEXT,
  p_min_tier TEXT DEFAULT 'B'
)
RETURNS TABLE (
  model_id TEXT,
  quality_tier TEXT,
  overall_score NUMERIC,
  is_fallback BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tier_order TEXT[] := ARRAY['S', 'A', 'B', 'C', 'D'];
  min_tier_idx INT;
BEGIN
  -- Get minimum tier index
  min_tier_idx := array_position(tier_order, p_min_tier);
  IF min_tier_idx IS NULL THEN
    min_tier_idx := 3; -- Default to 'B'
  END IF;

  RETURN QUERY
  SELECT
    c.model_id,
    b.quality_tier,
    b.overall_quality_score,
    FALSE as is_fallback
  FROM llm_model_config c
  LEFT JOIN llm_model_benchmarks b ON c.benchmark_id = b.id
  WHERE c.config_type = 'global'
    AND c.phase_name = p_phase_name
    AND (b.quality_tier IS NULL OR array_position(tier_order, b.quality_tier) <= min_tier_idx)
  UNION ALL
  SELECT
    c.fallback_model_id,
    fb.quality_tier,
    fb.overall_quality_score,
    TRUE as is_fallback
  FROM llm_model_config c
  LEFT JOIN llm_model_benchmarks fb ON EXISTS (
    SELECT 1 FROM llm_model_benchmarks b2
    WHERE b2.model_slug = SPLIT_PART(c.fallback_model_id, '/', 2)
    AND b2.id = fb.id
  )
  WHERE c.config_type = 'global'
    AND c.phase_name = p_phase_name
    AND c.fallback_model_id IS NOT NULL
    AND (fb.quality_tier IS NULL OR array_position(tier_order, fb.quality_tier) <= min_tier_idx)
  ORDER BY is_fallback, overall_score DESC NULLS LAST
  LIMIT 2;
END;
$$;

COMMENT ON FUNCTION get_recommended_model_for_phase IS 'Get recommended primary and fallback models for a phase based on benchmark quality';
