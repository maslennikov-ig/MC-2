import type { GenerationState } from '../../utils/generation-state.js';
import type { MetadataGenerator } from '../../utils/metadata-generator.js';
import pino from 'pino';
import { logTrace } from '../../../../shared/trace-logger.js';
import { RETRY_CONFIG, exponentialBackoff } from './utils.js';

const logger = pino({
  name: 'generation-phases:generate-metadata',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Phase 2: Generate course metadata using MetadataGenerator
 *
 * Calls MetadataGenerator.generate() which implements RT-001 hybrid routing:
 * - Critical fields → qwen3-max (learning_outcomes, pedagogical_strategy, etc.)
 * - Non-critical fields → OSS 120B (course_description, course_tags, etc.)
 *
 * Implements RT-004 retry logic with exponential backoff (max 3 attempts).
 *
 * @param state - Current generation state
 * @param metadataGenerator - Instance of MetadataGenerator
 * @returns Updated state with metadata and tracking metrics
 */
export async function generateMetadataPhase(
  state: GenerationState,
  metadataGenerator: MetadataGenerator
): Promise<GenerationState> {
  const startTime = Date.now();
  const courseId = state.input.course_id;
  let attempt = 0;

  await logTrace({
    courseId,
    stage: 'stage_5',
    phase: 'generate_metadata',
    stepName: 'phase_start',
    inputData: { maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS },
    durationMs: 0,
  });

  while (attempt < RETRY_CONFIG.MAX_ATTEMPTS) {
    attempt++;

    try {
      logger.info(
        { phase: 'generate_metadata', attempt, maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS },
        'Generating metadata'
      );

      // Call MetadataGenerator (RT-001 hybrid routing)
      const result = await metadataGenerator.generate(state.input);

      const duration = Date.now() - startTime;

      logger.info(
        {
          phase: 'generate_metadata',
          modelUsed: result.modelUsed,
          tokensUsed: result.tokensUsed,
          retryCount: result.retryCount,
          duration,
        },
        'Metadata generation succeeded'
      );

      await logTrace({
        courseId,
        stage: 'stage_5',
        phase: 'generate_metadata',
        stepName: 'phase_complete',
        outputData: { hasTitle: !!result.metadata.course_title },
        modelUsed: result.modelUsed,
        tokensUsed: result.tokensUsed,
        durationMs: Date.now() - startTime,
        retryAttempt: attempt - 1,
      });

      return {
        ...state,
        metadata: result.metadata as import('@megacampus/shared-types').CourseMetadata,
        tokenUsage: {
          ...state.tokenUsage,
          metadata: result.tokensUsed,
          total: state.tokenUsage.total + result.tokensUsed,
        },
        modelUsed: {
          ...state.modelUsed,
          metadata: result.modelUsed,
        },
        retryCount: {
          ...state.retryCount,
          metadata: attempt - 1,
        },
        phaseDurations: {
          ...state.phaseDurations,
          generate_metadata: duration,
        },
        currentPhase: 'generate_sections',
      };
    } catch (error) {
      logger.warn({ error, attempt, phase: 'generate_metadata' }, 'Metadata generation failed');

      await logTrace({
        courseId,
        stage: 'stage_5',
        phase: 'generate_metadata',
        stepName: 'attempt_failed',
        errorData: { message: error instanceof Error ? error.message : String(error), attempt },
        durationMs: Date.now() - startTime,
        retryAttempt: attempt - 1,
      });

      if (attempt >= RETRY_CONFIG.MAX_ATTEMPTS) {
        const errorMessage = `Metadata generation failed after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error({ phase: 'generate_metadata' }, errorMessage);
        return {
          ...state,
          errors: [...state.errors, errorMessage],
        };
      }

      // RT-004: Exponential backoff
      const delay = exponentialBackoff(attempt, RETRY_CONFIG.BASE_DELAY_MS);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here due to loop logic
  return {
    ...state,
    errors: [...state.errors, 'Metadata generation failed unexpectedly'],
  };
}
