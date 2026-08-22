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
   *   - totalTokens: Total tokens used, generation and editing together
   *   - totalCostUsd: Total cost in USD, generation and editing together
   *   - byStage: Array of { stage, tokens, cost } per pipeline stage
   *   - editing: { tokens, cost } spent after generation — chat, inline block
   *     edits, element CRUD
   *
   * byStage does NOT sum to totalCostUsd. Editing has no pipeline stage, so it
   * is counted in the total and reported on its own; filing it under a number
   * would have made it stage 0, next to rows whose stage could not be read. A
   * cost breakdown built from byStage alone shows rows that do not add up to
   * their own total (mc2-bo2f4).
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
   * // {
   * //   totalTokens: 125000,
   * //   totalCostUsd: 0.45,
   * //   byStage: [{ stage: 6, tokens: 120000, cost: 0.42 }],  // 0.42, not 0.45
   * //   editing: { tokens: 5000, cost: 0.03 },
   * // }
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
        const successCount = courses?.filter(c => c.generation_status === 'completed').length || 0;
        const failureCount = courses?.filter(c => c.generation_status === 'failed').length || 0;

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

  /**
   * Which workers restarted while this course was generating.
   *
   * The whole of `mc2-r7udy`'s acceptance: given a course id, an operator can
   * answer "did a worker restart during this, and did it come back on different
   * code?" from the database alone. Until 2026-08-22 the answer lived only in
   * container logs that rotate, so every stuck-Stage-6 investigation guessed.
   *
   * The window is the course's own generation window, widened by a margin at
   * each end, because a restart just before generation began is part of the same
   * story — a worker that came up mid-deploy is exactly the case being looked
   * for.
   *
   * `buildsSeen` is the interesting line. One build across the window is a
   * restart; two is a deploy, and a deploy is usually the suspect.
   */
  getWorkerRestartsDuringCourse: superadminProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        /** Extra minutes examined on each side of the generation window. */
        marginMinutes: z.number().int().min(0).max(720).default(15),
      })
    )
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();

      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('created_at, updated_at, generation_status')
        .eq('id', input.courseId)
        .single();

      if (courseError || !course) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }

      // Both timestamps are nullable in the schema. A course with neither has no
      // window to look in, and inventing one from `now` would answer a different
      // question than the operator asked.
      if (!course.created_at) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Course has no created_at, so there is no generation window to examine',
        });
      }

      const marginMs = input.marginMinutes * 60_000;
      const startedAt = new Date(course.created_at).getTime();
      const endedAt = course.updated_at ? new Date(course.updated_at).getTime() : Date.now();
      const from = new Date(startedAt - marginMs).toISOString();
      const to = new Date(endedAt + marginMs).toISOString();

      const { data: markers, error: markerError } = await supabase
        .from('system_metrics')
        .select('timestamp, message, metadata')
        .eq('event_type', 'worker_started')
        .gte('timestamp', from)
        .lte('timestamp', to)
        .order('timestamp', { ascending: true });

      if (markerError) {
        logger.error(
          { err: markerError.message, courseId: input.courseId },
          'Failed to read worker restart markers'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to read worker restart markers',
        });
      }

      const rows = markers ?? [];
      const readMeta = (row: (typeof rows)[number], key: string): string | null => {
        const meta = row.metadata as Record<string, unknown> | null;
        const value = meta?.[key];
        return typeof value === 'string' ? value : null;
      };

      return {
        courseId: input.courseId,
        generationStatus: course.generation_status,
        window: { from, to, marginMinutes: input.marginMinutes },
        restartCount: rows.length,
        // An empty result before 2026-08-22 means the marker did not exist yet,
        // not that no worker restarted. Callers reading history need that.
        markersAvailableSince: '2026-08-22',
        buildsSeen: [...new Set(rows.map(row => readMeta(row, 'app_version')).filter(Boolean))],
        rolesSeen: [...new Set(rows.map(row => readMeta(row, 'worker_role')).filter(Boolean))],
        restarts: rows.map(row => ({
          at: row.timestamp,
          role: readMeta(row, 'worker_role'),
          appVersion: readMeta(row, 'app_version'),
          workerInstanceId: readMeta(row, 'worker_instance_id'),
          hostname: readMeta(row, 'hostname'),
        })),
      };
    }),
});
