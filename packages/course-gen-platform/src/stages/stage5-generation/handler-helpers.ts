/**
 * Stage 5 Generation Handler - Helper Functions
 *
 * Extracted from handler.ts to reduce file size and function complexity.
 * Contains:
 * - Placeholder cleanup logic
 * - Error classification utilities
 * - Model fallback configuration
 * - Model fallback execution
 * - Non-retryable result builder
 *
 * Database helpers (materialization, status updates, worker validation)
 * are in handler-db-helpers.ts.
 *
 * @module orchestrator/handlers/stage5-generation/helpers
 */

import type pino from 'pino';
import type { GenerationJobInput, GenerationResult } from '@megacampus/shared-types';
import logger from '@/shared/logger';
import { GenerationOrchestrator } from './orchestrator';
import { logTrace } from '../../shared/trace-logger';
import {
  OrchestrationFailedError,
  ValidationFailedError,
  QualityThresholdNotMetError,
  MinimumLessonsNotMetError,
  DatabaseError,
  PipelineError,
  classifyPipelineError,
} from '@/shared/errors';
import { ValidationError as QualityValidationError } from '@/shared/validation/quality-validator';

// DB helpers are in ./handler-db-helpers — import directly from there

// ============================================================================
// TYPES
// ============================================================================

/**
 * Error details for STRUCTURE_GENERATION jobs
 */
export interface GenerationErrorDetails {
  /** Error code for classification */
  code:
    | 'ORCHESTRATION_FAILED'
    | 'VALIDATION_FAILED'
    | 'QUALITY_THRESHOLD_NOT_MET'
    | 'MINIMUM_LESSONS_NOT_MET'
    | 'DATABASE_ERROR'
    | 'UNKNOWN';

  /** Human-readable error message */
  message: string;

  /** Phase where error occurred (if applicable) */
  phase?: string;

  /** Additional error context */
  details?: Record<string, unknown>;
}

/**
 * Job result structure for STRUCTURE_GENERATION jobs
 *
 * Returned to BullMQ after job completion (success or failure).
 * Includes detailed error codes for troubleshooting and monitoring.
 */
export interface StructureGenerationJobResult {
  /** Success flag */
  success: boolean;

  /** Status message */
  message?: string;

  /** Course UUID */
  course_id: string;

  /** Complete generation result (only on success) */
  generation_result?: GenerationResult;

  /** Error details (only on failure) */
  error?: GenerationErrorDetails;

  /** Job execution metadata */
  metadata: {
    /** Total duration in milliseconds */
    total_duration_ms: number;

    /** Number of retry attempts */
    retry_count: number;

    /** Completion timestamp (ISO 8601) */
    completed_at: string;
  };
}

// ============================================================================
// MODEL FALLBACK CONFIGURATION
// ============================================================================

/**
 * Model fallback configuration for Stage 5
 * Similar to Stage 6 pattern for consistency
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-004-retry-strategy.md
 */
export const MODEL_FALLBACK = {
  primary: {
    ru: 'qwen/qwen3-235b-a22b-2507',
    en: 'deepseek/deepseek-v3.1-terminus',
  },
  fallback: 'moonshotai/kimi-k2-thinking',
  maxPrimaryAttempts: 2,
} as const;

// ============================================================================
// PLACEHOLDER CLEANUP
// ============================================================================

/** Placeholder patterns that LLMs occasionally generate */
const PLACEHOLDER_PATTERNS = [
  /\[название[^\]]*\]/gi,
  /\[описание[^\]]*\]/gi,
  /\[текст[^\]]*\]/gi,
  /\[insert[^\]]*\]/gi,
  /\[TBD[^\]]*\]/gi,
  /\[TODO[^\]]*\]/gi,
  /\[placeholder[^\]]*\]/gi,
  /\[пример[^\]]*\]/gi,
  /\[добавить[^\]]*\]/gi,
];

/** Generate a replacement for a placeholder based on field name and context */
function generateReplacement(fieldName: string, context: { lessonTitle?: string }): string {
  const topic = context.lessonTitle || 'the topic';
  const replacements: Record<string, string> = {
    exercise_title: `Practice activity for ${topic}`,
    exercise_description: `Apply the concepts learned in this lesson through hands-on practice. Focus on understanding ${topic} through practical application. Complete each step carefully, reflecting on your approach and outcomes.`,
    exercise_type: 'practical exercise',
    lesson_title: `Understanding ${topic}`,
    lesson_description: `In this lesson, we explore ${topic} in detail, building practical skills and theoretical understanding.`,
  };
  return replacements[fieldName] || `Content for ${fieldName.replace(/_/g, ' ')}`;
}

