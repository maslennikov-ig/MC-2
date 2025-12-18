/**
 * Pipeline Admin Stages Router
 * @module server/routers/pipeline-admin/stages
 *
 * Provides the getStagesInfo procedure for fetching pipeline stage information
 * with linked models, prompts, and aggregated statistics.
 */

import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import type { PipelineStage } from '@megacampus/shared-types';
import { PIPELINE_STAGES } from './constants';

// =============================================================================
// Stages Router
// =============================================================================

/**
 * Stages router for pipeline admin
 *
 * All procedures require superadmin role for system-wide pipeline visibility.
 */
export const stagesRouter = router({
  /**
   * Get static stage info with linked models, prompts, and aggregated stats
   *
   * Purpose: Display pipeline overview showing all 6 stages with their
   * configuration, linked resources, and performance metrics.
   *
   * Authorization: Superadmin only (uses superadminProcedure)
   *
   * Input: None
   *
   * Output:
   * - Array of PipelineStage objects with:
   *   - number: Stage number (1-6)
   *   - name: Stage name
   *   - description: Stage description
   *   - status: Always 'active' (stages are always active)
   *   - linkedModels: Array of phase names using this stage
   *   - linkedPrompts: Array of prompt keys for this stage
   *   - avgExecutionTime: Average execution time in milliseconds (last 30 days)
   *   - avgCost: Average cost in USD (last 30 days)
   *
   * Data Sources:
   * - Stage definitions: Hardcoded in PIPELINE_STAGES
   * - Active models: llm_model_config table (is_active = true)
   * - Active prompts: prompt_templates table (is_active = true)
   * - Statistics: generation_trace table (last 30 days)
   *
   * Error Handling:
   * - Unauthorized (not superadmin) → 403 FORBIDDEN (handled by superadminProcedure)
   * - Database error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const stages = await trpc.pipelineAdmin.getStagesInfo.query();
   * // [{ number: 1, name: 'Document Upload', ... }, ...]
   * ```
   */
  getStagesInfo: superadminProcedure.query(async (): Promise<PipelineStage[]> => {
    try {
      const supabase = getSupabaseAdmin();

      // Query all data in parallel for better performance
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [tracesResult, modelConfigsResult, promptTemplatesResult] = await Promise.all([
        // Query generation_trace for stats (last 30 days)
        supabase
          .from('generation_trace')
          .select('stage, duration_ms, cost_usd')
          .gte('created_at', thirtyDaysAgo.toISOString()),
        // Query active model configs for database-driven counts
        supabase
          .from('llm_model_config')
          .select('phase_name')
          .eq('is_active', true),
        // Query active prompt templates for database-driven counts
        supabase
          .from('prompt_templates')
          .select('prompt_key')
          .eq('is_active', true),
      ]);

      const { data: traces, error: tracesError } = tracesResult;
      const { data: modelConfigs, error: modelsError } = modelConfigsResult;
      const { data: promptTemplates, error: promptsError } = promptTemplatesResult;

      if (tracesError) {
        logger.error({ err: tracesError.message }, 'Failed to fetch traces');
      }
      if (modelsError) {
        logger.error({ err: modelsError.message }, 'Failed to fetch model configs');
      }
      if (promptsError) {
        logger.error({ err: promptsError.message }, 'Failed to fetch prompt templates');
      }

      // Aggregate stats by stage
      const stageStats = new Map<
        string,
        { totalTime: number; totalCost: number; count: number }
      >();

      for (const trace of traces || []) {
        const existing = stageStats.get(trace.stage) || {
          totalTime: 0,
          totalCost: 0,
          count: 0,
        };
        stageStats.set(trace.stage, {
          totalTime: existing.totalTime + (trace.duration_ms || 0),
          totalCost: existing.totalCost + (trace.cost_usd || 0),
          count: existing.count + 1,
        });
      }

      // Transform static stages to PipelineStage with aggregated data
      return PIPELINE_STAGES.map((stage) => {
        const stats = stageStats.get(`stage_${stage.number}`) || {
          totalTime: 0,
          totalCost: 0,
          count: 0,
        };

        // Count models for this stage (unified format: stage_X_*)
        const modelCount = (modelConfigs || []).filter((m) =>
          m.phase_name.startsWith(`stage_${stage.number}_`)
        ).length;

        // Count prompts for this stage
        const promptCount = (promptTemplates || []).filter((p) =>
          p.prompt_key.startsWith(`stage_${stage.number}_`)
        ).length;

        return {
          number: stage.number,
          name: stage.name as string,
          description: stage.description as string,
          status: 'active' as const, // Stages are always active
          linkedModels: [...stage.linkedPhases],
          linkedPrompts: [...stage.linkedPrompts],
          modelCount,
          promptCount,
          avgExecutionTime: stats.count > 0 ? Math.round(stats.totalTime / stats.count) : null,
          avgCost: stats.count > 0 ? stats.totalCost / stats.count : null,
        };
      });
    } catch (error: unknown) {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
        },
        'Unexpected error in getStagesInfo'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch pipeline stages information',
      });
    }
  }),
});
