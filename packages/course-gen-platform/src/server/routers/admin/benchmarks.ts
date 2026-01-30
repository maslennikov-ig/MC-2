/**
 * Admin Benchmarks Router
 * @module server/routers/admin/benchmarks
 *
 * Provides admin procedures for viewing and managing LLM model benchmarks.
 *
 * Procedures:
 * - listBenchmarks: Get all benchmarks (leaderboard)
 * - getBenchmark: Get detailed benchmark for a model
 * - getBenchmarkRuns: Get individual test runs for a benchmark
 * - compareBenchmarks: Compare two models side by side
 *
 * NOTE: Types are manually defined until database types are regenerated
 * after applying the benchmark migrations.
 */

import { z } from 'zod';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';

// ============================================================================
// SCHEMAS
// ============================================================================

const qualityTierSchema = z.enum(['S', 'A', 'B', 'C', 'D']);

const listBenchmarksInputSchema = z.object({
  minTier: qualityTierSchema.optional(),
  provider: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});

const getBenchmarkInputSchema = z.object({
  modelSlug: z.string().min(1),
});

const getBenchmarkRunsInputSchema = z.object({
  benchmarkId: z.string().uuid(),
  scenario: z.string().optional(),
});

const compareBenchmarksInputSchema = z.object({
  modelSlug1: z.string().min(1),
  modelSlug2: z.string().min(1),
});

// ============================================================================
// TYPES (exported for router inference)
// ============================================================================

export interface BenchmarkListItem {
  id: string;
  modelSlug: string;
  modelName: string;
  provider: string;
  qualityTier: string;
  overallQualityScore: number;
  contentQualityScore: number;
  schemaComplianceScore: number;
  languageQualityScore: number;
  errorRate: number;
  totalIssues: number;
  criticalIssues: number;
  testDate: string;
  testVersion: string;
}

export interface BenchmarkRun {
  id: string;
  scenario: string;
  runNumber: number;
  language: string;
  schemaScore: number;
  contentScore: number;
  languageScore: number;
  overallScore: number;
  issues: string[];
  isError: boolean;
  errorMessage: string | null;
}

