import type { GenerationState } from '../../utils/generation-state.js';
import type {
  SectionBatchGenerator,
  SectionBatchResult,
} from '../../utils/section-batch-generator.js';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { GenerationJobInput, Section } from '@megacampus/shared-types';
import pino from 'pino';
import pLimit from 'p-limit';
import { logTrace } from '../../../../shared/trace-logger.js';
import {
  createModelConfigService,
  getEffectiveStageConfig,
} from '../../../../shared/llm/model-config-service.js';
import { exponentialBackoff, buildSectionDigest, SECTION_RETRY_CONFIG } from './utils.js';

const logger = pino({
  name: 'generation-phases:generate-sections',
  level: process.env.LOG_LEVEL || 'info',
});

// Helper for single section generation
async function generateSingleSectionWithRetry(
  sectionIndex: number,
  input: GenerationJobInput,
  sectionBatchGenerator: SectionBatchGenerator,
  qdrantClient?: QdrantClient,
  courseId?: string,
  previousSectionsDigest?: string
): Promise<SectionBatchResult> {
  const sectionStartTime = Date.now();

  if (courseId) {
    await logTrace({
      courseId,
      stage: 'stage_5',
      phase: 'generate_sections',
      stepName: `section_${sectionIndex + 1}_start`,
      inputData: { sectionNumber: sectionIndex + 1 },
      durationMs: 0,
    });
  }

  logger.info(
    {
      phase: 'generate_sections',
      sectionIndex: sectionIndex + 1,
    },
    `Starting generation for section ${sectionIndex + 1}`
  );

  const result = await sectionBatchGenerator.generateBatch(
    sectionIndex + 1, // batchNum (1-indexed for logging)
    sectionIndex, // startSection (0-indexed)
    sectionIndex + 1, // endSection (exclusive, 1 section per batch)
    input,
    qdrantClient,
    undefined, // overlapFeedback (not used in initial generation)
    previousSectionsDigest
  );

  const sectionDuration = Date.now() - sectionStartTime;

  logger.info(
    {
      phase: 'generate_sections',
      sectionIndex: sectionIndex + 1,
      duration: sectionDuration,
      tokensUsed: result.tokensUsed,
      modelUsed: result.modelUsed,
    },
    `Section ${sectionIndex + 1} generated in ${Math.round(sectionDuration / 1000)}s`
  );

  if (courseId) {
    await logTrace({
      courseId,
      stage: 'stage_5',
      phase: 'generate_sections',
      stepName: `section_${sectionIndex + 1}_complete`,
      outputData: {
        lessonsGenerated: result.sections[0]?.lessons.length || 0,
        modelUsed: result.modelUsed,
        tier: result.tier,
        retryCount: result.retryCount,
      },
      modelUsed: result.modelUsed,
      tokensUsed: result.tokensUsed,
      durationMs: sectionDuration,
    });
  }

  return result;
}

async function retrySingleSection(
  failed: { index: number; error: string },
  input: GenerationJobInput,
  sectionBatchGenerator: SectionBatchGenerator,
  qdrantClient: QdrantClient | undefined,
  maxRetries: number,
  previousSectionsDigest: string
): Promise<
  | { success: true; index: number; result: SectionBatchResult }
  | { success: false; index: number; error: string }
> {
  let lastError = failed.error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const delay = exponentialBackoff(attempt, SECTION_RETRY_CONFIG.RETRY_DELAY_MS);

    logger.info(
      {
        phase: 'generate_sections',
        sectionIndex: failed.index + 1,
        attempt,
        maxAttempts: maxRetries,
        delayMs: delay,
      },
      `Retry attempt ${attempt}/${maxRetries} for section ${failed.index + 1} after ${delay}ms delay`
    );

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const result = await generateSingleSectionWithRetry(
        failed.index,
        input,
        sectionBatchGenerator,
        qdrantClient,
        input.course_id,
        previousSectionsDigest
      );

      logger.info(
        {
          phase: 'generate_sections',
          sectionIndex: failed.index + 1,
          attempt,
        },
        `Section ${failed.index + 1} succeeded on retry attempt ${attempt}`
      );

      return { success: true, index: failed.index, result };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      logger.warn(
        {
          phase: 'generate_sections',
          sectionIndex: failed.index + 1,
          attempt,
          error: lastError,
        },
        `Section ${failed.index + 1} retry attempt ${attempt} failed`
      );
    }
  }

  logger.error(
    {
      phase: 'generate_sections',
      sectionIndex: failed.index + 1,
      maxAttempts: maxRetries,
      error: lastError,
    },
    `Section ${failed.index + 1} failed after all ${maxRetries} retry attempts`
  );

  return { success: false, index: failed.index, error: lastError };
}

