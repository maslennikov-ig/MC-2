/**
 * Analysis Validation Utilities
 *
 * Contains validation logic extracted from analysis-orchestrator.ts:
 * - Stage 3 barrier validation
 * - Input validation
 * - Progress tracking helpers
 * - Error message formatting
 *
 * This module was split from analysis-orchestrator.ts to comply with
 * the 300-line-per-module constitution principle.
 *
 * @module analysis-validators
 */

import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { validateStage4Barrier } from '../../../shared/fsm/stage-barrier';
import logger from '../../../shared/logger';

/**
 * Russian progress messages for each phase (FR-018)
 *
 * Matches internal phases to user-facing status updates:
 * - Phase 0: Pre-flight validation (barrier check, document completeness)
 * - Phase 1: Basic classification (category, audience, topic parsing)
 * - Phase 2: Scope analysis (lesson count, hours, module breakdown)
 * - Phase 3: Deep expert analysis (research flags, pedagogy, expansion areas)
 * - Phase 4: Document synthesis (multi-source integration)
 * - Phase 6: RAG planning (document-to-section mapping for Generation)
 * - Phase 5: Final assembly (validation, quality checks)
 */
export const PROGRESS_MESSAGES = {
  step_0_start: 'Проверка документов...',
  step_0_complete: 'Проверка завершена',
  step_1_start: 'Базовая категоризация курса...',
  step_1_complete: 'Категоризация завершена',
  step_2_start: 'Оценка объема и структуры...',
  step_2_complete: 'Оценка завершена',
  step_3_start: 'Глубокий экспертный анализ...',
  step_3_complete: 'Экспертный анализ завершен',
  step_4_start: 'Синтез документов...',
  step_4_complete: 'Синтез завершен',
  step_6_start: 'Планирование RAG для генерации...',
  step_6_complete: 'Планирование RAG завершено',
  step_5_start: 'Финализация анализа...',
  step_5_complete: 'Анализ завершен',
} as const;

/**
 * Progress percentage ranges for each phase
 *
 * Ensures smooth progress bar transitions (0-100%)
 */
export const PROGRESS_RANGES = {
  step_0: { start: 0, end: 10 },
  step_1: { start: 10, end: 20 },
  step_2: { start: 20, end: 35 },
  step_3: { start: 35, end: 60 },
  step_4: { start: 60, end: 75 },
  step_6: { start: 75, end: 85 },
  step_5: { start: 85, end: 100 },
} as const;

/**
 * Update course progress via Supabase RPC
 *
 * Uses `update_course_progress` RPC from Stage 1 for real-time progress updates.
 * Updates both generation_status and generation_progress fields atomically.
 *
 * @param courseId - Course UUID
 * @param status - Generation status (e.g., 'in_progress', 'failed')
 * @param progressPercent - Progress percentage (0-100)
 * @param message - Russian status message
 * @param supabase - Supabase client instance
 */
