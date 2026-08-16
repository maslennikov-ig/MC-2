/**
 * What one LLM call cost, written where the money can be counted later.
 *
 * The tracking path existed and was dead: `costTracker.recordStageCost` had no
 * production caller, so `generation_trace.cost_usd` was empty in all but 162 of
 * 37107 rows and `courses.estimated_cost_usd` was null for every course. The
 * only way to answer "what did this course cost" was the provider's own key
 * counter, which knows nothing about courses, stages or models (mc2-o7740).
 *
 * Prices come from `MODEL_CATALOG` and nowhere else: a second price table in
 * this repository would drift from the routing configuration that picks the
 * models.
 */

import { getModelCapabilities } from '@megacampus/shared-types';

import logger from '../logger';
import { logTrace } from '../trace-logger';

/** Where a call belongs, so its cost lands on the right course and stage. */
export interface LlmCostContext {
  courseId: string;
  /** Trace `stage` value, e.g. `stage_6`. */
  stage: 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6' | 'stage_7';
  /** Trace `phase` value, e.g. `stage_6_complex`. */
  phase: string;
  lessonId?: string;
  /** Trace `step_name`; defaults to `llm_call`. */
  stepName?: string;
  durationMs?: number;
  retryAttempt?: number;
}

export interface LlmCallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Price of one call in USD, or `undefined` when the model is not catalogued.
 *
 * An uncatalogued model is a routing bug, not a rounding problem, so it is
 * reported rather than silently priced at zero.
 */
export function calculateLlmCostUsd(usage: LlmCallUsage): number | undefined {
  const capabilities = getModelCapabilities(usage.model);
  if (!capabilities) return undefined;
  return (
    (usage.inputTokens * capabilities.inputPricePerMillion) / 1_000_000 +
    (usage.outputTokens * capabilities.outputPricePerMillion) / 1_000_000
  );
}

/**
 * Records one image generation against a course.
 *
 * An image is billed per picture, not per token, so its price comes from the
 * provider's own figure rather than from `MODEL_CATALOG`. It still belongs in
 * the trace: the course total is a sum over that table, and a card image that
 * recorded its price only in `lesson_enrichments.metadata` was 18% of the
 * course it was billed to and invisible in the total (mc2-acjgd).
 */
export async function recordImageCallCost(
  usage: { model: string; costUsd: number },
  context?: LlmCostContext
): Promise<void> {
  if (!context) {
    logger.debug(
      { model: usage.model, costUsd: usage.costUsd },
      '[Cost] Image generated without a course context; its cost is not attributed'
    );
    return;
  }

  try {
    await logTrace({
      courseId: context.courseId,
      stage: context.stage,
      phase: context.phase,
      stepName: context.stepName ?? 'image_call',
      ...(context.lessonId ? { lessonId: context.lessonId } : {}),
      modelUsed: usage.model,
      costUsd: usage.costUsd,
      durationMs: context.durationMs ?? 0,
      inputData: { billedPerImage: true },
    });
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), model: usage.model },
      '[Cost] Could not record an image generation cost'
    );
  }
}

/**
 * Records one call's tokens, model and price against a course.
 *
 * Never throws and never blocks the caller: accounting must not be able to fail
 * a generation. A call made without a course context is logged at debug with
 * the model, so the remaining holes are visible instead of silent.
 */
export async function recordLlmCallCost(
  usage: LlmCallUsage,
  context?: LlmCostContext
): Promise<void> {
  if (!context) {
    logger.debug(
      { model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      '[Cost] LLM call without a course context; its cost is not attributed'
    );
    return;
  }

  const costUsd = calculateLlmCostUsd(usage);
  if (costUsd === undefined) {
    logger.warn(
      { model: usage.model, courseId: context.courseId, stage: context.stage },
      '[Cost] Model is not in MODEL_CATALOG; the call is traced without a price'
    );
  }

  try {
    await logTrace({
      courseId: context.courseId,
      stage: context.stage,
      phase: context.phase,
      stepName: context.stepName ?? 'llm_call',
      ...(context.lessonId ? { lessonId: context.lessonId } : {}),
      modelUsed: usage.model,
      tokensUsed: usage.inputTokens + usage.outputTokens,
      ...(costUsd === undefined ? {} : { costUsd }),
      durationMs: context.durationMs ?? 0,
      ...(context.retryAttempt === undefined ? {} : { retryAttempt: context.retryAttempt }),
      inputData: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    });
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), model: usage.model },
      '[Cost] Could not record an LLM call cost'
    );
  }
}
