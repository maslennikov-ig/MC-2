import type { GenerationState } from '../../utils/generation-state.js';
import pino from 'pino';
import { GenerationJobInputSchema } from '@megacampus/shared-types/generation-job';
import { logTrace } from '../../../../shared/trace-logger.js';

const logger = pino({
  name: 'generation-phases:validate-input',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Phase 1: Validate input with GenerationJobInputSchema
 *
 * Validates the input job data against the Zod schema to ensure all
 * required fields are present and valid before starting generation.
 *
 * No retry logic needed - schema validation is deterministic.
 *
 * @param state - Current generation state
 * @returns Updated state with validation results
 */
export async function validateInputPhase(state: GenerationState): Promise<GenerationState> {
  const startTime = Date.now();
  const courseId = state.input.course_id;

  await logTrace({
    courseId,
    stage: 'stage_5',
    phase: 'validate_input',
    stepName: 'phase_start',
    inputData: { hasAnalysisResult: !!state.input.analysis_result },
    durationMs: 0,
  });

  try {
    logger.info({ phase: 'validate_input' }, 'Starting input validation');

    // Validate with GenerationJobInputSchema
    const result = GenerationJobInputSchema.safeParse(state.input);

    if (!result.success) {
      const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      const errorMessage = `Input validation failed: ${errors.join('; ')}`;

      logger.error({ phase: 'validate_input', errors }, 'Input validation failed');

      await logTrace({
        courseId,
        stage: 'stage_5',
        phase: 'validate_input',
        stepName: 'phase_error',
        errorData: { message: errorMessage, errors },
        durationMs: Date.now() - startTime,
      });

      return {
        ...state,
        errors: [...state.errors, errorMessage],
        phaseDurations: {
          ...state.phaseDurations,
          validate_input: Date.now() - startTime,
        },
      };
    }

    logger.info({ phase: 'validate_input' }, 'Input validation passed');

    await logTrace({
      courseId,
      stage: 'stage_5',
      phase: 'validate_input',
      stepName: 'phase_complete',
      outputData: { valid: true },
      durationMs: Date.now() - startTime,
    });

    return {
      ...state,
      phaseDurations: {
        ...state.phaseDurations,
        validate_input: Date.now() - startTime,
      },
      currentPhase: 'generate_metadata',
    };
  } catch (error) {
    logger.error(
      { error, phase: 'validate_input' },
      'Input validation encountered unexpected error'
    );

    await logTrace({
      courseId,
      stage: 'stage_5',
      phase: 'validate_input',
      stepName: 'phase_error',
      errorData: { message: error instanceof Error ? error.message : String(error) },
      durationMs: Date.now() - startTime,
    });

    return {
      ...state,
      errors: [
        ...state.errors,
        `Input validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}