export async function updateCourseProgress(
  courseId: string,
  status: string,
  progressPercent: number,
  message: string,
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<void> {
  const { error } = await supabase.rpc('update_course_progress', {
    p_course_id: courseId,
    p_step_id: 4, // Stage 4 Analysis
    p_status: status,
    p_message: message,
    p_percent_complete: progressPercent,
  });

  if (error) {
    logger.warn(
      {
        courseId,
        error,
        status,
        progressPercent,
        message,
      },
      'Failed to update course progress (non-blocking)'
    );
  } else {
    logger.debug(
      {
        courseId,
        status,
        progressPercent,
        message,
      },
      'Course progress updated'
    );
  }
}

/**
 * Stage 3 Barrier Validation Result
 */
export interface BarrierValidationResult {
  canProceed: boolean;
  totalFiles: number;
  completedFiles: number;
  errorMessage?: string;
}

/**
 * Validate Stage 3 barrier for analysis orchestration
 *
 * Checks that all documents have been processed successfully before
 * starting analysis. This prevents analysis from running on incomplete
 * or failed document processing.
 *
 * Validation Rules:
 * - All documents must have processing_status = 'completed'
 * - All documents must have processed_content IS NOT NULL
 * - If any document fails these checks, barrier fails
 *
 * @param courseId - Course UUID to validate
 * @param supabase - Supabase client instance
 * @returns Barrier validation result with error details if failed
 * @throws Never throws - always returns result object
 *
 * @example
 * const result = await validateStage3Barrier(courseId, supabase);
 * if (!result.canProceed) {
 *   throw new Error(`BARRIER_FAILED: ${result.errorMessage}`);
 * }
 */
export async function validateStage3Barrier(
  courseId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<BarrierValidationResult> {
  try {
    const barrierResult = await validateStage4Barrier(courseId, supabase);

    return {
      canProceed: barrierResult.canProceed,
      totalFiles: barrierResult.totalFiles || 0,
      completedFiles: barrierResult.completedFiles || 0,
      errorMessage: barrierResult.errorMessage,
    };
  } catch (error) {
    logger.error(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error during Stage 3 barrier validation'
    );

    return {
      canProceed: false,
      totalFiles: 0,
      completedFiles: 0,
      errorMessage: 'Internal error during barrier validation',
    };
  }
}

/**
 * Format error message for course progress update
 *
 * Converts internal error codes to user-friendly Russian messages.
 *
 * Error Code Mapping:
 * - BARRIER_FAILED: Document processing incomplete
 * - MINIMUM_LESSONS_NOT_MET: Insufficient scope for minimum 10 lessons
 * - LLM_ERROR: LLM processing failure after retries
 * - Default: Generic analysis error
 *
 * @param error - Error object or string
 * @returns User-friendly Russian error message
 *
 * @example
 * const message = formatErrorMessage(new Error('BARRIER_FAILED: 2 docs incomplete'));
 * // Returns: 'Обработка документов не завершена - требуется ручное вмешательство'
 */
export function formatErrorMessage(error: Error | string): string {
  const errorStr = error instanceof Error ? error.message : String(error);

  if (errorStr.startsWith('BARRIER_FAILED:')) {
    return 'Обработка документов не завершена - требуется ручное вмешательство';
  } else if (errorStr.includes('Insufficient scope for minimum 10 lessons')) {
    return 'Недостаточный объем для минимума 10 уроков - расширьте тему';
  } else if (errorStr.startsWith('LLM_ERROR:')) {
    return 'Ошибка обработки LLM - обратитесь в поддержку';
  }

  return 'Ошибка при анализе курса';
}

/**
 * Validate job input before starting orchestration
 *
 * Performs basic input validation to catch errors early:
 * - Topic length (3-200 characters)
 * - Language code (2 characters)
 * - Lesson duration (3-45 minutes)
 * - Document summaries format (if provided)
 *
 * @param input - Structure analysis job input
 * @throws Error if validation fails
 *
 * @example
 * validateJobInput(job.input);
 * // Throws if input is invalid
 */
export function validateJobInput(input: {
  topic: string;
  language: string;
  lesson_duration_minutes: number;
  document_summaries?: Array<{ document_id: string; file_name: string; processed_content: string }>;
}): void {
  if (input.topic.length < 3 || input.topic.length > 200) {
    throw new Error('Topic must be between 3 and 200 characters');
  }

  if (input.language.length !== 2) {
    throw new Error('Language must be a 2-character ISO 639-1 code');
  }

  if (input.lesson_duration_minutes < 3 || input.lesson_duration_minutes > 45) {
    throw new Error('Lesson duration must be between 3 and 45 minutes');
  }

  if (input.document_summaries) {
    for (const doc of input.document_summaries) {
      if (!doc.document_id || !doc.file_name || !doc.processed_content) {
        throw new Error('Invalid document summary format');
      }
    }
  }
}

/**
 * Phase execution helper - starts a phase
 *
 * Updates progress and logs phase start
 */
export async function startPhase(
  phaseNumber: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  courseId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  phaseLogger: { info: (msg: string) => void }
): Promise<void> {
  const stepKey = `step_${phaseNumber}` as const;
  await updateCourseProgress(
    courseId,
    'in_progress',
    PROGRESS_RANGES[stepKey].start,
    PROGRESS_MESSAGES[`${stepKey}_start`],
    supabase
  );
  phaseLogger.info(`Phase ${phaseNumber}: Starting`);
}

/**
 * Phase execution helper - completes a phase
 *
 * Updates progress and logs phase completion
 */
export async function completePhase(
  phaseNumber: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  courseId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  phaseLogger: { info: (msg: string) => void; } & { info: (metadata: Record<string, unknown>, msg: string) => void },
  metadata?: Record<string, unknown>
): Promise<void> {
  const stepKey = `step_${phaseNumber}` as const;

  if (metadata) {
    phaseLogger.info(metadata, `Phase ${phaseNumber}: Completed`);
  } else {
    phaseLogger.info(`Phase ${phaseNumber}: Completed`);
  }

  await updateCourseProgress(
    courseId,
    'in_progress',
    PROGRESS_RANGES[stepKey].end,
    PROGRESS_MESSAGES[`${stepKey}_complete`],
    supabase
  );
}
