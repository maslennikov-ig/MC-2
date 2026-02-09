/**
 * Stage 5 Generation Handler
 * @module orchestrator/handlers/stage5-generation
 *
 * Handles STRUCTURE_GENERATION jobs using 4-phase LangGraph orchestration.
 * Executes all 4 generation phases (validate_input, generate_metadata, generate_sections,
 * validate_quality) and stores the result in courses.course_structure
 * and courses.generation_metadata JSONB columns.
 *
 * Lesson validation (>=10 lessons) performed in performPostGenerationQualityGate after StateGraph.
 *
 * Features:
 * - BullMQ handler for job type: STRUCTURE_GENERATION
 * - 4-phase LangGraph orchestration with RT-001 model routing
 * - Zod schema validation with CourseStructureSchema
 * - XSS sanitization with DOMPurify (FR-008)
 * - Atomic database commit (FR-023)
 * - FR-024 error status handling (status='generation_failed')
 * - Quality threshold enforcement (0.75 minimum)
 * - Minimum 10 lessons validation (FR-015)
 * - Error classification: ORCHESTRATION_FAILED, VALIDATION_FAILED, QUALITY_THRESHOLD_NOT_MET,
 *   MINIMUM_LESSONS_NOT_MET, DATABASE_ERROR, UNKNOWN
 */

import { Job } from 'bullmq';
import type {
  GenerationJobData,
  GenerationJobInput,
  GenerationResult,
} from '@megacampus/shared-types';
import { CourseStructureSchema } from '@megacampus/shared-types/generation-result';
import logger from '@/shared/logger';
import type pino from 'pino';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { GenerationOrchestrator } from './orchestrator';
import { MetadataGenerator } from './utils/metadata-generator';
import { SectionBatchGenerator } from './utils/section-batch-generator';
import { QualityValidator } from '../../shared/validation/quality-validator';
import { sanitizeCourseStructure } from './utils/sanitize';
import { qdrantClient } from '@/shared/qdrant/client';
import { acquireGenerationLock } from '@/shared/locks';
import {
  triggerCourseCard,
  // DISABLED: triggerAllLessonCovers - lesson covers now manual via UI
} from '../stage7-enrichments/services/auto-card-trigger';
import { handleStageCompletion } from '@/shared/auto-approval';
import { checkPauseAndDelay } from '../../shared/pause-check';
import { isPipelineInterrupt } from '@/shared/errors';

// Import helpers extracted from this file
import {
  type StructureGenerationJobResult,
  type GenerationErrorDetails,
  MODEL_FALLBACK,
  cleanupPlaceholdersInStructure,
  classifyGenerationError,
  isRetryableError,
  determinePhaseFromError,
  processWithFallback,
  buildNonRetryableResult,
} from './handler-helpers';
import {
  validateAndInitializeStage5,
  materializeSectionsAndLessons,
  markCourseAsFailed,
  updateStatusForGenerationStart,
  trackStage5Tokens,
} from './handler-db-helpers';

// Re-export types for consumers
export type { GenerationErrorDetails, StructureGenerationJobResult };

/**
 * Stage 5 Generation Handler
 *
 * Processes STRUCTURE_GENERATION jobs by executing the 4-phase LangGraph
 * orchestrator and storing results in the database.
 */
class Stage5GenerationHandler {
  /**
   * Process the STRUCTURE_GENERATION job
   *
   * Main entry point called by BullMQ worker.
   *
   * @param job - BullMQ job instance with GenerationJobData payload
   * @param token - BullMQ job token for pause/delay operations
   * @returns Job result with generation data or error details
   */
  async process(
    job: Job<GenerationJobData>,
    token?: string
  ): Promise<StructureGenerationJobResult> {
    return await this.execute(job.data, job, token);
  }

