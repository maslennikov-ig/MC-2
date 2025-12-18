/**
 * Stage 5 Generation Handler
 * @module orchestrator/handlers/stage5-generation
 *
 * Handles STRUCTURE_GENERATION jobs using 5-phase LangGraph orchestration.
 * Executes all 5 generation phases (validate_input, generate_metadata, generate_sections,
 * validate_quality, validate_lessons) and stores the result in courses.course_structure
 * and courses.generation_metadata JSONB columns.
 *
 * Features:
 * - BullMQ handler for job type: STRUCTURE_GENERATION
 * - 5-phase LangGraph orchestration with RT-001 model routing
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
import type { GenerationJobData, GenerationJobInput, GenerationResult } from '@megacampus/shared-types';
import { CourseStructureSchema } from '@megacampus/shared-types/generation-result';
import logger from '@/shared/logger';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { GenerationOrchestrator } from './orchestrator';
import { MetadataGenerator } from './utils/metadata-generator';
import { SectionBatchGenerator } from './utils/section-batch-generator';
import { QualityValidator } from '../../shared/validation/quality-validator';
import { sanitizeCourseStructure } from './utils/sanitize';
import { qdrantClient } from '@/shared/qdrant/client';
import { generationLockService } from '@/shared/locks';

interface CourseStatusRow {
  generation_status: string;
  pause_at_stage_5: boolean;
}

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

/**
 * Classify error into specific error codes
 *
 * Determines the appropriate error code based on error message patterns.
 * Used for monitoring, alerting, and retry decisions.
 *
 * Error codes:
 * - ORCHESTRATION_FAILED: LangGraph workflow execution failed
 * - VALIDATION_FAILED: Zod schema validation failed
 * - QUALITY_THRESHOLD_NOT_MET: Quality score < 0.75
 * - MINIMUM_LESSONS_NOT_MET: Total lessons < 10 (FR-015)
 * - DATABASE_ERROR: Supabase commit failed
 * - UNKNOWN: Unexpected error
 *
 * @param error - Error instance or string
 * @returns Error code for classification
 */
function classifyGenerationError(
  error: Error | string
): 'ORCHESTRATION_FAILED' | 'VALIDATION_FAILED' | 'QUALITY_THRESHOLD_NOT_MET' | 'MINIMUM_LESSONS_NOT_MET' | 'DATABASE_ERROR' | 'UNKNOWN' {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // StateGraph execution failures
  if (
    errorMessage.includes('StateGraph execution failed') ||
    errorMessage.includes('LangGraph') ||
    errorMessage.includes('phase execution failed')
  ) {
    return 'ORCHESTRATION_FAILED';
  }

  // Schema validation failures
  if (
    errorMessage.includes('Schema validation failed') ||
    errorMessage.includes('Zod') ||
    errorMessage.includes('validation error') ||
    errorMessage.includes('invalid type')
  ) {
    return 'VALIDATION_FAILED';
  }

  // Quality threshold failures (FR-026)
  if (
    errorMessage.includes('quality score') ||
    errorMessage.includes('quality threshold') ||
    errorMessage.includes('0.75')
  ) {
    return 'QUALITY_THRESHOLD_NOT_MET';
  }

  // Minimum lessons failures (FR-015)
  if (
    errorMessage.includes('minimum 10 lessons') ||
    errorMessage.includes('MINIMUM_LESSONS_NOT_MET') ||
    errorMessage.includes('Course must have minimum 10 lessons')
  ) {
    return 'MINIMUM_LESSONS_NOT_MET';
  }

  // Database commit failures
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
 * Determine phase from error message
 *
 * Extracts the phase identifier from error messages for better debugging.
 *
 * @param error - Error instance
 * @returns Phase identifier (if determinable)
 */
function determinePhaseFromError(error: Error | string): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const message = error.message;

  if (message.includes('validate_input') || message.includes('Phase 1')) {
    return 'step_1_validate_input';
  } else if (message.includes('generate_metadata') || message.includes('Phase 2')) {
    return 'step_2_generate_metadata';
  } else if (message.includes('generate_sections') || message.includes('Phase 3')) {
    return 'step_3_generate_sections';
  } else if (message.includes('validate_quality') || message.includes('Phase 4')) {
    return 'step_4_validate_quality';
  } else if (message.includes('validate_lessons') || message.includes('Phase 5')) {
    return 'step_5_validate_lessons';
  }

  return undefined;
}