async function retryFailedSections(
  failedResults: Array<{ index: number; error: string }>,
  input: GenerationJobInput,
  sectionBatchGenerator: SectionBatchGenerator,
  qdrantClient: QdrantClient | undefined,
  maxRetries: number,
  previousSectionsDigest: string
): Promise<{
  successes: Array<{ index: number; result: SectionBatchResult }>;
  failures: Array<{ index: number; error: string }>;
}> {
  const successes: Array<{ index: number; result: SectionBatchResult }> = [];
  const failures: Array<{ index: number; error: string }> = [];

  if (failedResults.length === 0) {
    return { successes, failures };
  }

  logger.info(
    {
      phase: 'generate_sections',
      failedCount: failedResults.length,
      maxRetries,
    },
    `Retrying ${failedResults.length} failed sections (parallel, max 2 concurrent)`
  );

  const retryLimit = pLimit(2);

  const retryPromises = failedResults.map(failed =>
    retryLimit(() =>
      retrySingleSection(
        failed,
        input,
        sectionBatchGenerator,
        qdrantClient,
        maxRetries,
        previousSectionsDigest
      )
    )
  );

  const results = await Promise.allSettled(retryPromises);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.success) {
        successes.push({ index: result.value.index, result: result.value.result });
      } else {
        failures.push({ index: result.value.index, error: result.value.error });
      }
    } else {
      const errorMessage =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      failures.push({ index: -1, error: errorMessage });
    }
  }

  logger.info(
    {
      phase: 'generate_sections',
      retriedSuccessCount: successes.length,
      finalFailureCount: failures.length,
    },
    `Retry phase complete: ${successes.length} recovered, ${failures.length} final failures`
  );

  return { successes, failures };
}

/**
 * Phase 3: Generate sections using SectionBatchGenerator with sequential processing
 *
 * @param state - Current generation state (must have metadata)
 * @param sectionBatchGenerator - Generator instance
 * @param qdrantClient - Optional RAG client
 * @returns Updated state with accumulated sections and tracking metrics
 */
