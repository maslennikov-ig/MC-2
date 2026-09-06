import { logger } from '@/shared/logger';
import { getGraph } from '../graph';
import { HANDLER_CONFIG } from '../config';
import type { Stage6Input, Stage6Output } from '../types';
import type { LessonGraphStateType } from '../state';
import { buildLessonContent, extractContentBody } from '../judge/judge-helpers';

/**
 * The metrics block, with every absent field spelled as an explicit default.
 *
 * Written twice before — once for the success path and once for the catch — which is both a
 * duplicate and a hazard: a field added to one copy and not the other reads as "not measured"
 * rather than as a bug. `??` throughout, never `||`, because zero is a real measurement here:
 * a lesson can genuinely cost zero rejected tokens or score zero.
 */
function buildMetrics(
  result: LessonGraphStateType | null,
  durationMs: number
): Stage6Output['metrics'] {
  return {
    tokensUsed: result?.tokensUsed ?? 0,
    durationMs,
    modelUsed: result?.modelUsed ?? null,
    selectedModel: result?.selectedModel ?? null,
    fallbackModel: result?.fallbackModel ?? null,
    selectedModelTier: result?.selectedModelTier ?? null,
    selectedModelTierReason: result?.selectedModelTierReason ?? null,
    selectedModelPhase: result?.selectedModelPhase ?? null,
    selectedModelSource: result?.selectedModelSource ?? null,
    qualityScore: result?.qualityScore ?? 0,
    regenerateCount: result?.regenerateCount ?? 0,
    truncationCount: result?.truncationCount ?? 0,
    rejectedTokens: result?.rejectedTokens ?? 0,
    regenerationMode: result?.regenerationMode ?? null,
  };
}

/**
 * A model override must look like `provider/model-name`.
 *
 * Anything else is dropped rather than passed on, so the database configuration decides. A
 * malformed override that reached the provider would fail the call rather than fall back.
 */
function validateModelOverride(input: Stage6Input): string | null {
  const override = input.modelOverride ?? null;
  if (!override || override.includes('/')) return override;

  logger.warn(
    { lessonId: input.lessonSpec.lesson_id, modelOverride: override },
    'ModelOverride format invalid (expected "provider/model-name"), falling back to database config'
  );
  return null;
}

/** The graph's starting channels, all of them, with the caller's optional fields defaulted. */
function buildInitialState(
  input: Stage6Input,
  modelOverride: string | null
): Partial<LessonGraphStateType> {
  return {
    lessonSpec: input.lessonSpec,
    courseId: input.courseId,
    language: input.language,
    lessonUuid: input.lessonUuid ?? null,
    ragChunks: input.ragChunks ?? [],
    ragContextId: input.ragContextId ?? null,
    userRefinementPrompt: input.userRefinementPrompt ?? null,
    qualityRemediationDirective: null,
    modelOverride,
    style: input.style ?? null,
    analysisResult: input.analysisResult ?? null,
    selectedModel: input.selectedModel ?? null,
    fallbackModel: input.fallbackModel ?? null,
    selectedModelTier: input.selectedModelTier ?? null,
    selectedModelTierReason: input.selectedModelTierReason ?? null,
    selectedModelPhase: input.selectedModelPhase ?? null,
    selectedModelSource: input.selectedModelSource ?? null,
    prefetchedGeneratorResponse: input.prefetchedGeneratorResponse ?? null,
    prefetchedGeneratorResponseConsumed: false,
    currentNode: 'generator',
    errors: [],
    retryCount: 0,
    regenerateCount: 0,
    truncationCount: 0,
    rejectedTokens: 0,
    lastGenerationTokens: 0,
    regenerationMode: null,
  };
}

/**
 * Fail-open: review-required outcomes should not trigger outer fallback loops.
 *
 * SAFETY NET (defensive): both nodes that can exhaust a budget now set
 * needsHumanReview and reviewInfo through channel-safe state updates — the
 * self-reviewer since the channel-safety chain (67725d56 → 020bed88), the
 * judge since 2026-08-23 (mc2-51epl). This is a last-resort recovery for edge
 * cases where neither node path fires — e.g. future refactors that add new
 * terminal conditions without routing them through a node.
 *
 * "Rarely" was not true before the judge was fixed: the judge reached its cap
 * on every exhausted lesson and set nothing, so this net was the primary path
 * and its warning fired on ordinary runs. If the line below appears now, a node
 * really did leave without saying why.
 *
 * It does NOT mutate `result`. The recovered reviewInfo is used only when
 * `result.reviewInfo` is absent, which preserves any node-authored reason
 * verbatim.
 */
function recoverTerminalState(
  result: LessonGraphStateType,
  input: Stage6Input
): { needsReview: boolean; recoveredReviewInfo: LessonGraphStateType['reviewInfo'] } {
  const needsReview = result.needsHumanReview || result.reviewInfo?.needsReview === true;
  if (needsReview || result.lessonContent) {
    return { needsReview, recoveredReviewInfo: null };
  }

  // Cap operator conventions (see docs/specs/stage6-truncation-policy.md):
  //   - retryCount uses >= (count == MAX means cap reached)
  //   - truncationCount uses > (MAX allowed attempts, MAX+1 = exceeded)
  //   - sectionsToRegenerate uses > (MAX allowed sections, MAX+1 = exceeded)
  const retryCapHit = (result.retryCount ?? 0) >= HANDLER_CONFIG.MAX_REGENERATION_RETRIES;
  const truncCapHit =
    (result.truncationCount ?? 0) > HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS;
  const sectionCapHit =
    (result.selfReviewResult?.sectionsToRegenerate?.length ?? 0) >
    HANDLER_CONFIG.MAX_SECTIONS_TO_REGENERATE;

  if (!retryCapHit && !truncCapHit && !sectionCapHit) {
    return { needsReview: false, recoveredReviewInfo: null };
  }

  const reasons =
    result.errors.length > 0
      ? [...result.errors]
      : ['Generation retries exhausted without producing acceptable content'];

  logger.warn(
    {
      lessonId: input.lessonSpec.lesson_id,
      retryCount: result.retryCount,
      truncationCount: result.truncationCount,
      regenerateCount: result.regenerateCount,
      sectionCount: result.selfReviewResult?.sectionsToRegenerate?.length,
      errorCount: result.errors.length,
      capTrigger: retryCapHit ? 'retry' : truncCapHit ? 'truncation' : 'section',
    },
    'Safety-net recovered review_required state — node path did not set channel flags (should be rare post channel-safety chain)'
  );

  return { needsReview: true, recoveredReviewInfo: { needsReview: true, reasons } };
}

