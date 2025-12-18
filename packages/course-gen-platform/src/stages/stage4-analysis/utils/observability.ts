/**
 * Stage 4 Analysis - Custom Supabase Observability Wrapper
 *
 * Custom observability layer for tracking LLM phase execution metrics in Supabase.
 * Alternative to LangSmith (avoids SaaS dependency, uses existing infrastructure).
 *
 * Metrics tracked:
 * - Token usage (input, output, total)
 * - Cost calculation (USD)
 * - Latency (milliseconds)
 * - Quality scores (from semantic validation)
 * - Success/failure status
 * - Error messages
 * - Raw prompt and completion text (for trace logging)
 *
 * @module langchain-observability
 */

import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import { MetricEventType } from '../../../shared/types/system-metrics';
import logger from '../../../shared/logger';

/**
 * Trace data for LLM interactions
 * Used to capture raw prompt and completion for detailed trace logging
 */
export interface TraceData {
  /** Raw prompt text sent to LLM */
  promptText: string;
  /** Raw completion text received from LLM (before parsing/validation) */
  completionText: string;
}

/**
 * Thread-safe store for trace data during phase execution
 * Key format: `${courseId}:${phase}`
 */
const traceDataStore = new Map<string, TraceData>();

/**
 * Stores trace data for later retrieval by orchestrator
 * Called inside phase functions to capture raw LLM I/O
 *
 * @param courseId - Course UUID
 * @param phase - Phase identifier (e.g., 'stage_4_scope')
 * @param traceData - Raw prompt and completion text
 */
export function storeTraceData(courseId: string, phase: string, traceData: TraceData): void {
  const key = `${courseId}:${phase}`;
  traceDataStore.set(key, traceData);
}

/**
 * Retrieves and removes trace data stored by phase function
 * Called by orchestrator after phase execution to get raw LLM I/O
 *
 * @param courseId - Course UUID
 * @param phase - Phase identifier (e.g., 'stage_4_scope')
 * @returns Trace data if available, undefined otherwise
 */
export function getAndClearTraceData(courseId: string, phase: string): TraceData | undefined {
  const key = `${courseId}:${phase}`;
  const data = traceDataStore.get(key);
  if (data) {
    traceDataStore.delete(key);
  }
  return data;
}

/**
 * Phase execution metrics structure
 * Stored in system_metrics table with event_type = 'llm_phase_execution'
 */
export interface PhaseMetrics {
  /** Course UUID */
  course_id: string;
  /** Analysis phase name */
  phase: string;
  /** OpenRouter model ID used */
  model_used: string;
  /** Input tokens consumed */
  tokens_input: number;
  /** Output tokens generated */
  tokens_output: number;
  /** Total tokens (input + output) */
  tokens_total: number;
  /** Cost in USD (calculated from OpenRouter pricing) */
  cost_usd: number;
  /** Execution latency in milliseconds */
  latency_ms: number;
  /** Success flag (true = completed, false = failed) */
  success: boolean;
  /** Quality score from semantic validation (0-1, optional) */
  quality_score?: number;
  /** Error message if failed */
  error_message?: string;
}

/**
 * JSON Repair metrics structure
 * Stored in system_metrics table with event_type = 'json_repair_execution'
 */
export interface RepairMetrics {
  /** Course UUID */
  course_id: string;
  /** Analysis phase where repair occurred */
  phase: string;
  /** Repair strategy that succeeded (or was attempted last) */
  repair_strategy: 'jsonrepair_fsm' | 'as_is' | 'remove_trailing_commas' | 'add_closing_brackets' | 'fix_unquoted_keys' | 'truncate_incomplete_strings' | 'aggressive_cleanup';
  /** Success flag (true = repaired successfully, false = failed) */
  success: boolean;
  /** Repair execution time in milliseconds */
  duration_ms: number;
  /** Length of malformed JSON input */
  input_length: number;
  /** Length of repaired JSON output (if successful) */
  output_length?: number;
  /** Error message if repair failed */
  error_message?: string;
  /** Cost in USD (should be 0 for all strategies except multi-step regeneration) */
  cost_usd: number;
}

/**
 * OpenRouter pricing tiers (approximate, USD per 1M tokens)
 * Based on typical pricing as of 2025-01
 *
 * NOTE: For production, fetch real-time pricing from OpenRouter API
 * or maintain pricing table in Supabase
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'openai/gpt-oss-20b': { input: 0.2, output: 0.4 }, // 20B model (cheap)
  'openai/gpt-oss-120b': { input: 1.0, output: 2.0 }, // 120B model (expensive)
  'google/gemini-2.5-flash': { input: 0.1, output: 0.3 }, // Emergency model
};

/**
 * Calculates cost in USD based on token usage and model ID
 *
 * @param modelId - OpenRouter model identifier
 * @param tokensInput - Input tokens consumed
 * @param tokensOutput - Output tokens generated
 * @returns Cost in USD (rounded to 6 decimal places)
 *
 * @example
 * calculateCost('openai/gpt-oss-20b', 1000, 500)
 * // Returns: 0.000400 USD (1000 * 0.2/1M + 500 * 0.4/1M)
 */
