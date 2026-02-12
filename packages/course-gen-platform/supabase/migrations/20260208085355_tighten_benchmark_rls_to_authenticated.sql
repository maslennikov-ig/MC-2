-- Migration: tighten_benchmark_rls_to_authenticated
-- Purpose: Restrict benchmark read-all policies from public (incl. anon) to authenticated only.
-- Issue: mc2-hs97 - RLS USING(true) audit found three benchmark tables with SELECT
--        policies defaulting to public role. While the data is non-sensitive, the
--        principle of least privilege dictates that only authenticated users should
--        access it. Additionally, llm_benchmark_samples contains input prompts and
--        full generated content that should not be exposed to anonymous users.
--
-- Tables affected:
--   1. llm_model_benchmarks  - policy: benchmarks_read_all
--   2. llm_benchmark_runs    - policy: benchmark_runs_read_all
--   3. llm_benchmark_samples - policy: samples_read_all
--
-- Strategy: DROP existing public policies, CREATE replacements scoped TO authenticated.

-- ============================================================================
-- 1. llm_model_benchmarks: Tighten read access to authenticated
-- ============================================================================

DROP POLICY IF EXISTS benchmarks_read_all ON llm_model_benchmarks;

CREATE POLICY benchmarks_read_authenticated ON llm_model_benchmarks
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 2. llm_benchmark_runs: Tighten read access to authenticated
-- ============================================================================

DROP POLICY IF EXISTS benchmark_runs_read_all ON llm_benchmark_runs;

CREATE POLICY benchmark_runs_read_authenticated ON llm_benchmark_runs
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 3. llm_benchmark_samples: Tighten read access to authenticated
-- ============================================================================

DROP POLICY IF EXISTS samples_read_all ON llm_benchmark_samples;

CREATE POLICY samples_read_authenticated ON llm_benchmark_samples
  FOR SELECT
  TO authenticated
  USING (true);
