import { logger } from '@/shared/logger';
import { getGraph } from '../graph';
import type { Stage6Input, Stage6Output } from '../types';
import type { LessonGraphStateType } from '../state';

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
      currentNode: 'generator',
      errors: [],
      retryCount: 0,
    };

    // Execute graph
    const result = await graph.invoke(initialState);

    const durationMs = Date.now() - startTime;

    // Determine success based on output
    const success = Boolean(result.lessonContent) && result.errors.length === 0;

    logger.info(
      {
        lessonId: input.lessonSpec.lesson_id,
        success,
        durationMs,
        tokensUsed: result.tokensUsed,
        finalNode: result.currentNode,
        errorCount: result.errors.length,
      },
      'Stage 6 generation complete'
    );

    return {
      lessonContent: result.lessonContent ?? null,
      success,
      errors: result.errors,
      metrics: {
        tokensUsed: result.tokensUsed,
        durationMs,
        modelUsed: result.modelUsed ?? null,
        qualityScore: result.qualityScore ?? 0,
      },
      // Include review info for UI warnings (undefined if not set)
      reviewInfo: result.reviewInfo ?? undefined,
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
        qualityScore: 0,
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