/**
 * Stage 5 Generation Handler
 *
 * Processes STRUCTURE_GENERATION jobs by executing the 5-phase LangGraph
 * orchestrator and storing results in the database.
 *
 * Workflow:
 * 1. Log job start with metadata
 * 2. Execute GenerationOrchestrator.execute() (5 phases)
 * 3. Validate result with Zod schema (CourseStructureSchema)
 * 4. Sanitize for XSS with DOMPurify (FR-008)
 * 5. Atomic database commit (FR-023)
 * 6. Return success result with metadata
 * 7. On error: Classify error, update status to 'generation_failed' (FR-024), throw error
 *
 * Error Handling:
 * - ORCHESTRATION_FAILED: LangGraph workflow failed (BullMQ will retry)
 * - VALIDATION_FAILED: Schema validation failed (BullMQ will retry)
 * - QUALITY_THRESHOLD_NOT_MET: Quality < 0.75 (BullMQ will retry)
 * - MINIMUM_LESSONS_NOT_MET: < 10 lessons (BullMQ will retry)
 * - DATABASE_ERROR: Database commit failed (BullMQ will retry)
 * - UNKNOWN: Unexpected error (BullMQ will retry)
 *
 * Note: This handler doesn't extend BaseJobHandler because GenerationJobData
 * has a different structure (uses 'input' field instead of flat fields).
 * We implement the handler interface directly.
 */
class Stage5GenerationHandler {
  /**
   * Process the STRUCTURE_GENERATION job
   *
   * Main entry point called by BullMQ worker.
   *
   * @param job - BullMQ job instance with GenerationJobData payload
   * @returns Job result with generation data or error details
   */
  async process(job: Job<GenerationJobData>): Promise<StructureGenerationJobResult> {
    const jobData = job.data;

    return await this.execute(jobData, job);
  }

