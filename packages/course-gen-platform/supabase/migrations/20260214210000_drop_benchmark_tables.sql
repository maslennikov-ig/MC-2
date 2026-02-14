-- Migration: Drop benchmark tables (migrated to aidevteam project)
-- Date: 2026-02-14
-- Reason: Benchmark system fully migrated to aidevteam project

-- Drop views first (depend on tables)
DROP VIEW IF EXISTS llm_benchmark_comparison CASCADE;
DROP VIEW IF EXISTS llm_model_leaderboard CASCADE;
DROP VIEW IF EXISTS llm_model_config_with_quality CASCADE;

-- Drop function that depends on benchmark tables
DROP FUNCTION IF EXISTS get_recommended_model_for_phase(TEXT, TEXT, TEXT) CASCADE;

-- Drop tables (samples first due to FK, then runs, then benchmarks)
DROP TABLE IF EXISTS llm_benchmark_samples CASCADE;
DROP TABLE IF EXISTS llm_benchmark_runs CASCADE;

-- Remove benchmark_id column from llm_model_config (added by 20260128201400)
ALTER TABLE llm_model_config DROP COLUMN IF EXISTS benchmark_id;

-- Drop index that was on benchmark_id
DROP INDEX IF EXISTS idx_llm_model_config_benchmark;

-- Now drop the main table
DROP TABLE IF EXISTS llm_model_benchmarks CASCADE;

-- Drop helper functions
DROP FUNCTION IF EXISTS calculate_quality_tier(NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS calculate_tier_from_points(INTEGER) CASCADE;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_benchmark_tier() CASCADE;
