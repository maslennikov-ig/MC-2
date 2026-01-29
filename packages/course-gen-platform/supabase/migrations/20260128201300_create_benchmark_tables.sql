-- Migration: LLM Model Benchmarks System
-- Purpose: Create tables for centralized storage, comparison, and tracking of LLM model quality
-- Date: 2026-01-28
-- Related: docs/plans/refactored-hugging-dewdrop.md

-- ============================================================================
-- Table: llm_model_benchmarks
-- ============================================================================
-- Purpose: Store aggregated benchmark results for each model/date combination
--          Tracks Content Quality Score (CQS) using FILTER_WEIGHTS from heuristic-filter.ts
--
-- Tier System:
--   S-TIER: 0.95+ (Primary model)
--   A-TIER: 0.85-0.94 (Production)
--   B-TIER: 0.75-0.84 (With review)
--   C-TIER: 0.60-0.74 (Fallback only)
--   D-TIER: <0.60 (Do not use)
-- ============================================================================

CREATE TABLE llm_model_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Model identification
  model_slug TEXT NOT NULL,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,

  -- Test metadata
  test_date DATE NOT NULL DEFAULT CURRENT_DATE,
  test_version TEXT NOT NULL,

  -- Aggregated scores (0-1 scale)
  overall_quality_score NUMERIC(4,3) NOT NULL CHECK (overall_quality_score >= 0 AND overall_quality_score <= 1),
  content_quality_score NUMERIC(4,3) NOT NULL CHECK (content_quality_score >= 0 AND content_quality_score <= 1),
  schema_compliance_score NUMERIC(4,3) NOT NULL CHECK (schema_compliance_score >= 0 AND schema_compliance_score <= 1),
  language_quality_score NUMERIC(4,3) NOT NULL CHECK (language_quality_score >= 0 AND language_quality_score <= 1),

  -- Heuristic filter breakdown (JSONB for flexibility)
  -- Keys match FILTER_WEIGHTS from heuristic-filter.ts:
  -- wordCount, fleschKincaid, sections, keywordCoverage, contentDensity,
  -- markdownStructure, learningObjectiveCoverage, prohibitedTerms,
  -- promptMarkers, languageConsistency, mermaidSyntax, sectionDuplication
  heuristic_scores JSONB NOT NULL DEFAULT '{}',

  -- Issue tracking
  total_issues INTEGER DEFAULT 0 CHECK (total_issues >= 0),
  critical_issues INTEGER DEFAULT 0 CHECK (critical_issues >= 0),
  error_rate NUMERIC(4,3) DEFAULT 0 CHECK (error_rate >= 0 AND error_rate <= 1),

  -- Quality tier (derived from overall_quality_score)
  quality_tier TEXT NOT NULL CHECK (quality_tier IN ('S', 'A', 'B', 'C', 'D')),

  -- Reference to raw test data
  raw_results_path TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each model can have only one benchmark per date
  CONSTRAINT unique_model_date UNIQUE (model_slug, test_date)
);

-- ============================================================================
-- Table: llm_benchmark_runs
-- ============================================================================
-- Purpose: Store individual test run results for detailed analysis
--          Links to parent benchmark for aggregation
-- ============================================================================

CREATE TABLE llm_benchmark_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID NOT NULL REFERENCES llm_model_benchmarks(id) ON DELETE CASCADE,

  -- Run identification
  scenario TEXT NOT NULL,
  run_number INTEGER NOT NULL CHECK (run_number > 0),
  language TEXT NOT NULL CHECK (language IN ('en', 'ru', 'zh')),

  -- Individual scores (0-1 scale)
  schema_score NUMERIC(4,3) NOT NULL CHECK (schema_score >= 0 AND schema_score <= 1),
  content_score NUMERIC(4,3) NOT NULL CHECK (content_score >= 0 AND content_score <= 1),
  language_score NUMERIC(4,3) NOT NULL CHECK (language_score >= 0 AND language_score <= 1),
  overall_score NUMERIC(4,3) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 1),

  -- Heuristic filter result (full output from runHeuristicFilters)
  heuristic_result JSONB,

  -- Issues from this run
  issues JSONB DEFAULT '[]',

  -- Error flag
  is_error BOOLEAN DEFAULT FALSE,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each benchmark can have only one result per scenario/run combo
  CONSTRAINT unique_run UNIQUE (benchmark_id, scenario, run_number)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Fast lookup by model slug (for leaderboard queries)
CREATE INDEX idx_benchmarks_model_slug ON llm_model_benchmarks(model_slug);

-- Fast lookup by test date (for historical analysis)
CREATE INDEX idx_benchmarks_test_date ON llm_model_benchmarks(test_date DESC);

-- Fast lookup by quality tier (for model selection)
CREATE INDEX idx_benchmarks_quality_tier ON llm_model_benchmarks(quality_tier);