  /**
   * Execute the generation job
   *
   * Core logic for processing the job:
   * 1. Run 5-phase LangGraph orchestration
   * 2. Validate result with Zod schema
   * 3. Sanitize for XSS
   * 4. Store result in database (atomic commit)
   * 5. Log metrics and completion
   * 6. Return structured result
   *
   * @param jobData - Job payload from BullMQ
   * @param job - BullMQ job instance
   * @returns Structured job result
   */
  async execute(
    jobData: GenerationJobData,
    job: Job<GenerationJobData>
  ): Promise<StructureGenerationJobResult> {
    const startTime = Date.now();

    // Handle both old format (with input/metadata wrapper) and new flat format
    const jobDataAny = jobData as unknown as Record<string, any>;
    const input = (jobDataAny.input || jobDataAny) as GenerationJobInput;
    const metadata = jobDataAny.metadata || {
      jobId: job.id,
      priority: job.opts?.priority || 1,
      attempt: job.attemptsMade,
    };

    const { course_id, organization_id, user_id } = input;

    // Acquire generation lock (FR-037: Prevent concurrent generation)
    const lockId = `stage-5-${job.id || Date.now()}`;
    const lockResult = await generationLockService.acquireLock(course_id, lockId);
    if (!lockResult.acquired) {
      logger.warn({ courseId: course_id, reason: lockResult.reason }, 'Failed to acquire generation lock');
      throw new Error(`Course ${course_id} is already being processed: ${lockResult.reason}`);
    }

    // Set up heartbeat to extend lock every 2 minutes
    const heartbeatInterval = setInterval(() => {
      void (async () => {
        try {
          const extended = await generationLockService.extendLock(course_id, lockId);
          if (!extended) {
            logger.warn({ courseId: course_id, lockId }, 'Heartbeat: lock extension failed');
          } else {
            logger.debug({ courseId: course_id, lockId }, 'Heartbeat: lock extended');
          }
        } catch (err) {
          logger.error({ courseId: course_id, lockId, error: err }, 'Heartbeat error');
        }
      })();
    }, 120000); // Every 2 minutes

    try {
    // Layer 3: Worker validation and fallback initialization for Stage 5
    const supabaseForValidation = getSupabaseAdmin();
    const { data } = await supabaseForValidation
      .from('courses')
      .select('generation_status, pause_at_stage_5')
      .eq('id', course_id)
      .single();

    const course = data as unknown as CourseStatusRow;

    if (!course) {
      logger.error({ courseId: course_id, jobId: job.id }, 'Worker validation: Course not found');
      throw new Error('Course not found');
    }

    // Check if Stage 5 is initialized (valid states: stage_5_init, stage_5_generating, stage_5_awaiting_approval)
    const validStage5States = ['stage_5_init', 'stage_5_generating', 'stage_5_awaiting_approval'];
    if (!validStage5States.includes(course.generation_status)) {
      logger.warn({
        courseId: course_id,
        jobId: job.id,
        currentStatus: course.generation_status,
      }, 'Worker validation: Stage 5 not initialized, initializing as fallback');

      try {
        const { InitializeFSMCommandHandler } = await import('@/shared/fsm/fsm-initialization-command-handler');
        const { metricsStore } = await import('@/orchestrator/metrics');

        const commandHandler = new InitializeFSMCommandHandler();
        await commandHandler.handle({
          entityId: course_id,
          userId: user_id || 'system',
          organizationId: organization_id || 'unknown',
          idempotencyKey: `worker-fallback-stage5-${job.id}`,
          initiatedBy: 'WORKER',
          initialState: 'stage_5_init',
          data: { trigger: 'worker_fallback_stage5' },
          jobs: [],
        });

        // Track Layer 3 success
        metricsStore.recordLayer3Activation(true, course_id);

        logger.info({ courseId: course_id, jobId: job.id }, 'Worker fallback: Stage 5 initialized successfully');
      } catch (error) {
        // Track Layer 3 failure
        const { metricsStore } = await import('@/orchestrator/metrics');
        metricsStore.recordLayer3Activation(false, course_id);

        logger.warn({
          courseId: course_id,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        }, 'Worker fallback initialization failed (continuing processing)');
      }
    }

    // Continue normal processing...

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

    const supabaseAdmin = getSupabaseAdmin();

    try {
      // =================================================================
      // STEP 1: Execute 5-Phase LangGraph Orchestration
      // =================================================================
      jobLogger.info('Initializing GenerationOrchestrator');

      // Initialize services with optional RAG context
      const qdrantClientInstance = input.vectorized_documents ? qdrantClient : undefined;

      const orchestrator = new GenerationOrchestrator(
        new MetadataGenerator(),
        new SectionBatchGenerator(),
        new QualityValidator(),
        qdrantClientInstance
      );

      // Update course status to 'stage_5_init' before starting generation
      jobLogger.info('Setting course status to stage_5_init');
      const { error: statusError } = await supabaseAdmin
        .from('courses')
        .update({ generation_status: 'stage_5_init' as const })
        .eq('id', course_id);

      if (statusError) {
        throw new Error(`Failed to update status to stage_5_init: ${statusError.message}`);
      }

      // Update to stage_5_generating before orchestration
      jobLogger.info('Setting course status to stage_5_generating');
      const { error: generatingError } = await supabaseAdmin
        .from('courses')
        .update({ generation_status: 'stage_5_generating' as const })
        .eq('id', course_id);

      if (generatingError) {
        throw new Error(`Failed to update status to stage_5_generating: ${generatingError.message}`);
      }

      jobLogger.info('Executing 5-phase generation pipeline');

      const result: GenerationResult = await orchestrator.execute(input);

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

      // =================================================================
      // STEP 2: Validate Result with Zod Schema
      // =================================================================
      jobLogger.info('Validating course structure with Zod schema');

      const validationResult = CourseStructureSchema.safeParse(result.course_structure);

      if (!validationResult.success) {
        const validationErrors = validationResult.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');

        jobLogger.error(
          {
            validationErrors: validationResult.error.issues,
          },
          'Schema validation failed'
        );

        throw new Error(`Schema validation failed: ${validationErrors}`);
      }

      jobLogger.info('Schema validation passed');

      // =================================================================
      // STEP 3: Sanitize for XSS Prevention (FR-008)
      // =================================================================
      jobLogger.info('Sanitizing course structure for XSS prevention (FR-008)');

      const sanitizedStructure = sanitizeCourseStructure(result.course_structure);

      jobLogger.info('XSS sanitization complete');

      // =================================================================
      // STEP 4: Atomic Database Commit with Multi-Step Status Update (FR-023)
      // =================================================================
      jobLogger.info(
        {
          courseId: course_id,
          pauseAtStage5: course.pause_at_stage_5,
        },
        'Committing course structure to database (atomic commit)'
      );

      // Step 1: Mark stage 5 awaiting approval and save structure
      // Stage Gates: Wait for user approval before proceeding to Stage 6
      jobLogger.info('Setting course status to stage_5_awaiting_approval (Stage Gates)');
      const { error: completeError } = await supabaseAdmin
        .from('courses')
        .update({
          generation_status: 'stage_5_awaiting_approval' as const, // Stage Gates: Wait for approval
          course_structure: sanitizedStructure, // Save structure here
          generation_metadata: result.generation_metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', course_id);

      if (completeError) {
        throw new Error(`Failed to update status to stage_5_awaiting_approval: ${completeError.message}`);
      }

      // Stage Gates: Stop here and wait for user approval
      // After approval, ManualStage6Panel will be shown for selective lesson generation (FR-007)
      jobLogger.info('Stage 5 complete - awaiting user approval before Stage 6');

      jobLogger.info(
        {
          courseId: course_id,
        },
        'Course structure committed successfully'
      );

      // =================================================================
      // STEP 5: Calculate Final Metrics
      // =================================================================
      const totalDurationMs = Date.now() - startTime;

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

      // =================================================================
      // STEP 6: Return Success Result
      // =================================================================
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
      // =================================================================
      // ERROR HANDLING
      // =================================================================
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

      // Classify error for monitoring and retry decisions
      const errorCode = classifyGenerationError(error instanceof Error ? error : String(error));

      jobLogger.info(
        {
          errorCode,
          shouldRetry: true, // All errors are retriable (BullMQ will retry per config)
        },
        'Error classified'
      );

      // Determine phase from error message (if available)
      const phase = determinePhaseFromError(error instanceof Error ? error : String(error));

      if (phase) {
        jobLogger.info(
          {
            phase,
          },
          'Error occurred in specific phase'
        );
      }

      // =================================================================
      // FR-024: Update courses.generation_status = 'failed'
      // =================================================================
      jobLogger.info(
        {
          courseId: course_id,
          errorCode,
        },
        'Updating generation_status to failed (FR-024)'
      );

      try {
        const { error: statusUpdateError } = await supabaseAdmin
          .from('courses')
          .update({
            generation_status: 'failed', // FR-024: Mark generation as failed
            failed_at_stage: 5,  // Track which stage failed
            error_code: errorCode as any,  // Classified error code
            updated_at: new Date().toISOString(),
          })
          .eq('id', course_id);

        if (statusUpdateError) {
          jobLogger.error(
            {
              error: statusUpdateError,
              courseId: course_id,
            },
            'Failed to update generation_status to failed'
          );
        } else {
          jobLogger.info(
            {
              courseId: course_id,
            },
            'Generation status updated to failed'
          );
        }
      } catch (statusError) {
        jobLogger.error(
          {
            error: statusError instanceof Error ? statusError.message : String(statusError),
            courseId: course_id,
          },
          'Exception while updating course status'
        );
      }

      // Log error classification for monitoring
      jobLogger.warn(
        {
          errorCode,
          phase,
        },
        'Generation error - BullMQ will retry per job configuration'
      );

      // Re-throw error to let BullMQ handle retries
      // BullMQ will retry based on job configuration (maxAttempts, backoff, etc.)
      // The error result will be constructed by BullMQ's failure handler
      throw error;
    }
    } finally {
      clearInterval(heartbeatInterval); // Clear heartbeat
      // Release generation lock (FR-037: always release in finally)
      await generationLockService.releaseLock(course_id, lockId);
    }
  }
}

/**
 * Export singleton instance
 *
 * Used by worker.ts to register the handler:
 * ```typescript
 * import { stage5GenerationHandler } from './handlers/stage5-generation';
 *
 * worker.on('active', (job) => {
 *   if (job.name === 'STRUCTURE_GENERATION') {
 *     await stage5GenerationHandler.process(job);
 *   }
 * });
 * ```
 */
export const stage5GenerationHandler = new Stage5GenerationHandler();

export default stage5GenerationHandler;