/** Clean a string value by replacing placeholder patterns */
function cleanValue(value: string, fieldName: string, context: { lessonTitle?: string }): string {
  let cleaned = value;
  let hasPlaceholder = false;

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(cleaned)) {
      hasPlaceholder = true;
      const replacement = generateReplacement(fieldName, context);
      cleaned = cleaned.replace(pattern, replacement);
    }
  }

  if (hasPlaceholder) {
    logger.warn(
      { field: fieldName, original: value.substring(0, 50), cleaned: cleaned.substring(0, 50) },
      'Cleaned placeholder in structure'
    );
  }

  return cleaned;
}

/** Recursively clean an object by replacing placeholders in string values */
function cleanObject(
  obj: Record<string, unknown>,
  context: { lessonTitle?: string } = {}
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = cleanValue(value, key, context);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => {
        if (typeof item === 'object' && item !== null) {
          return cleanObject(item as Record<string, unknown>, context);
        }
        return item as unknown;
      });
    } else if (typeof value === 'object' && value !== null) {
      const newContext = { ...context };
      if (key === 'lessons' || (obj.lesson_title && typeof obj.lesson_title === 'string')) {
        newContext.lessonTitle = (obj.lesson_title as string) || context.lessonTitle;
      }
      result[key] = cleanObject(value as Record<string, unknown>, newContext);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Cleanup placeholder patterns in generated content.
 * Safety net for LLMs that occasionally generate placeholder text.
 * Applied BEFORE Zod validation to prevent RT-006 validation failures.
 */
export function cleanupPlaceholdersInStructure(structure: unknown): unknown {
  if (typeof structure === 'object' && structure !== null) {
    return cleanObject(structure as Record<string, unknown>);
  }
  return structure;
}

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/** Error code type for generation errors */
export type GenerationErrorCode =
  | 'ORCHESTRATION_FAILED'
  | 'VALIDATION_FAILED'
  | 'QUALITY_THRESHOLD_NOT_MET'
  | 'MINIMUM_LESSONS_NOT_MET'
  | 'DATABASE_ERROR'
  | 'UNKNOWN';

/** Classify error by instanceof check (Priority 1) */
function classifyByInstance(error: Error | string): GenerationErrorCode | null {
  if (error instanceof OrchestrationFailedError) return 'ORCHESTRATION_FAILED';
  if (error instanceof ValidationFailedError) return 'VALIDATION_FAILED';
  if (error instanceof QualityValidationError) return 'VALIDATION_FAILED';
  if (error instanceof QualityThresholdNotMetError) return 'QUALITY_THRESHOLD_NOT_MET';
  if (error instanceof MinimumLessonsNotMetError) return 'MINIMUM_LESSONS_NOT_MET';
  if (error instanceof DatabaseError) return 'DATABASE_ERROR';
  if (error instanceof PipelineError) {
    return classifyPipelineError(error) as 'ORCHESTRATION_FAILED';
  }
  return null;
}

/** Classify error by message string matching (Priority 2 - fallback for legacy errors) */
function classifyByMessage(errorMessage: string): GenerationErrorCode {
  if (
    errorMessage.includes('StateGraph execution failed') ||
    errorMessage.includes('LangGraph') ||
    errorMessage.includes('phase execution failed')
  ) {
    return 'ORCHESTRATION_FAILED';
  }
  if (
    errorMessage.includes('Schema validation failed') ||
    errorMessage.includes('Zod') ||
    errorMessage.includes('validation error') ||
    errorMessage.includes('invalid type')
  ) {
    return 'VALIDATION_FAILED';
  }
  if (
    errorMessage.includes('quality score') ||
    errorMessage.includes('quality threshold') ||
    errorMessage.includes('0.75')
  ) {
    return 'QUALITY_THRESHOLD_NOT_MET';
  }
  if (
    errorMessage.includes('minimum 10 lessons') ||
    errorMessage.includes('MINIMUM_LESSONS_NOT_MET') ||
    errorMessage.includes('Course must have minimum 10 lessons')
  ) {
    return 'MINIMUM_LESSONS_NOT_MET';
  }
  if (
    errorMessage.includes('Database commit failed') ||
    errorMessage.includes('Database update failed') ||
    errorMessage.includes('Supabase')
  ) {
    return 'DATABASE_ERROR';
  }
  return 'UNKNOWN';
}

/**
 * Classify error into specific error codes.
 * Uses instanceof checks first, then falls back to string matching.
 */
export function classifyGenerationError(error: Error | string): GenerationErrorCode {
  const instanceResult = classifyByInstance(error);
  if (instanceResult) return instanceResult;

  const errorMessage = error instanceof Error ? error.message : String(error);
  return classifyByMessage(errorMessage);
}

/**
 * Determines if an error should be retried by BullMQ.
 * VALIDATION_FAILED errors should NOT be retried as the input is invalid.
 */
export function isRetryableError(errorCode: GenerationErrorCode): boolean {
  if (errorCode === 'VALIDATION_FAILED') return false;
  return true;
}

/**
 * Determine phase from error message for debugging context.
 */
export function determinePhaseFromError(error: Error | string): string | undefined {
  if (!(error instanceof Error)) return undefined;

  const message = error.message;
  if (message.includes('validate_input') || message.includes('Phase 1')) {
    return 'step_1_validate_input';
  } else if (message.includes('generate_metadata') || message.includes('Phase 2')) {
    return 'step_2_generate_metadata';
  } else if (message.includes('generate_sections') || message.includes('Phase 3')) {
    return 'step_3_generate_sections';
  } else if (message.includes('validate_quality') || message.includes('Phase 4')) {
    return 'step_4_validate_quality';
  }
  return undefined;
}

// ============================================================================
// MODEL FALLBACK EXECUTION
// ============================================================================

/**
 * Execute generation with model fallback strategy.
 * Tries primary model up to maxPrimaryAttempts times, then falls back.
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-004-retry-strategy.md
 */
export async function processWithFallback(
  orchestrator: GenerationOrchestrator,
  input: GenerationJobInput,
  modelConfig: typeof MODEL_FALLBACK,
  phaseLogger: pino.Logger
): Promise<GenerationResult> {
  const courseId = input.course_id;
  const language = input.frontend_parameters?.language || 'ru';
  const primaryModel =
    modelConfig.primary[language as keyof typeof modelConfig.primary] || modelConfig.primary.ru;

  // Try primary model
  for (let attempt = 1; attempt <= modelConfig.maxPrimaryAttempts; attempt++) {
    try {
      phaseLogger.info(
        {
          courseId,
          attempt,
          maxAttempts: modelConfig.maxPrimaryAttempts,
          model: primaryModel,
          source: 'primary',
        },
        'Stage 5: Attempting generation with primary model'
      );
      return await orchestrator.execute(input, primaryModel);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Bail out immediately for non-retryable errors (e.g. structural validation mismatch)
      const errorCode = classifyGenerationError(error instanceof Error ? error : String(error));
      if (!isRetryableError(errorCode)) {
        phaseLogger.warn(
          { courseId, attempt, model: primaryModel, errorCode, error: errorMessage },
          'Stage 5: Non-retryable error, skipping remaining attempts and fallback'
        );
        throw error;
      }

      phaseLogger.warn(
        {
          courseId,
          attempt,
          maxAttempts: modelConfig.maxPrimaryAttempts,
          model: primaryModel,
          error: errorMessage,
        },
        'Stage 5: Primary model attempt failed'
      );

      await logTrace({
        courseId,
        stage: 'stage_5',
        phase: 'model_fallback',
        stepName: 'primary_attempt_failed',
        inputData: { attempt, model: primaryModel },
        errorData: { error: errorMessage },
        durationMs: 0,
      });

      if (attempt < modelConfig.maxPrimaryAttempts) {
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        phaseLogger.debug({ courseId, delayMs }, 'Stage 5: Waiting before retry');
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  // Fallback to secondary model
  phaseLogger.info(
    {
      courseId,
      primaryModel,
      fallbackModel: modelConfig.fallback,
      reason: 'Primary model exhausted all attempts',
    },
    'Stage 5: Falling back to secondary model'
  );

  await logTrace({
    courseId,
    stage: 'stage_5',
    phase: 'model_fallback',
    stepName: 'fallback_activated',
    inputData: { primaryModel, fallbackModel: modelConfig.fallback },
    outputData: { reason: 'Primary model exhausted all attempts' },
    durationMs: 0,
  });

  return await orchestrator.execute(input, modelConfig.fallback);
}

// ============================================================================
// RESULT BUILDERS
// ============================================================================

/**
 * Build a non-retryable error result for the job
 */
export function buildNonRetryableResult(
  courseId: string,
  errorCode: GenerationErrorCode,
  errorMessage: string,
  phase: string | undefined,
  startTime: number,
  attemptsMade: number
): StructureGenerationJobResult {
  const endTime = performance.now();
  return {
    success: false,
    message: `Non-retryable error: ${errorMessage}`,
    course_id: courseId,
    error: {
      code: errorCode,
      message: errorMessage,
      phase,
    },
    metadata: {
      total_duration_ms: Math.round(endTime - startTime),
      retry_count: attemptsMade,
      completed_at: new Date().toISOString(),
    },
  };
}
