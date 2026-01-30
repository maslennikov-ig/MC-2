-- Migration: LLM Benchmark Scoring System v2.0
-- Purpose: Add point-based scoring (not percentages) and full content storage
-- Date: 2026-01-29
-- Related: docs/llm-testing/LLM-BENCHMARK-SCORING-SYSTEM.md

-- ============================================================================
-- 1. Add point-based scoring columns to llm_model_benchmarks
-- ============================================================================

-- Semantic Quality (0-35 points) - Main criterion
ALTER TABLE llm_model_benchmarks
ADD COLUMN IF NOT EXISTS score_semantic_quality INTEGER CHECK (score_semantic_quality >= 0 AND score_semantic_quality <= 35);

-- Practical Value (0-25 points)
ALTER TABLE llm_model_benchmarks
ADD COLUMN IF NOT EXISTS score_practical_value INTEGER CHECK (score_practical_value >= 0 AND score_practical_value <= 25);

-- Task Compliance (0-15 points)
ALTER TABLE llm_model_benchmarks
ADD COLUMN IF NOT EXISTS score_task_compliance INTEGER CHECK (score_task_compliance >= 0 AND score_task_compliance <= 15);

-- No Hallucinations (0-10 points)
ALTER TABLE llm_model_benchmarks
ADD COLUMN IF NOT EXISTS score_no_hallucinations INTEGER CHECK (score_no_hallucinations >= 0 AND score_no_hallucinations <= 10);

-- Structure & Navigation (0-10 points)
ALTER TABLE llm_model_benchmarks
ADD COLUMN IF NOT EXISTS score_structure INTEGER CHECK (score_structure >= 0 AND score_structure <= 10);

-- Visualization & Graphics (0-5 points)
ALTER TABLE llm_model_benchmarks
ADD COLUMN IF NOT EXISTS score_visualization INTEGER CHECK (score_visualization >= 0 AND score_visualization <= 5);

-- Bonuses (can be positive, typically 0-30)
ALTER TABLE llm_model_benchmarks
ADD COLUMN IF NOT EXISTS score_bonuses INTEGER DEFAULT 0;

-- Penalties (negative values)
ALTER TABLE llm_model_benchmarks
ADD COLUMN IF NOT EXISTS score_penalties INTEGER DEFAULT 0;

-- Total points (calculated: sum of scores + bonuses + penalties)
ALTER TABLE llm_model_benchmarks
ADD COLUMN IF NOT EXISTS total_points INTEGER;

-- Test session ID for grouping (only compare within same session)
ALTER TABLE llm_model_benchmarks
ADD COLUMN IF NOT EXISTS test_session_id UUID DEFAULT gen_random_uuid();

-- ============================================================================
-- 2. Create table for storing full generation content
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_benchmark_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID REFERENCES llm_model_benchmarks(id) ON DELETE CASCADE,
  test_session_id UUID NOT NULL,

  -- Identification
  model_slug TEXT NOT NULL,
  scenario TEXT NOT NULL,  -- 'full-generation', 'lesson-en', 'metadata-ru', etc.
  language TEXT NOT NULL CHECK (language IN ('en', 'ru', 'zh')),

  -- Content
  input_prompt TEXT,                -- The prompt used for generation
  output_content TEXT NOT NULL,     -- Full generated content (for human review)
  output_preview TEXT,              -- First 500 chars for quick view

  -- Judge evaluation
  judge_scores JSONB,  -- { primary: {...}, secondary: {...}, tiebreaker: {...} }
  final_score INTEGER,
  tier TEXT CHECK (tier IN ('S', 'A', 'B', 'C', 'D')),

  -- Detailed breakdown
  score_breakdown JSONB,  -- Per-criterion scores from judges

  -- Metadata
  word_count INTEGER,
  generation_time_ms INTEGER,
  token_count INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each model can have one sample per scenario/session
  CONSTRAINT unique_sample_per_session UNIQUE (model_slug, scenario, test_session_id)
);

-- ============================================================================
-- 3. Indexes for llm_benchmark_samples
-- ============================================================================

-- Fast lookup by test session (for comparing models within same test)
CREATE INDEX IF NOT EXISTS idx_samples_test_session ON llm_benchmark_samples(test_session_id);

-- Fast lookup by model
CREATE INDEX IF NOT EXISTS idx_samples_model ON llm_benchmark_samples(model_slug);

-- Fast lookup by scenario
CREATE INDEX IF NOT EXISTS idx_samples_scenario ON llm_benchmark_samples(scenario);

-- Fast lookup by benchmark
CREATE INDEX IF NOT EXISTS idx_samples_benchmark ON llm_benchmark_samples(benchmark_id);

-- ============================================================================
-- 4. RLS Policies for llm_benchmark_samples
-- ============================================================================

ALTER TABLE llm_benchmark_samples ENABLE ROW LEVEL SECURITY;

-- Public read access (samples are meant to be viewed)
CREATE POLICY samples_read_all ON llm_benchmark_samples
  FOR SELECT
  USING (true);