function calculateCost(
  modelId: string,
  tokensInput: number,
  tokensOutput: number
): number {
  const pricing = MODEL_PRICING[modelId] || { input: 0.5, output: 1.0 }; // Default fallback

  const inputCost = (tokensInput / 1_000_000) * pricing.input;
  const outputCost = (tokensOutput / 1_000_000) * pricing.output;

  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Tracks phase execution with comprehensive metrics logging to Supabase
 *
 * Wraps an async function with observability instrumentation:
 * - Measures execution time
 * - Captures LLM usage from function return value
 * - Logs success/failure to system_metrics table
 * - Calculates cost based on token usage
 *
 * @param phase - Analysis phase identifier (e.g., 'stage_4_classification')
 * @param courseId - Course UUID
 * @param modelId - OpenRouter model ID used
 * @param fn - Async function to execute and track
 * @returns Result from executed function
 *
 * @throws Propagates errors from fn after logging metrics
 *
 * @example
 * // Track Phase 1 Classification execution
 * const result = await trackPhaseExecution(
 *   'stage_4_classification',
 *   courseId,
 *   'openai/gpt-oss-20b',
 *   async () => {
 *     const output = await runPhase1(input);
 *     return {
 *       result: output,
 *       usage: { input_tokens: 1000, output_tokens: 500 }
 *     };
 *   }
 * );
 */
export async function trackPhaseExecution<T>(
  phase: string,
  courseId: string,
  modelId: string,
  fn: () => Promise<{ result: T; usage: { input_tokens: number; output_tokens: number } }>
): Promise<T> {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  try {
    // Execute phase function
    const { result, usage } = await fn();
    const endTime = Date.now();
    const latency_ms = endTime - startTime;

    // Calculate metrics
    const tokens_input = usage.input_tokens;
    const tokens_output = usage.output_tokens;
    const tokens_total = tokens_input + tokens_output;
    const cost_usd = calculateCost(modelId, tokens_input, tokens_output);

    // Log success metrics to system_metrics table
    const metrics: PhaseMetrics = {
      course_id: courseId,
      phase,
      model_used: modelId,
      tokens_input,
      tokens_output,
      tokens_total,
      cost_usd,
      latency_ms,
      success: true,
    };

    await logMetrics(supabase, metrics);

    return result;
  } catch (error) {
    const endTime = Date.now();
    const latency_ms = endTime - startTime;

    // Log failure metrics to system_metrics table
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    const metrics: PhaseMetrics = {
      course_id: courseId,
      phase,
      model_used: modelId,
      tokens_input: 0,
      tokens_output: 0,
      tokens_total: 0,
      cost_usd: 0,
      latency_ms,
      success: false,
      error_message: errorMessage,
    };

    await logMetrics(supabase, metrics);

    // Re-throw error for upstream handling
    throw error;
  }
}

/**
 * Tracks JSON repair execution with comprehensive metrics logging to Supabase
 *
 * Wraps a JSON repair function with observability instrumentation:
 * - Measures execution time
 * - Captures repair strategy and success/failure
 * - Logs to system_metrics table
 * - Tracks input/output sizes for monitoring
 *
 * @param courseId - Course UUID
 * @param phase - Analysis phase identifier (e.g., 'stage_4_classification')
 * @param input - Raw malformed JSON input string
 * @param fn - Async function that performs JSON repair
 * @returns Result from executed repair function
 *
 * @throws Propagates errors from fn after logging metrics
 *
 * @example
 * // Track JSON repair execution
 * const result = await trackRepairExecution(
 *   courseId,
 *   'stage_4_classification',
 *   rawJsonString,
 *   async () => {
 *     return repairJSONInternal(rawJsonString);
 *   }
 * );
 */
export async function trackRepairExecution<T>(
  courseId: string,
  phase: string,
  input: string,
  fn: () => Promise<T> | T
): Promise<T> {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  try {
    // Execute repair function
    const result = await fn();
    const endTime = Date.now();

    // Extract strategy from result if it's a RepairResult
    const repairResult = (result && typeof result === 'object') ? (result as Record<string, unknown>) : {};
    const strategy = (repairResult.strategy as string) || 'as_is';
    const success = repairResult.success !== false; // Default to true if not specified

    // Calculate output length
    let outputLength: number | undefined;
    if (success && repairResult.repaired) {
      try {
        outputLength = JSON.stringify(repairResult.repaired).length;
      } catch {
        // If serialization fails, leave undefined
      }
    }

    // Log success metrics to system_metrics table
    const metrics: RepairMetrics = {
      course_id: courseId,
      phase,
      repair_strategy: strategy as unknown as any,
      success,
      duration_ms: endTime - startTime,
      input_length: input.length,
      output_length: outputLength,
      cost_usd: 0, // No cost for jsonrepair or FSM strategies
    };

    await logRepairMetrics(supabase, metrics);

    return result;
  } catch (error) {
    const endTime = Date.now();
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log failure metrics to system_metrics table
    const metrics: RepairMetrics = {
      course_id: courseId,
      phase,
      repair_strategy: 'aggressive_cleanup', // Unknown strategy on error
      success: false,
      duration_ms: endTime - startTime,
      input_length: input.length,
      error_message: errorMessage,
      cost_usd: 0,
    };

    await logRepairMetrics(supabase, metrics);

    // Re-throw error for upstream handling
    throw error;
  }
}

/**
 * Logs phase metrics to system_metrics table
 *
 * @param supabase - Supabase client instance
 * @param metrics - Phase execution metrics
 */
async function logMetrics(
  supabase: SupabaseClient<Database>,
  metrics: PhaseMetrics
): Promise<void> {
  try {
    // NOTE: Type assertion needed until migration 20251117102056 is applied and Database types regenerated
    const { error } = await supabase
      .from('system_metrics')
      .insert({
        event_type: MetricEventType.LLM_PHASE_EXECUTION as unknown as any,
        severity: metrics.success ? 'info' : 'error',
        message: metrics.success
          ? `Phase ${metrics.phase} completed successfully`
          : `Phase ${metrics.phase} failed: ${metrics.error_message}`,
        metadata: {
          course_id: metrics.course_id,
          phase: metrics.phase,
          model_used: metrics.model_used,
          tokens_input: metrics.tokens_input,
          tokens_output: metrics.tokens_output,
          tokens_total: metrics.tokens_total,
          cost_usd: metrics.cost_usd,
          latency_ms: metrics.latency_ms,
          quality_score: metrics.quality_score,
        },
        course_id: metrics.course_id,
        timestamp: new Date().toISOString(),
      });

    if (error) {
      logger.error({ error }, 'Failed to log phase metrics to system_metrics');
      // Don't throw - observability failure should not break workflow
    }
  } catch (err) {
    logger.error({ err }, 'Exception while logging phase metrics');
    // Don't throw - observability failure should not break workflow
  }
}

/**
 * Logs repair metrics to system_metrics table
 *
 * @param supabase - Supabase client instance
 * @param metrics - JSON repair execution metrics
 */
async function logRepairMetrics(
  supabase: SupabaseClient<Database>,
  metrics: RepairMetrics
): Promise<void> {
  try {
    // NOTE: Type assertion needed until migration 20251117102056 is applied and Database types regenerated
    const { error } = await supabase
      .from('system_metrics')
      .insert({
        event_type: MetricEventType.JSON_REPAIR_EXECUTION as unknown as any,
        severity: metrics.success ? 'info' : 'warn',
        message: metrics.success
          ? `JSON repair succeeded using ${metrics.repair_strategy}`
          : `JSON repair failed: ${metrics.error_message}`,
        metadata: {
          course_id: metrics.course_id,
          phase: metrics.phase,
          repair_strategy: metrics.repair_strategy,
          duration_ms: metrics.duration_ms,
          input_length: metrics.input_length,
          output_length: metrics.output_length,
          cost_usd: metrics.cost_usd,
        },
        course_id: metrics.course_id,
        timestamp: new Date().toISOString(),
      });

    if (error) {
      logger.error({ error }, 'Failed to log repair metrics to system_metrics');
      // Don't throw - observability failure should not break workflow
    }
  } catch (err) {
    logger.error({ err }, 'Exception while logging repair metrics');
    // Don't throw - observability failure should not break workflow
  }
}

/**
 * Updates quality score for a previously logged phase execution
 *
 * Used after semantic validation completes (async process)
 *
 * @param courseId - Course UUID
 * @param phase - Analysis phase identifier
 * @param qualityScore - Similarity score from Jina-v3 validation (0-1)
 *
 * @example
 * // After semantic validation completes
 * await updateQualityScore(courseId, 'stage_4_classification', 0.92);
 */
export async function updateQualityScore(
  courseId: string,
  _phase: string,
  qualityScore: number
): Promise<void> {
  const supabase = getSupabaseAdmin();

  try {
    // NOTE: Type assertion needed until migration 20251117102056 is applied and Database types regenerated
    // Find most recent phase execution for this course+phase
    const { data: recentMetric } = await supabase
      .from('system_metrics')
      .select('id, metadata')
      .eq('event_type', MetricEventType.LLM_PHASE_EXECUTION as unknown as any)
      .eq('course_id', courseId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (recentMetric) {
      // Update metadata with quality_score
      const existingMetadata =
        (recentMetric.metadata as Record<string, unknown>) || {};
      const updatedMetadata = {
        ...existingMetadata,
        quality_score: qualityScore,
      };

      await supabase
        .from('system_metrics')
        .update({ metadata: updatedMetadata })
        .eq('id', recentMetric.id);
    }
  } catch (err) {
    logger.error({ err }, 'Failed to update quality score');
    // Don't throw - observability failure should not break workflow
  }
}
