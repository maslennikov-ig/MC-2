/**
 * Token Tracking Service
 *
 * Persists LLM token usage and costs to generation_trace table.
 * Non-blocking - failures should not break the pipeline.
 *
 * @module services/token-tracking-service
 */

import { getSupabaseAdmin } from '../shared/supabase/admin';
import { logger } from '../shared/logger';

/**
 * Trace entry data structure
 *
 * Maps to CostTracker's StageCost structure with required fields
 * for database persistence.
 */
export interface TraceEntry {
  courseId: string;
  stageNumber: number;
  phaseName: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * Course token summary aggregated from traces
 */
export interface CourseTokenSummary {
  totalTokens: number;
  totalCostUsd: number;
  byStage: Array<{ stage: number; tokens: number; cost: number }>;
}

/**
 * Record a trace entry to the database
 *
 * Non-blocking operation - errors are logged but not thrown
 * to avoid breaking the generation pipeline.
 *
 * @param entry - Trace entry data
 *
 * @example
 * ```typescript
 * await recordTrace({
 *   courseId: 'uuid',
 *   stageNumber: 2,
 *   phaseName: 'classification',
 *   modelId: 'qwen/qwen3-235b-a22b-2507',
 *   inputTokens: 5000,
 *   outputTokens: 1000,
 *   costUsd: 0.0011,
 *   durationMs: 2500
 * });
 * ```
 */
export async function recordTrace(entry: TraceEntry): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('generation_trace')
      .insert({
        course_id: entry.courseId,
        stage: `stage_${entry.stageNumber}`,
        phase: entry.phaseName,
        step_name: 'llm_call',
        model_used: entry.modelId,
        tokens_used: entry.inputTokens + entry.outputTokens,
        cost_usd: entry.costUsd,
        duration_ms: entry.durationMs,
        input_data: {
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          ...(entry.metadata || {}),
        },
        created_at: new Date().toISOString(),
      });

    if (error) {
      logger.warn({ error, entry }, 'Failed to record trace to database');
      // Don't throw - tracing should not break the pipeline
    } else {
      logger.debug({ entry }, 'Trace recorded successfully');
    }
  } catch (error) {
    logger.warn({ error, entry }, 'Error recording trace to database');
    // Don't throw - tracing should not break the pipeline
  }
}

/**
 * Get total tokens and cost for a course
 *
 * Aggregates all traces for a given course, grouped by stage.
 *
 * @param courseId - Course UUID
 * @returns Course token summary with totals and per-stage breakdown
 *
 * @example
 * ```typescript
 * const summary = await getCourseTokenSummary('uuid');
 * // {
 * //   totalTokens: 125000,
 * //   totalCostUsd: 0.45,
 * //   byStage: [
 * //     { stage: 2, tokens: 50000, cost: 0.15 },
 * //     { stage: 3, tokens: 75000, cost: 0.30 }
 * //   ]
 * // }
 * ```
 */
export async function getCourseTokenSummary(courseId: string): Promise<CourseTokenSummary> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('generation_trace')
      .select('stage, tokens_used, cost_usd')
      .eq('course_id', courseId);

    if (error || !data) {
      logger.warn({ courseId, error }, 'Failed to get course token summary');
      return { totalTokens: 0, totalCostUsd: 0, byStage: [] };
    }

    const byStage = new Map<number, { tokens: number; cost: number }>();
    let totalTokens = 0;
    let totalCostUsd = 0;

    for (const row of data) {
      totalTokens += row.tokens_used || 0;
      totalCostUsd += row.cost_usd || 0;

      // Extract stage number from 'stage_N' format
      const stageMatch = row.stage.match(/stage_(\d+)/);
      const stageNumber = stageMatch ? parseInt(stageMatch[1], 10) : 0;

      const existing = byStage.get(stageNumber) || { tokens: 0, cost: 0 };
      byStage.set(stageNumber, {
        tokens: existing.tokens + (row.tokens_used || 0),
        cost: existing.cost + (row.cost_usd || 0),
      });
    }

    return {
      totalTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      byStage: Array.from(byStage.entries())
        .map(([stage, data]) => ({
          stage,
          tokens: data.tokens,
          cost: Number(data.cost.toFixed(6)),
        }))
        .sort((a, b) => a.stage - b.stage),
    };
  } catch (error) {
    logger.warn({ courseId, error }, 'Error getting course token summary');
    return { totalTokens: 0, totalCostUsd: 0, byStage: [] };
  }
}