export async function generateSectionsPhase(
  state: GenerationState,
  sectionBatchGenerator: SectionBatchGenerator,
  qdrantClient?: QdrantClient
): Promise<GenerationState> {
  const startTime = Date.now();
  const courseId = state.input.course_id;

  try {
    logger.info(
      { phase: 'generate_sections' },
      'Starting sequential section generation with digest accumulation'
    );

    if (!state.input.analysis_result) {
      throw new Error(
        'Cannot generate sections: analysis_result is null (title-only scenario not supported)'
      );
    }

    const recommendedStructure = state.input.analysis_result.recommended_structure;
    const requestedSections =
      recommendedStructure.total_sections ?? recommendedStructure.sections_breakdown.length;
    const availableSections = recommendedStructure.sections_breakdown.length;

    if (requestedSections > availableSections) {
      logger.warn(
        {
          courseId,
          requestedSections,
          availableSections,
          discrepancy: requestedSections - availableSections,
        },
        'total_sections exceeds sections_breakdown length, capping to available sections'
      );
    }

    const totalSections = Math.min(requestedSections, availableSections);

    await logTrace({
      courseId,
      stage: 'stage_5',
      phase: 'generate_sections',
      stepName: 'phase_start',
      inputData: { totalSections, generationMode: 'sequential' },
      durationMs: 0,
    });

    let retryAttemptsPerSection = 3;

    try {
      const modelConfigService = createModelConfigService();
      const phaseConfig = await modelConfigService.getModelForPhase('stage_5_normal');
      const effectiveConfig = getEffectiveStageConfig(phaseConfig);
      retryAttemptsPerSection = effectiveConfig.maxRetries;

      logger.info(
        {
          phase: 'generate_sections',
          retryAttemptsPerSection,
          source: phaseConfig.source,
        },
        'Using database-driven retry attempts config'
      );
    } catch (error) {
      logger.warn(
        {
          phase: 'generate_sections',
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to load retry config, using default: 3'
      );
    }

    logger.info(
      {
        phase: 'generate_sections',
        totalSections,
        retryAttemptsPerSection,
      },
      `Generating ${totalSections} sections sequentially with digest accumulation`
    );

    const sectionIndices = Array.from({ length: totalSections }, (_, i) => i);

    const successfulResults: Array<{ index: number; result: SectionBatchResult }> = [];
    const failedResults: Array<{ index: number; error: string }> = [];
    let previousSectionsDigest = '';

    for (const sectionIndex of sectionIndices) {
      try {
        logger.info(
          {
            phase: 'generate_sections',
            sectionIndex: sectionIndex + 1,
            totalSections,
            digestLength: previousSectionsDigest.length,
          },
          `Generating section ${sectionIndex + 1}/${totalSections} with digest from ${sectionIndex} previous sections`
        );

        const result = await generateSingleSectionWithRetry(
          sectionIndex,
          state.input,
          sectionBatchGenerator,
          qdrantClient,
          state.input.course_id,
          previousSectionsDigest
        );
        successfulResults.push({ index: sectionIndex, result });

        if (result.sections.length > 0) {
          const digest = buildSectionDigest(result.sections[0], sectionIndex);
          if (digest) {
            previousSectionsDigest += digest;
          }
        }
      } catch (error) {
        failedResults.push({
          index: sectionIndex,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info(
      {
        phase: 'generate_sections',
        successCount: successfulResults.length,
        failureCount: failedResults.length,
        failedIndices: failedResults.map(f => f.index),
      },
      `Sequential generation complete: ${successfulResults.length}/${totalSections} succeeded`
    );

    const retriedResults = await retryFailedSections(
      failedResults,
      state.input,
      sectionBatchGenerator,
      qdrantClient,
      retryAttemptsPerSection,
      previousSectionsDigest
    );

    successfulResults.push(...retriedResults.successes);
    const finalFailures = retriedResults.failures;

    const allSections: Section[] = successfulResults
      .flatMap(r => r.result.sections)
      .sort((a, b) => (a.section_number ?? 0) - (b.section_number ?? 0));

    const totalTokensUsed = successfulResults.reduce((sum, r) => sum + r.result.tokensUsed, 0);
    const aggregatedRetryCounts = successfulResults.map(r => r.result.retryCount);
    const sectionModelBreakdown = successfulResults
      .map(r => ({
        section_number: r.index + 1,
        model: r.result.modelUsed,
        tier: r.result.tier,
        retry_count: r.result.retryCount,
      }))
      .sort((a, b) => a.section_number - b.section_number);
    const uniqueSectionModels = [...new Set(sectionModelBreakdown.map(item => item.model))];
    const lastModelUsed =
      successfulResults.length > 0
        ? successfulResults[successfulResults.length - 1].result.modelUsed
        : '';

    const duration = Date.now() - startTime;

    logger.info(
      {
        phase: 'generate_sections',
        totalSections: allSections.length,
        totalTokens: totalTokensUsed,
        duration,
        durationPerSection: allSections.length > 0 ? Math.round(duration / allSections.length) : 0,
        failedSections: finalFailures.length,
        uniqueSectionModels,
      },
      `Section generation completed in ${Math.round(duration / 1000)}s (${allSections.length}/${totalSections} sections)`
    );

    await logTrace({
      courseId,
      stage: 'stage_5',
      phase: 'generate_sections',
      stepName: 'phase_complete',
      outputData: {
        totalSections: allSections.length,
        successCount: successfulResults.length,
        failureCount: finalFailures.length,
        digestChars: previousSectionsDigest.length,
        sectionModelBreakdown,
      },
      tokensUsed: totalTokensUsed,
      durationMs: duration,
    });

    let updatedState: GenerationState = {
      ...state,
      sections: allSections,
      tokenUsage: {
        ...state.tokenUsage,
        sections: totalTokensUsed,
        total: state.tokenUsage.total + totalTokensUsed,
      },
      modelUsed: {
        ...state.modelUsed,
        sections: lastModelUsed,
        sections_breakdown: sectionModelBreakdown,
      },
      retryCount: {
        ...state.retryCount,
        sections: aggregatedRetryCounts,
      },
      phaseDurations: {
        ...state.phaseDurations,
        generate_sections: duration,
      },
      currentPhase: 'validate_quality',
    };

    if (finalFailures.length > 0) {
      const errorMessages = finalFailures.map(
        f =>
          `Section ${f.index + 1} generation failed after ${retryAttemptsPerSection} retries: ${f.error}`
      );
      updatedState = {
        ...updatedState,
        errors: [...updatedState.errors, ...errorMessages],
      };
    }

    return updatedState;
  } catch (error) {
    logger.error({ error, phase: 'generate_sections' }, 'Section generation failed');
    return {
      ...state,
      errors: [
        ...state.errors,
        `Section generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}