  /**
   * Execute the generation job
   *
   * Core logic: orchestration -> validation -> sanitization -> DB commit -> result
   */
  async execute(
    jobData: GenerationJobData,
    job: Job<GenerationJobData>,
    token?: string
  ): Promise<StructureGenerationJobResult> {
    const startTime = Date.now();

    // Handle both old format (with input/metadata wrapper) and new flat format
    const jobDataAny = jobData as unknown as Record<string, unknown>;
    const input = (jobDataAny.input || jobDataAny) as GenerationJobInput;
    const metadata = (jobDataAny.metadata as {
      jobId: string;
      priority: number;
      attempt: number;
    }) || {
      jobId: job.id,
      priority: job.opts?.priority || 1,
      attempt: job.attemptsMade,
    };

    const { course_id, organization_id, user_id } = input;

    // Issue #2: Warn if token is missing - pause functionality won't work
    if (!token) {
      logger.warn(
        { jobId: job.id, courseId: course_id, organizationId: organization_id },
        'Job token missing - pause/delay functionality disabled for this job'
      );
    }

    // Check if generation is paused before starting work
    await checkPauseAndDelay(job, course_id, token);

    // Acquire generation lock with heartbeat (FR-037: Prevent concurrent generation)
    const lockGuard = await acquireGenerationLock(
      course_id,
      `stage-5-${job.id || Date.now()}`,
      logger
    );

    try {
      // Layer 3: Worker validation and fallback initialization
      const course = await validateAndInitializeStage5(course_id, user_id, organization_id, job.id);

      const jobLogger = logger.child({
        jobId: job.id,
        jobType: 'STRUCTURE_GENERATION',
        courseId: course_id,
        organizationId: organization_id,
        userId: user_id,
        attemptsMade: job.attemptsMade,
      });

      jobLogger.info(
        {
          courseTitle: input.frontend_parameters.course_title,
          language: input.frontend_parameters.language,
          hasAnalysis: !!input.analysis_result,
          documentCount: input.document_summaries?.length || 0,
          priority: metadata.priority,
          attempt: metadata.attempt,
        },
        'Starting Stage 5 generation job'
      );

      try {
        // STEP 1: Execute generation pipeline with model fallback
        const result = await this.executeGenerationPipeline(input, jobLogger);

        // STEP 2: Validate and sanitize the result
        const sanitizedStructure = this.validateAndSanitize(result, jobLogger);

        // STEP 3: Commit to database and handle post-generation tasks
        await this.commitAndFinalize(
          course_id,
          organization_id,
          user_id,
          sanitizedStructure,
          result,
          course,
          lockGuard,
          jobLogger
        );

        // STEP 4: Return success result
        const totalDurationMs = Date.now() - startTime;
        this.logSuccessMetrics(result, totalDurationMs, jobLogger);

        // Auto-trigger Course Card Generation (non-blocking)
        triggerCourseCard({
          courseId: course_id,
          userId: user_id,
          organizationId: organization_id,
        }).catch(err => {
          jobLogger.warn(
            { courseId: course_id, error: err instanceof Error ? err.message : String(err) },
            'Non-blocking: Failed to trigger course card generation'
          );
        });

        return {
          success: true,
          message: 'Generation completed successfully',
          course_id,
          generation_result: result,
          metadata: {
            total_duration_ms: totalDurationMs,
            retry_count: job.attemptsMade,
            completed_at: new Date().toISOString(),
          },
        };
      } catch (error) {
        return await this.handleExecutionError(error, course_id, startTime, job, jobLogger);
      }
    } finally {
      // Release generation lock (FR-037: always release in finally)
      await lockGuard.release();
    }
  }

