import { logger } from '@/shared/logger';
import { getGraph } from '../graph';
import { HANDLER_CONFIG } from '../config';
import type { Stage6Input, Stage6Output } from '../types';
import type { LessonGraphStateType } from '../state';
import { buildLessonContent, extractContentBody } from '../judge/judge-helpers';

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

    // Validate modelOverride format (should be "provider/model-name")
    let validatedModelOverride = input.modelOverride ?? null;
    if (validatedModelOverride && !validatedModelOverride.includes('/')) {
      logger.warn(
        {
          lessonId: input.lessonSpec.lesson_id,
          modelOverride: validatedModelOverride,
        },
        'ModelOverride format invalid (expected "provider/model-name"), falling back to database config'
      );
      validatedModelOverride = null;
    }

    // Build initial state
    const initialState: Partial<LessonGraphStateType> = {
      lessonSpec: input.lessonSpec,
      courseId: input.courseId,
      language: input.language,
      lessonUuid: input.lessonUuid ?? null,
      ragChunks: input.ragChunks ?? [],
      ragContextId: input.ragContextId ?? null,
      userRefinementPrompt: input.userRefinementPrompt ?? null,
      modelOverride: validatedModelOverride,
      style: input.style ?? null,
      analysisResult: input.analysisResult ?? null,
      selectedModel: input.selectedModel ?? null,
      fallbackModel: input.fallbackModel ?? null,
      selectedModelTier: input.selectedModelTier ?? null,
      selectedModelTierReason: input.selectedModelTierReason ?? null,
      currentNode: 'generator',
      errors: [],
      retryCount: 0,
      regenerateCount: 0,
      truncationCount: 0,
      rejectedTokens: 0,
      lastGenerationTokens: 0,
      regenerationMode: null,
    };

    // Execute graph
    const result = await graph.invoke(initialState);

    const durationMs = Date.now() - startTime;

    // Fail-open: review-required outcomes should not trigger outer fallback loops.
    //
    // SAFETY NET (defensive): the self-reviewer node already sets needsHumanReview
    // and reviewInfo through channel-safe state updates (applyChannelSafeEscalation).
    // This block is a last-resort recovery for edge cases where the node path might
    // not fire — e.g. future refactors that add new terminal conditions without
    // routing them through the node. Since channel-safety chain landed (commits
    // 67725d56 → 020bed88), the node path is authoritative; this safety net should
    // rarely trigger in production.
    //
    // IMPORTANT: this block does NOT mutate `result`. Instead it computes a local
    // recoveredReviewInfo that's used only if `result.reviewInfo` is absent.
    // This preserves any node-authored reason verbatim.
    let needsReview = result.needsHumanReview || result.reviewInfo?.needsReview === true;
    let recoveredReviewInfo: typeof result.reviewInfo = null;

    if (!needsReview && !result.lessonContent) {
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

      if (retryCapHit || truncCapHit || sectionCapHit) {
        needsReview = true;

        const reasons =
          result.errors.length > 0
            ? [...result.errors]
            : ['Generation retries exhausted without producing acceptable content'];

        recoveredReviewInfo = {
          needsReview: true,
          reasons,
        };

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
      }
    }
    let lessonContent = result.lessonContent ?? null;
    let synthesizedReviewContent = false;

    // If the graph ended in review mode without structured content, synthesize best-effort content
    // from generated markdown so it can be persisted as review_required.
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
      metrics: {
        tokensUsed: result.tokensUsed,
        durationMs,
        modelUsed: result.modelUsed ?? null,
        selectedModel: result.selectedModel ?? null,
        fallbackModel: result.fallbackModel ?? null,
        selectedModelTier: result.selectedModelTier ?? null,
        selectedModelTierReason: result.selectedModelTierReason ?? null,
        qualityScore: result.qualityScore ?? 0,
        regenerateCount: result.regenerateCount ?? 0,
        truncationCount: result.truncationCount ?? 0,
        rejectedTokens: result.rejectedTokens ?? 0,
        regenerationMode: result.regenerationMode ?? null,
      },
      // Include review info for UI warnings (undefined if not set).
      // Priority: node-authored reviewInfo > safety-net recovered reviewInfo.
      // This preserves the specific terminal reason set by applyChannelSafeEscalation
      // in the self-reviewer node, falling back to a generic one only if the
      // node path didn't fire.
      reviewInfo: result.reviewInfo ?? recoveredReviewInfo ?? undefined,
      lessonDigest: result.lessonDigest || undefined,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        lessonId: input.lessonSpec.lesson_id,
        error: errorMessage,
        durationMs,
      },
      'Stage 6 generation failed with exception'
    );

    return {
      lessonContent: null,
      success: false,
      errors: [errorMessage],
      metrics: {
        tokensUsed: 0,
        durationMs,
        modelUsed: null,
        selectedModel: null,
        fallbackModel: null,
        selectedModelTier: null,
        selectedModelTierReason: null,
        qualityScore: 0,
        regenerateCount: 0,
        truncationCount: 0,
        rejectedTokens: 0,
        regenerationMode: null,
      },
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