export interface BenchmarkComparison {
  model1: BenchmarkListItem;
  model2: BenchmarkListItem;
  winner: string;
  scoreDifference: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map database row to BenchmarkListItem
 * Uses explicit type casting as DB types aren't generated yet
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToBenchmark(row: any): BenchmarkListItem {
  return {
    id: row.id ?? row.model_slug,
    modelSlug: row.model_slug,
    modelName: row.model_name,
    provider: row.provider,
    qualityTier: row.quality_tier,
    overallQualityScore: Number(row.overall_quality_score),
    contentQualityScore: Number(row.content_quality_score),
    schemaComplianceScore: Number(row.schema_compliance_score),
    languageQualityScore: Number(row.language_quality_score),
    errorRate: Number(row.error_rate),
    totalIssues: row.total_issues,
    criticalIssues: row.critical_issues,
    testDate: row.test_date,
    testVersion: row.test_version,
  };
}

// ============================================================================
// ROUTER
// ============================================================================

export const benchmarksRouter = router({
  /**
   * List all benchmarks (leaderboard)
   *
   * Returns benchmarks ordered by quality tier and overall score.
   * Optionally filter by minimum tier or provider.
   */
  listBenchmarks: adminProcedure
    .input(listBenchmarksInputSchema)
    .query(async ({ input }): Promise<{ benchmarks: BenchmarkListItem[]; totalCount: number }> => {
      const supabase = getSupabaseAdmin();

      // Query the main table directly since view types aren't generated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any).from('llm_model_benchmarks').select('*', { count: 'exact' });

      // Filter by minimum tier
      if (input.minTier) {
        const tierOrder = ['S', 'A', 'B', 'C', 'D'];
        const minIndex = tierOrder.indexOf(input.minTier);
        const allowedTiers = tierOrder.slice(0, minIndex + 1);
        query = query.in('quality_tier', allowedTiers);
      }

      // Filter by provider
      if (input.provider) {
        query = query.eq('provider', input.provider);
      }

      // Order by tier priority then score
      query = query.order('overall_quality_score', { ascending: false }).limit(input.limit);

      const { data, error, count } = await query;

      if (error) {
        logger.error({ error }, '[Admin:Benchmarks] Failed to list benchmarks');
        throw error;
      }

      const benchmarks = (data || []).map(mapRowToBenchmark);

      return {
        benchmarks,
        totalCount: count ?? benchmarks.length,
      };
    }),

  /**
   * Get detailed benchmark for a model
   *
   * Returns the latest benchmark for the specified model slug,
   * including heuristic scores breakdown.
   */
  getBenchmark: adminProcedure
    .input(getBenchmarkInputSchema)
    .query(
      async ({
        input,
      }): Promise<BenchmarkListItem & { heuristicScores: Record<string, number> }> => {
        const supabase = getSupabaseAdmin();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('llm_model_benchmarks')
          .select('*')
          .eq('model_slug', input.modelSlug)
          .order('test_date', { ascending: false })
          .limit(1)
          .single();

        if (error || !data) {
          logger.error(
            { error, modelSlug: input.modelSlug },
            '[Admin:Benchmarks] Benchmark not found'
          );
          throw new Error(`Benchmark not found for model: ${input.modelSlug}`);
        }

        return {
          ...mapRowToBenchmark(data),
          heuristicScores: (data.heuristic_scores as Record<string, number>) || {},
        };
      }
    ),

  /**
   * Get individual test runs for a benchmark
   *
   * Returns all test runs associated with a benchmark,
   * optionally filtered by scenario.
   */
  getBenchmarkRuns: adminProcedure
    .input(getBenchmarkRunsInputSchema)
    .query(async ({ input }): Promise<BenchmarkRun[]> => {
      const supabase = getSupabaseAdmin();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('llm_benchmark_runs')
        .select('*')
        .eq('benchmark_id', input.benchmarkId)
        .order('scenario')
        .order('run_number');

      if (input.scenario) {
        query = query.eq('scenario', input.scenario);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, '[Admin:Benchmarks] Failed to get benchmark runs');
        throw error;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).map((row: any) => ({
        id: row.id,
        scenario: row.scenario,
        runNumber: row.run_number,
        language: row.language,
        schemaScore: Number(row.schema_score),
        contentScore: Number(row.content_score),
        languageScore: Number(row.language_score),
        overallScore: Number(row.overall_score),
        issues: (row.issues as string[]) || [],
        isError: row.is_error,
        errorMessage: row.error_message,
      }));
    }),

  /**
   * Compare two models side by side
   *
   * Returns comparison data for two models including
   * the winner and score difference.
   */
  compareBenchmarks: adminProcedure
    .input(compareBenchmarksInputSchema)
    .query(async ({ input }): Promise<BenchmarkComparison> => {
      const supabase = getSupabaseAdmin();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('llm_model_benchmarks')
        .select('*')
        .in('model_slug', [input.modelSlug1, input.modelSlug2])
        .order('test_date', { ascending: false });

      if (error) {
        logger.error({ error }, '[Admin:Benchmarks] Failed to compare benchmarks');
        throw error;
      }

      // Get latest for each model
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model1Data = data?.find((d: any) => d.model_slug === input.modelSlug1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model2Data = data?.find((d: any) => d.model_slug === input.modelSlug2);

      if (!model1Data || !model2Data) {
        throw new Error('One or both models not found');
      }

      const model1 = mapRowToBenchmark(model1Data);
      const model2 = mapRowToBenchmark(model2Data);

      const winner =
        model1.overallQualityScore > model2.overallQualityScore
          ? model1.modelName
          : model2.modelName;
      const scoreDifference = Math.abs(model1.overallQualityScore - model2.overallQualityScore);

      return {
        model1,
        model2,
        winner,
        scoreDifference,
      };
    }),
});

export type BenchmarksRouter = typeof benchmarksRouter;