  /**
   * Execute the generation pipeline with model fallback
   */
  private async executeGenerationPipeline(
    input: GenerationJobInput,
    jobLogger: pino.Logger
  ): Promise<GenerationResult> {
    jobLogger.info('Initializing GenerationOrchestrator');

    // Initialize services with optional RAG context
    const qdrantClientInstance = input.vectorized_documents ? qdrantClient : undefined;

    const orchestrator = new GenerationOrchestrator(
      new MetadataGenerator(),
      new SectionBatchGenerator(),
      new QualityValidator(),
      qdrantClientInstance
    );

    // Update status transitions
    await updateStatusForGenerationStart(input.course_id, jobLogger);

    jobLogger.info('Executing 4-phase generation pipeline');

    const result: GenerationResult = await processWithFallback(
      orchestrator,
      input,
      MODEL_FALLBACK,
      jobLogger
    );

    jobLogger.info(
      {
        sectionsCount: result.course_structure.sections.length,
        totalLessons: result.course_structure.sections.reduce(
          (sum, section) => sum + section.lessons.length,
          0
        ),
        totalTokens: result.generation_metadata.total_tokens.total,
        overallQuality: result.generation_metadata.quality_scores.overall,
        costUsd: result.generation_metadata.cost_usd,
      },
      'Generation orchestration completed'
    );

    return result;
  }

  /**
   * Validate with Zod schema and sanitize for XSS
   */
  private validateAndSanitize(
    result: GenerationResult,
    jobLogger: pino.Logger
  ): typeof result.course_structure {
    // Cleanup placeholders before validation
    jobLogger.info('Cleaning up potential LLM placeholders in course structure');
    const cleanedStructure = cleanupPlaceholdersInStructure(result.course_structure);

    // Validate with Zod schema
    jobLogger.info('Validating course structure with Zod schema');
    const validationResult = CourseStructureSchema.safeParse(cleanedStructure);

    if (!validationResult.success) {
      const validationErrors = validationResult.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');

      jobLogger.error(
        { validationErrors: validationResult.error.issues },
        'Schema validation failed'
      );

      throw new Error(`Schema validation failed: ${validationErrors}`);
    }

    jobLogger.info('Schema validation passed');

    // Sanitize for XSS Prevention (FR-008)
    jobLogger.info('Sanitizing course structure for XSS prevention (FR-008)');
    const sanitizedStructure = sanitizeCourseStructure(
      cleanedStructure as typeof result.course_structure
    );
    jobLogger.info('XSS sanitization complete');

    return sanitizedStructure;
  }