-- SuperAdmin write access
CREATE POLICY samples_superadmin_write ON llm_benchmark_samples
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::TEXT = 'superadmin'
    )
  );

-- ============================================================================
-- 5. Update llm_model_leaderboard view to include points
-- ============================================================================

DROP VIEW IF EXISTS llm_model_leaderboard;

CREATE OR REPLACE VIEW llm_model_leaderboard AS
SELECT
  model_slug,
  model_name,
  provider,
  quality_tier,
  -- Legacy percentage scores (for backwards compatibility)
  overall_quality_score,
  content_quality_score,
  schema_compliance_score,
  language_quality_score,
  -- New point-based scores
  score_semantic_quality,
  score_practical_value,
  score_task_compliance,
  score_no_hallucinations,
  score_structure,
  score_visualization,
  score_bonuses,
  score_penalties,
  total_points,
  -- Metadata
  total_issues,
  critical_issues,
  error_rate,
  test_date,
  test_version,
  test_session_id
FROM llm_model_benchmarks
WHERE test_date = (
  SELECT MAX(test_date)
  FROM llm_model_benchmarks b2
  WHERE b2.model_slug = llm_model_benchmarks.model_slug
)
ORDER BY
  -- Prefer total_points if available, fallback to percentage
  COALESCE(total_points, (overall_quality_score * 100)::INTEGER) DESC,
  CASE quality_tier
    WHEN 'S' THEN 1
    WHEN 'A' THEN 2
    WHEN 'B' THEN 3
    WHEN 'C' THEN 4
    WHEN 'D' THEN 5
  END;

COMMENT ON VIEW llm_model_leaderboard IS 'Latest benchmark results for each model, ordered by points or score. Use test_session_id to compare within same test.';

-- ============================================================================
-- 6. Helper function: Calculate tier from points
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_tier_from_points(points INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN points >= 95 THEN 'S'
    WHEN points >= 80 THEN 'A'
    WHEN points >= 65 THEN 'B'
    WHEN points >= 50 THEN 'C'
    ELSE 'D'
  END;
END;
$$;

COMMENT ON FUNCTION calculate_tier_from_points IS 'Calculate quality tier (S/A/B/C/D) from total points';

-- ============================================================================
-- 7. Create view for comparing models within same test session
-- ============================================================================

CREATE OR REPLACE VIEW llm_benchmark_comparison AS
SELECT
  b.test_session_id,
  b.test_date,
  b.model_slug,
  b.model_name,
  b.provider,
  COALESCE(b.total_points, (b.overall_quality_score * 100)::INTEGER) as points,
  b.quality_tier,
  b.score_semantic_quality,
  b.score_practical_value,
  b.score_task_compliance,
  b.score_no_hallucinations,
  b.score_structure,
  b.score_visualization,
  s.output_preview,
  s.word_count,
  s.generation_time_ms
FROM llm_model_benchmarks b
LEFT JOIN llm_benchmark_samples s ON s.benchmark_id = b.id
ORDER BY b.test_session_id, COALESCE(b.total_points, (b.overall_quality_score * 100)::INTEGER) DESC;

COMMENT ON VIEW llm_benchmark_comparison IS 'Compare models within the same test session. Filter by test_session_id for valid comparisons.';

-- ============================================================================
-- 8. Comments
-- ============================================================================

COMMENT ON COLUMN llm_model_benchmarks.score_semantic_quality IS 'Semantic/content quality score (0-35 points). Main criterion.';
COMMENT ON COLUMN llm_model_benchmarks.score_practical_value IS 'Practical value score (0-25 points). Examples, applicability.';
COMMENT ON COLUMN llm_model_benchmarks.score_task_compliance IS 'Task compliance score (0-15 points). Following instructions.';
COMMENT ON COLUMN llm_model_benchmarks.score_no_hallucinations IS 'No hallucinations score (0-10 points). Factual accuracy.';
COMMENT ON COLUMN llm_model_benchmarks.score_structure IS 'Structure score (0-10 points). Logic, navigation.';
COMMENT ON COLUMN llm_model_benchmarks.score_visualization IS 'Visualization score (0-5 points). Mermaid diagrams quality.';
COMMENT ON COLUMN llm_model_benchmarks.score_bonuses IS 'Bonus points for exceptional quality. Can exceed 100 total.';
COMMENT ON COLUMN llm_model_benchmarks.score_penalties IS 'Penalty points for issues. Negative values.';
COMMENT ON COLUMN llm_model_benchmarks.total_points IS 'Total points = sum of scores + bonuses + penalties';
COMMENT ON COLUMN llm_model_benchmarks.test_session_id IS 'UUID grouping models tested together. Only compare within same session.';

COMMENT ON TABLE llm_benchmark_samples IS 'Full generation output for human review. Linked to benchmark.';
COMMENT ON COLUMN llm_benchmark_samples.output_content IS 'Complete generated content for human review';
COMMENT ON COLUMN llm_benchmark_samples.judge_scores IS 'LLM-Judge evaluation: { primary: {...}, secondary: {...}, tiebreaker: {...} }';