/**
 * Execute Stage 6 lesson generation
 *
 * Orchestrates the LangGraph pipeline for a single lesson.
 *
 * @param input - Stage 6 input parameters
 * @returns Generation result and metrics
 */
export async function executeStage6(input: Stage6Input): Promise<Stage6Output> {
  const startTime = Date.now();

  logger.info(
    {
      lessonId: input.lessonSpec.lesson_id,
      courseId: input.courseId,
      hasRagContext: Boolean(input.ragChunks?.length),
      ragChunkCount: input.ragChunks?.length ?? 0,
    },
    'Starting Stage 6 lesson generation'
  );

  try {
    const graph = getGraph();
    const initialState = buildInitialState(input, validateModelOverride(input));

    const result = await graph.invoke(initialState);
    const durationMs = Date.now() - startTime;

    const { needsReview, recoveredReviewInfo } = recoverTerminalState(result, input);

    // If the graph ended in review mode without structured content, synthesize best-effort
    // content from generated markdown so it can be persisted as review_required.
    let lessonContent = result.lessonContent ?? null;
    let synthesizedReviewContent = false;

    if (needsReview && !lessonContent) {
      const contentBody = extractContentBody(result);
      if (contentBody) {
        lessonContent = buildLessonContent(
          result,
          contentBody,
          result.qualityScore ?? 0,
          result.qaSignals ?? null
        );
        synthesizedReviewContent = true;
      }
    }

    const success = needsReview ? true : Boolean(lessonContent) && result.errors.length === 0;

    logger.info(
      {
        lessonId: input.lessonSpec.lesson_id,
        success,
        durationMs,
        tokensUsed: result.tokensUsed,
        finalNode: result.currentNode,
        errorCount: result.errors.length,
        needsReview,
        synthesizedReviewContent,
      },
      'Stage 6 generation complete'
    );

    return {
      lessonContent,
      success,
      errors: result.errors,
      metrics: buildMetrics(result, durationMs),
      // Include review info for UI warnings (undefined if not set).
      // Priority: node-authored reviewInfo > safety-net recovered reviewInfo.
      // This preserves the specific terminal reason set by applyChannelSafeEscalation
      // in the self-reviewer node, falling back to a generic one only if the
      // node path didn't fire.
      reviewInfo: result.reviewInfo ?? recoveredReviewInfo ?? undefined,
      factualWarnings: result.factualWarnings ?? undefined,
      lessonDigest: result.lessonDigest || undefined,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      { lessonId: input.lessonSpec.lesson_id, error: errorMessage, durationMs },
      'Stage 6 generation failed with exception'
    );

    return {
      lessonContent: null,
      success: false,
      errors: [errorMessage],
      metrics: buildMetrics(null, durationMs),
    };
  }
}

/**
 * Execute Stage 6 for multiple lessons (batch processing)
 *
 * Processes lessons in batches with controlled concurrency.
 * Uses Promise.all within batches for parallel execution.
 *
 * @param inputs - Array of Stage 6 inputs to process
 * @param concurrency - Maximum concurrent lesson generations (default: 5)
 * @returns Map of lesson_id -> Stage6Output
 *
 * @example
 * ```typescript
 * const inputs = lessons.map(spec => ({
 *   lessonSpec: spec,
 *   courseId: 'abc-123',
 *   ragChunks: ragChunksMap.get(spec.lesson_id),
 * }));
 *
 * const results = await executeStage6Batch(inputs, 3);
 *
 * results.forEach((output, lessonId) => {
 *   console.log(`Lesson ${lessonId}: ${output.success ? 'OK' : 'FAILED'}`);
 * });
 * ```
 */
export async function executeStage6Batch(
  inputs: Stage6Input[],
  concurrency: number = 5
): Promise<Map<string, Stage6Output>> {
  const results = new Map<string, Stage6Output>();

  logger.info(
    {
      totalLessons: inputs.length,
      concurrency,
    },
    'Starting Stage 6 batch generation'
  );

  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency);
    const batchNumber = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(inputs.length / concurrency);

    logger.debug(
      {
        batch: batchNumber,
        totalBatches,
        batchSize: batch.length,
      },
      'Processing batch'
    );

    // Execute batch in parallel
    const batchResults = await Promise.all(batch.map(input => executeStage6(input)));

    // Store results
    batch.forEach((input, idx) => {
      results.set(input.lessonSpec.lesson_id, batchResults[idx]);
    });
  }

  const totalDuration = Date.now() - startTime;
  const successCount = Array.from(results.values()).filter(r => r.success).length;

  logger.info(
    {
      totalLessons: inputs.length,
      successCount,
      failedCount: inputs.length - successCount,
      totalDurationMs: totalDuration,
      avgDurationMs: Math.round(totalDuration / inputs.length),
    },
    'Stage 6 batch generation complete'
  );

  return results;
}