  /**
   * Commit structure to database and handle post-generation tasks
   */
  private async commitAndFinalize(
    courseId: string,
    _organizationId: string | undefined,
    _userId: string | undefined,
    sanitizedStructure: GenerationResult['course_structure'],
    result: GenerationResult,
    course: { pause_at_stage_5: boolean },
    lockGuard: { heartbeatInterval: ReturnType<typeof setInterval>; release: () => Promise<void> },
    jobLogger: pino.Logger
  ): Promise<void> {
    const supabaseAdmin = getSupabaseAdmin();

    jobLogger.info(
      { courseId, pauseAtStage5: course.pause_at_stage_5 },
      'Committing course structure to database (atomic commit)'
    );

    // Save structure
    const { error: structureError } = await supabaseAdmin
      .from('courses')
      .update({
        course_structure: sanitizedStructure,
        generation_metadata: result.generation_metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);

    if (structureError) {
      throw new Error(`Failed to save structure: ${structureError.message}`);
    }

    // Materialize sections and lessons to DB tables (non-fatal on failure)
    jobLogger.info('Materializing sections and lessons to database tables');
    try {
      await materializeSectionsAndLessons(courseId, sanitizedStructure, jobLogger);
    } catch (materializeError) {
      jobLogger.warn(
        {
          courseId,
          error:
            materializeError instanceof Error ? materializeError.message : String(materializeError),
        },
        'Failed to materialize sections/lessons (non-fatal, Stage 6 will use JSONB)'
      );
    }

    // Clear heartbeat - lock will be released in finally block
    clearInterval(lockGuard.heartbeatInterval);

    // Track tokens in generation_progress
    const stage5Tokens = result.generation_metadata?.total_tokens?.total;
    await trackStage5Tokens(courseId, stage5Tokens, jobLogger);

    // Handle stage completion (checks generation_mode)
    const { autoApproved } = await handleStageCompletion(courseId, 5);
    jobLogger.info(
      { courseId, autoApproved },
      autoApproved ? 'Stage 5 auto-approved -> Stage 6 queued' : 'Stage 5 awaiting approval'
    );

    jobLogger.info({ courseId }, 'Course structure committed successfully');
  }

  /**
   * Log success metrics after generation completes
   */
  private logSuccessMetrics(
    result: GenerationResult,
    totalDurationMs: number,
    jobLogger: pino.Logger
  ): void {
    jobLogger.info(
      {
        duration_ms: totalDurationMs,
        sections_count: result.course_structure.sections.length,
        total_lessons: result.course_structure.sections.reduce(
          (sum, section) => sum + section.lessons.length,
          0
        ),
        estimated_hours: result.course_structure.estimated_duration_hours,
        difficulty: result.course_structure.difficulty_level,
        learning_outcomes: result.course_structure.learning_outcomes.length,
        total_cost_usd: result.generation_metadata.cost_usd,
        total_tokens: result.generation_metadata.total_tokens.total,
        overall_quality: result.generation_metadata.quality_scores.overall,
        model_metadata: result.generation_metadata.model_used.metadata,
        model_sections: result.generation_metadata.model_used.sections,
        batch_count: result.generation_metadata.batch_count,
        retry_metadata: result.generation_metadata.retry_count.metadata,
        retry_sections: result.generation_metadata.retry_count.sections,
      },
      'Stage 5 generation job completed successfully'
    );
  }

  /**
   * Handle execution errors: classify, update DB status, decide retry
   */
  private async handleExecutionError(
    error: unknown,
    courseId: string,
    startTime: number,
    job: Job<GenerationJobData>,
    jobLogger: pino.Logger
  ): Promise<StructureGenerationJobResult> {
    // Interrupts are control flow, not errors
    if (isPipelineInterrupt(error)) {
      jobLogger.info({ code: (error as { code: string }).code }, 'Pipeline paused');
      throw error;
    }

    const totalDurationMs = Date.now() - startTime;

    jobLogger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration_ms: totalDurationMs,
        attemptsMade: job.attemptsMade,
      },
      'Stage 5 generation job failed'
    );

    // Classify error
    const errorCode = classifyGenerationError(error instanceof Error ? error : String(error));
    const shouldRetry = isRetryableError(errorCode);
    const phase = determinePhaseFromError(error instanceof Error ? error : String(error));

    jobLogger.info({ errorCode, shouldRetry, phase }, 'Error classified');

    // FR-024: Mark as failed on last attempt or non-retryable
    const maxAttempts = job.opts.attempts || 3;
    const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

    if (isLastAttempt) {
      jobLogger.info(
        { courseId, errorCode, attemptsMade: job.attemptsMade, maxAttempts },
        'Last retry attempt - Updating generation_status to failed (FR-024)'
      );
      await markCourseAsFailed(courseId, errorCode, jobLogger);
    } else {
      jobLogger.info(
        {
          courseId,
          errorCode,
          attemptsMade: job.attemptsMade,
          remainingAttempts: maxAttempts - job.attemptsMade - 1,
        },
        'Not last attempt - Keeping status for BullMQ retry'
      );
    }

    // Handle non-retryable errors immediately
    if (!shouldRetry) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      jobLogger.warn({ errorCode, phase, error: errorMessage }, 'Non-retryable error');

      await markCourseAsFailed(courseId, errorCode, jobLogger);

      return buildNonRetryableResult(
        courseId,
        errorCode,
        errorMessage,
        phase,
        startTime,
        job.attemptsMade
      );
    }

    // Re-throw for BullMQ retry
    jobLogger.warn({ errorCode, phase, shouldRetry }, 'Generation error - BullMQ will retry');
    throw error;
  }
}

/**
 * Export singleton instance
 */
export const stage5GenerationHandler = new Stage5GenerationHandler();

export default stage5GenerationHandler;
