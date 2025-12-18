/**
 * Pipeline Stats Router
 * @module server/routers/pipeline-admin/stats
 *
 * Provides aggregate pipeline statistics for the admin dashboard.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import type { PipelineStats } from '@megacampus/shared-types';

export const statsRouter = router({
  /**
   * Get token summary for a specific course
   *
   * Purpose: Display token usage and costs aggregated by stage for a single course.
   * Useful for detailed cost analysis and optimization.
   *
   * Authorization: Superadmin only (uses superadminProcedure)
   *
   * Input:
   * - courseId: UUID of the course
   *
   * Output:
   * - CourseTokenSummary object with:
   *   - totalTokens: Total tokens used across all stages
   *   - totalCostUsd: Total cost in USD
   *   - byStage: Array of { stage, tokens, cost } per stage
   *
   * Data Source:
   * - generation_trace table (tokens_used, cost_usd, stage columns)
   *
   * Error Handling:
   * - Unauthorized (not superadmin) -> 403 FORBIDDEN (handled by superadminProcedure)
   * - Database error -> Returns empty summary (non-breaking)
   *
   * @example
   * ```typescript
   * const summary = await trpc.pipelineAdmin.getCourseTokenSummary.query({ courseId: 'uuid' });
   * // { totalTokens: 125000, totalCostUsd: 0.45, byStage: [...] }
   * ```
   */
  getCourseTokenSummary: superadminProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { getCourseTokenSummary } = await import('../../../services/token-tracking-service');
      return getCourseTokenSummary(input.courseId);
    }),

  /**
   * Get aggregate pipeline statistics
   *
   * Purpose: Display high-level metrics for pipeline performance over a time period.
   * Shows total generations, success/failure rates, costs, and average completion time.
   *
   * Authorization: Superadmin only (uses superadminProcedure)
   *
   * Input:
   * - periodDays (optional): Number of days to include (1-365, default: 30)
   *
   * Output:
   * - PipelineStats object with:
   *   - totalGenerations: Total number of generation attempts
   *   - successCount: Number of successful completions
   *   - failureCount: Number of failed generations
   *   - totalCost: Total cost in USD
   *   - avgCompletionTime: Average time per generation in milliseconds
   *   - periodStart: ISO timestamp of period start
   *   - periodEnd: ISO timestamp of period end
   *
   * Data Sources:
   * - Generation counts: courses table (generation_status field)
   * - Costs and timing: generation_trace table
   *
   * Error Handling:
   * - Unauthorized (not superadmin) -> 403 FORBIDDEN (handled by superadminProcedure)
   * - Database error -> 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const stats = await trpc.pipelineAdmin.getPipelineStats.query({ periodDays: 30 });
   * // { totalGenerations: 150, successCount: 142, failureCount: 8, ... }
   * ```
   */
  getPipelineStats: superadminProcedure
    .input(
      z
        .object({
          periodDays: z.number().min(1).max(365).default(30),
        })
        .optional()
    )
    .query(async ({ input }): Promise<PipelineStats> => {
      try {
        const supabase = getSupabaseAdmin();
        const days = input?.periodDays || 30;

        const periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - days);

        // Query both data sources in parallel for better performance
        const [coursesResult, tracesResult] = await Promise.all([
          // Query courses with generation_status for success/failure counts
          supabase
            .from('courses')
            .select('generation_status')
            .not('generation_status', 'is', null)
            .gte('created_at', periodStart.toISOString()),
          // Query generation_trace for cost and time
          supabase
            .from('generation_trace')
            .select('cost_usd, duration_ms, course_id')
            .gte('created_at', periodStart.toISOString()),
        ]);

        const { data: courses, error: coursesError } = coursesResult;
        const { data: traces, error: tracesError } = tracesResult;

        if (coursesError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch course statistics: ${coursesError.message}`,
          });
        }

        if (tracesError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch trace statistics: ${tracesError.message}`,
          });
        }

        // Calculate aggregates
        const totalGenerations = courses?.length || 0;
        const successCount = courses?.filter((c) => c.generation_status === 'completed').length || 0;
        const failureCount = courses?.filter((c) => c.generation_status === 'failed').length || 0;

        let totalCost = 0;
        let totalTime = 0;
        const courseIds = new Set<string>();

        for (const trace of traces || []) {
          totalCost += trace.cost_usd || 0;
          totalTime += trace.duration_ms || 0;
          courseIds.add(trace.course_id);
        }

        const avgCompletionTime = courseIds.size > 0 ? Math.round(totalTime / courseIds.size) : 0;

        return {
          totalGenerations,
          successCount,
          failureCount,
          totalCost: Number(totalCost.toFixed(4)),
          avgCompletionTime,
          periodStart: periodStart.toISOString(),
          periodEnd: new Date().toISOString(),
        };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in getPipelineStats'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch pipeline statistics',
        });
      }
    }),
});