-- Composite index for leaderboard queries (tier + score)
CREATE INDEX idx_benchmarks_leaderboard ON llm_model_benchmarks(quality_tier, overall_quality_score DESC);

-- Fast lookup of runs by benchmark
CREATE INDEX idx_benchmark_runs_benchmark ON llm_benchmark_runs(benchmark_id);

-- Fast lookup of runs by scenario
CREATE INDEX idx_benchmark_runs_scenario ON llm_benchmark_runs(scenario);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE llm_model_benchmarks IS 'Aggregated benchmark results for LLM models. Stores Content Quality Score (CQS) and tier classification.';
COMMENT ON COLUMN llm_model_benchmarks.model_slug IS 'URL-friendly model identifier (e.g., deepseek-v32-exp)';
COMMENT ON COLUMN llm_model_benchmarks.model_name IS 'Human-readable model name (e.g., DeepSeek v3.2 Exp)';
COMMENT ON COLUMN llm_model_benchmarks.provider IS 'Model provider (e.g., deepseek, openai, google)';
COMMENT ON COLUMN llm_model_benchmarks.test_version IS 'Version of the benchmark test suite used';
COMMENT ON COLUMN llm_model_benchmarks.overall_quality_score IS 'Weighted average of all scores (0-1)';
COMMENT ON COLUMN llm_model_benchmarks.content_quality_score IS 'CQS score using FILTER_WEIGHTS from heuristic-filter.ts';
COMMENT ON COLUMN llm_model_benchmarks.heuristic_scores IS 'Per-filter scores from heuristic-filter.ts';
COMMENT ON COLUMN llm_model_benchmarks.quality_tier IS 'Quality tier: S (0.95+), A (0.85-0.94), B (0.75-0.84), C (0.60-0.74), D (<0.60)';
COMMENT ON COLUMN llm_model_benchmarks.raw_results_path IS 'Path to raw JSON results in specs directory';

COMMENT ON TABLE llm_benchmark_runs IS 'Individual test run results for detailed benchmark analysis';
COMMENT ON COLUMN llm_benchmark_runs.scenario IS 'Test scenario (e.g., lesson-en, metadata-ru)';
COMMENT ON COLUMN llm_benchmark_runs.heuristic_result IS 'Full result from runHeuristicFilters()';

-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE llm_model_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_benchmark_runs ENABLE ROW LEVEL SECURITY;

-- Policy 1: Public read access for all authenticated users
-- Benchmark data is not sensitive - anyone can view the leaderboard
CREATE POLICY benchmarks_read_all ON llm_model_benchmarks
  FOR SELECT
  USING (true);

CREATE POLICY benchmark_runs_read_all ON llm_benchmark_runs
  FOR SELECT
  USING (true);

-- Policy 2: SuperAdmin write access
-- Only superadmins can insert/update/delete benchmark data
CREATE POLICY benchmarks_superadmin_write ON llm_model_benchmarks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::TEXT = 'superadmin'
    )
  );

CREATE POLICY benchmark_runs_superadmin_write ON llm_benchmark_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::TEXT = 'superadmin'
    )
  );

-- ============================================================================
-- Helper function: Calculate quality tier from score
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_quality_tier(score NUMERIC)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN score >= 0.95 THEN 'S'
    WHEN score >= 0.85 THEN 'A'
    WHEN score >= 0.75 THEN 'B'
    WHEN score >= 0.60 THEN 'C'
    ELSE 'D'
  END;
END;
$$;

COMMENT ON FUNCTION calculate_quality_tier IS 'Calculate quality tier (S/A/B/C/D) from overall quality score (0-1)';

-- ============================================================================
-- View: llm_model_leaderboard
-- ============================================================================
-- Purpose: Convenience view for displaying the model leaderboard
-- ============================================================================

CREATE OR REPLACE VIEW llm_model_leaderboard AS
SELECT
  model_slug,
  model_name,
  provider,
  quality_tier,
  overall_quality_score,
  content_quality_score,
  schema_compliance_score,
  language_quality_score,
  total_issues,
  critical_issues,
  error_rate,
  test_date,
  test_version
FROM llm_model_benchmarks
WHERE test_date = (
  SELECT MAX(test_date)
  FROM llm_model_benchmarks b2
  WHERE b2.model_slug = llm_model_benchmarks.model_slug
)
ORDER BY
  CASE quality_tier
    WHEN 'S' THEN 1
    WHEN 'A' THEN 2
    WHEN 'B' THEN 3
    WHEN 'C' THEN 4
    WHEN 'D' THEN 5
  END,
  overall_quality_score DESC;

COMMENT ON VIEW llm_model_leaderboard IS 'Latest benchmark results for each model, ordered by tier and score';

-- ============================================================================
-- Trigger: Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_benchmark_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_benchmarks_updated_at
  BEFORE UPDATE ON llm_model_benchmarks
  FOR EACH ROW
  EXECUTE FUNCTION update_benchmark_updated_at();
