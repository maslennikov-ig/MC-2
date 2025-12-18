/**
 * Stage 4 Analysis Handler
 * @module orchestrator/handlers/stage4-analysis
 *
 * Handles STRUCTURE_ANALYSIS jobs using multi-phase analysis orchestration.
 * Executes all 6 analysis phases (pre-flight, classification, scope, expert, synthesis, assembly)
 * and stores the result in courses.analysis_result JSONB column.
 *
 * Features:
 * - BullMQ handler for job type: STRUCTURE_ANALYSIS
 * - Multi-phase LLM orchestration with progress tracking
 * - Stage 3 barrier enforcement (100% document completion)
 * - Minimum 10 lessons validation (hard requirement)
 * - Error classification: BARRIER_FAILED, MINIMUM_LESSONS_NOT_MET, LLM_ERROR
 * - Database updates: courses.analysis_result
 * - Real-time progress tracking via RPC
 */

import { Job } from 'bullmq';
import type { StructureAnalysisJobData } from '@megacampus/shared-types';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import logger from '../../shared/logger';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { runAnalysisOrchestration } from './orchestrator';
import { generationLockService } from '@/shared/locks';

/**
 * Error details for STRUCTURE_ANALYSIS jobs
 */
export interface AnalysisErrorDetails {
  /** Error code for classification */
  code: 'BARRIER_FAILED' | 'MINIMUM_LESSONS_NOT_MET' | 'LLM_ERROR' | 'UNKNOWN';

  /** Human-readable error message */
  message: string;

  /** Phase where error occurred (if applicable) */
  phase?: string;

  /** Additional error context */
  details?: Record<string, unknown>;
}

/**
 * Job result structure for STRUCTURE_ANALYSIS jobs
 *
 * Returned to BullMQ after job completion (success or failure).
 * Includes detailed error codes for troubleshooting and monitoring.
 */
export interface StructureAnalysisJobResult {
  /** Success flag */
  success: boolean;

  /** Status message */
  message?: string;

  /** Course UUID */
  course_id: string;

  /** Complete analysis result (only on success) */
  analysis_result?: AnalysisResult;

  /** Error details (only on failure) */
  error?: AnalysisErrorDetails;

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
 * - BARRIER_FAILED: Stage 3 document processing not complete
 * - MINIMUM_LESSONS_NOT_MET: Topic too narrow (<10 lessons estimated)
 * - LLM_ERROR: LLM processing failure (API error, timeout, etc.)
 * - UNKNOWN: Unexpected error
 *
 * @param error - Error instance or string
 * @returns Error code for classification
 */
function classifyAnalysisError(
  error: Error | string
): 'BARRIER_FAILED' | 'MINIMUM_LESSONS_NOT_MET' | 'LLM_ERROR' | 'UNKNOWN' {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('BARRIER_FAILED') || errorMessage.includes('Stage 3 barrier')) {
    return 'BARRIER_FAILED';
  }

  if (
    errorMessage.includes('Insufficient scope for minimum 10 lessons') ||
    errorMessage.includes('MINIMUM_LESSONS_NOT_MET')
  ) {
    return 'MINIMUM_LESSONS_NOT_MET';
  }

  if (
    errorMessage.includes('LLM_ERROR') ||
    errorMessage.includes('OpenRouter') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('API error')
  ) {
    return 'LLM_ERROR';
  }

  return 'UNKNOWN';
}

/**
 * Stage 4 Analysis Handler
 *
 * Processes STRUCTURE_ANALYSIS jobs by executing the multi-phase analysis
 * orchestrator and storing results in the database.
 *
 * Workflow:
 * 1. Log job start with metadata
 * 2. Execute runAnalysisOrchestration (6 phases)
 * 3. Store result in courses.analysis_result (JSONB)
 * 4. Return success result with metadata
 * 5. On error: Classify error, log details, return error result
 *
 * Error Handling:
 * - BARRIER_FAILED: Stage 3 incomplete (no retry)
 * - MINIMUM_LESSONS_NOT_MET: Topic too narrow (no retry)
 * - LLM_ERROR: LLM failure (BullMQ will retry per config)
 * - UNKNOWN: Unexpected error (BullMQ will retry)
 *
 * Note: This handler doesn't extend BaseJobHandler because StructureAnalysisJobData
 * has a different structure (uses 'input' field instead of flat fields).
 * We implement the handler interface directly.
 */
class Stage4AnalysisHandler {
  /**
   * Process the STRUCTURE_ANALYSIS job
   *
   * Main entry point called by BullMQ worker.
   *
   * @param job - BullMQ job instance with StructureAnalysisJob payload
   * @returns Job result with analysis data or error details
   */
  async process(job: Job<StructureAnalysisJobData>): Promise<StructureAnalysisJobResult> {
    const jobData = job.data;

    return await this.execute(jobData, job);
  }

  /**
   * Execute the analysis job
   *
   * Core logic for processing the job:
   * 1. Run multi-phase orchestration
   * 2. Store result in database
   * 3. Log metrics and completion
   * 4. Return structured result
   *
   * @param jobData - Job payload from BullMQ
   * @param job - BullMQ job instance
   * @returns Structured job result
   */
  async execute(
    jobData: StructureAnalysisJobData,
    job: Job<StructureAnalysisJobData>
  ): Promise<StructureAnalysisJobResult> {
    const startTime = Date.now();
    // Extract identifiers from job data (now correctly typed as camelCase from BaseJobDataSchema)
    const { courseId: course_id, organizationId: organization_id, userId: user_id } = jobData;

    // Acquire generation lock (FR-037: Prevent concurrent generation)
    const lockId = `stage-4-${job.id || Date.now()}`;
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
    // Layer 3: Worker validation and fallback initialization for Stage 4
    const supabaseForValidation = getSupabaseAdmin();
    const { data: course, error: courseError } = await supabaseForValidation
      .from('courses')
      .select('generation_status')
      .eq('id', course_id)
      .single();

    if (courseError || !course) {
      logger.error({
        courseId: course_id,
        jobId: job.id,
        error: courseError?.message,
        errorCode: courseError?.code,
        errorDetails: courseError?.details,
        errorHint: courseError?.hint,
      }, 'Worker validation: Course not found');
      throw new Error(`Course not found: ${courseError?.message || 'No data returned'}`);
    }

    // Check if Stage 4 is initialized (valid states: stage_4_init, stage_4_analyzing, stage_4_awaiting_approval)
    // If still in earlier stages (pending, stage_2_*, stage_3_*), initialize Stage 4
    const validStage4States = ['stage_4_init', 'stage_4_analyzing', 'stage_4_awaiting_approval'];
    if (!validStage4States.includes(course.generation_status as string)) {
      logger.warn({
        courseId: course_id,
        jobId: job.id,
        currentStatus: course.generation_status,
      }, 'Worker validation: Stage 4 not initialized, initializing as fallback');

      try {
        const { InitializeFSMCommandHandler } = await import('../../shared/fsm/fsm-initialization-command-handler');
        const { metricsStore } = await import('../../orchestrator/metrics');

        const commandHandler = new InitializeFSMCommandHandler();
        await commandHandler.handle({
          entityId: course_id,
          userId: user_id || 'system',
          organizationId: organization_id || 'unknown',
          idempotencyKey: `worker-fallback-stage4-${job.id}`,
          initiatedBy: 'WORKER',
          initialState: 'stage_4_init',
          data: { trigger: 'worker_fallback_stage4' },
          jobs: [],
        });

        // Track Layer 3 success
        metricsStore.recordLayer3Activation(true, course_id);

        logger.info({ courseId: course_id, jobId: job.id }, 'Worker fallback: Stage 4 initialized successfully');
      } catch (error) {
        // Track Layer 3 failure
        const { metricsStore } = await import('../../orchestrator/metrics');
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
      jobType: 'STRUCTURE_ANALYSIS',
      courseId: course_id,
      organizationId: organization_id,
      userId: user_id,
      attemptsMade: job.attemptsMade,
    });

    // =================================================================
    // BUILD ANALYSIS INPUT FROM DATABASE
    // StructureAnalysisJobData (camelCase) doesn't include input field -
    // the handler always fetches course data from the database.
    // =================================================================
    jobLogger.info('Fetching course data from database for analysis input');

    // Fetch course metadata
    const { data: courseForInput, error: courseInputError } = await supabaseForValidation
      .from('courses')
      .select('title, language, style, difficulty, settings')
      .eq('id', course_id)
      .single();

    if (courseInputError || !courseForInput) {
      throw new Error(`Failed to fetch course data: ${courseInputError?.message || 'Course not found'}`);
    }

    // Fetch document summaries from file_catalog
    const { data: documents } = await supabaseForValidation
      .from('file_catalog')
      .select('id, original_name, filename, processed_content, summary_metadata')
      .eq('course_id', course_id)
      .eq('vector_status', 'indexed')
      .not('processed_content', 'is', null);

    type SummaryMetadata = { original_tokens?: number; summary_tokens?: number; compression_ratio?: number; quality_score?: number };
    const documentSummaries = (documents || []).map((doc) => {
      const metadata = doc.summary_metadata as SummaryMetadata | null;
      return {
        document_id: doc.id,
        file_name: doc.original_name || doc.filename || 'unknown',
        processed_content: doc.processed_content || '',
        processing_method: 'balanced' as const,
        summary_metadata: {
          original_tokens: metadata?.original_tokens || 0,
          summary_tokens: metadata?.summary_tokens || 0,
          compression_ratio: metadata?.compression_ratio || 1,
          quality_score: metadata?.quality_score || 0.8,
        },
      };
    });

    // Build input from database values
    // Extract lesson_duration_minutes from settings JSONB if available
    const settings = courseForInput.settings as { lesson_duration_minutes?: number } | null;
    const lessonDuration = settings?.lesson_duration_minutes || 15;

    // Helper to convert language names to ISO 639-1 codes
    const languageNameToCode: Record<string, string> = {
      'Russian': 'ru', 'English': 'en', 'Chinese': 'zh', 'Spanish': 'es',
      'French': 'fr', 'German': 'de', 'Japanese': 'ja', 'Korean': 'ko',
      'Arabic': 'ar', 'Portuguese': 'pt', 'Italian': 'it', 'Turkish': 'tr',
      'Vietnamese': 'vi', 'Thai': 'th', 'Indonesian': 'id', 'Malay': 'ms',
      'Hindi': 'hi', 'Bengali': 'bn', 'Polish': 'pl',
    };
    const rawLang = courseForInput.language || 'ru';
    // If it's already a 2-char code, use it; otherwise convert from name
    const language = rawLang.length === 2 ? rawLang : (languageNameToCode[rawLang] || 'ru');

    // Build StructureAnalysisInput for orchestrator
    const analysisInput: import('@megacampus/shared-types').StructureAnalysisInput = {
      topic: courseForInput.title || 'Course Topic',
      language,
      style: courseForInput.style || 'practical',
      target_audience: 'mixed',
      difficulty: courseForInput.difficulty || 'intermediate',
      lesson_duration_minutes: lessonDuration,
      document_summaries: documentSummaries,
    };

    jobLogger.info({
      topic: analysisInput.topic,
      language: analysisInput.language,
      documentCount: documentSummaries.length,
    }, 'Analysis input built from database');

    jobLogger.info(
      {
        topic: analysisInput.topic,
        language: analysisInput.language,
        documentCount: analysisInput.document_summaries?.length || 0,
        attemptsMade: job.attemptsMade,
      },
      'Starting Stage 4 analysis job'
    );

    const supabaseAdmin = getSupabaseAdmin();

    try {
      // =================================================================
      // STEP 0-PRE: Check Current Status (Retry-Aware)
      // =================================================================
      const { data: currentCourse } = await supabaseAdmin
        .from('courses')
        .select('generation_status')
        .eq('id', course_id)
        .single();

      if (!currentCourse) {
        throw new Error('Course not found during status check');
      }

      const currentStatus = currentCourse.generation_status;
      const validStage4ProgressStates = ['stage_4_init', 'stage_4_analyzing'];

      // Only perform status initialization if NOT already in Stage 4 progression
      if (!validStage4ProgressStates.includes(currentStatus as string)) {
        jobLogger.info(
          { currentStatus, attemptsMade: job.attemptsMade },
          'Status not in Stage 4 progression - performing initialization'
        );

        // =================================================================
        // STEP 0: Update Status to Stage 4 Init
        // =================================================================
        jobLogger.info('Setting course status to stage_4_init');

        const { error: statusInitError} = await supabaseAdmin
          .from('courses')
          .update({
            generation_status: 'stage_4_init' as const,
            updated_at: new Date().toISOString(),
          })
          .eq('id', course_id)
          .eq('organization_id', organization_id);

        if (statusInitError) {
          throw new Error(`Failed to update status to stage_4_init: ${statusInitError.message}`);
        }

        // =================================================================
        // STEP 0.5: Update Status to Stage 4 Analyzing
        // =================================================================
        jobLogger.info('Setting course status to stage_4_analyzing');

        const { error: statusAnalyzeError } = await supabaseAdmin
          .from('courses')
          .update({
            generation_status: 'stage_4_analyzing' as const,
            updated_at: new Date().toISOString(),
          })
          .eq('id', course_id)
          .eq('organization_id', organization_id);

        if (statusAnalyzeError) {
          throw new Error(`Failed to update status to stage_4_analyzing: ${statusAnalyzeError.message}`);
        }
      } else {
        jobLogger.info(
          { currentStatus, attemptsMade: job.attemptsMade },
          'Already in Stage 4 progression state - skipping initialization (retry logic)'
        );

        // Ensure we're in analyzing state (idempotent - only transitions if needed)
        if (currentStatus === 'stage_4_init') {
          jobLogger.info('Transitioning from stage_4_init to stage_4_analyzing');

          const { error: statusAnalyzeError } = await supabaseAdmin
            .from('courses')
            .update({
              generation_status: 'stage_4_analyzing' as const,
              updated_at: new Date().toISOString(),
            })
            .eq('id', course_id)
            .eq('organization_id', organization_id);

          if (statusAnalyzeError) {
            throw new Error(`Failed to update status to stage_4_analyzing: ${statusAnalyzeError.message}`);
          }
        }
        // If already stage_4_analyzing, no status change needed
      }

      // =================================================================
      // STEP 1: Execute Multi-Phase Analysis Orchestration
      // =================================================================
      // Build legacy-compatible object for orchestrator (uses snake_case StructureAnalysisJob)
      // TODO: Refactor orchestrator to use camelCase StructureAnalysisJobData in future
      const orchestratorJob = {
        course_id,
        organization_id,
        user_id,
        input: analysisInput,
        priority: 10,
        attempt_count: job.attemptsMade,
        created_at: jobData.createdAt,
      };
      const analysisResult: AnalysisResult = await runAnalysisOrchestration(orchestratorJob);

      // =================================================================
      // STEP 2: Store Result in Database
      // =================================================================
      jobLogger.info(
        {
          total_lessons: analysisResult.recommended_structure.total_lessons,
          total_sections: analysisResult.recommended_structure.total_sections,
          category: analysisResult.course_category.primary,
          research_flags_count: analysisResult.research_flags.length,
        },
        'Analysis completed - storing result in database'
      );

      const { error: updateError } = await supabaseAdmin
        .from('courses')
        .update({
          analysis_result: analysisResult as any, // Cast to any for Supabase JSONB compatibility
          generation_status: 'stage_4_awaiting_approval' as const, // Stage Gates: Wait for approval before Stage 5
          // Denormalize counts for fast access in UI and queries
          total_lessons_count: analysisResult.recommended_structure.total_lessons,
          total_sections_count: analysisResult.recommended_structure.total_sections,
          updated_at: new Date().toISOString(),
        })
        .eq('id', course_id)
        .eq('organization_id', organization_id);

      if (updateError) {
        jobLogger.error(
          {
            error: updateError,
            courseId: course_id,
          },
          'Failed to store analysis result in database'
        );
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      jobLogger.info(
        {
          courseId: course_id,
        },
        'Analysis result stored successfully in courses.analysis_result'
      );

      // =================================================================
      // STEP 3: Calculate Final Metrics
      // =================================================================
      const totalDurationMs = Date.now() - startTime;

      jobLogger.info(
        {
          duration_ms: totalDurationMs,
          total_lessons: analysisResult.recommended_structure.total_lessons,
          total_sections: analysisResult.recommended_structure.total_sections,
          estimated_hours: analysisResult.recommended_structure.estimated_content_hours,
          category: analysisResult.course_category.primary,
          teaching_style: analysisResult.pedagogical_strategy.teaching_style,
          research_flags: analysisResult.research_flags.length,
          expansion_areas: analysisResult.expansion_areas?.length || 0,
          total_cost_usd: analysisResult.metadata.total_cost_usd,
          total_tokens: analysisResult.metadata.total_tokens.total,
          models_used: analysisResult.metadata.model_usage,
        },
        'Stage 4 analysis job completed successfully'
      );

      // =================================================================
      // STEP 4: Return Success Result
      // =================================================================
      return {
        success: true,
        message: 'Analysis completed successfully',
        course_id,
        analysis_result: analysisResult,
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
        'Stage 4 analysis job failed'
      );

      // Classify error for monitoring and retry decisions
      const errorCode = classifyAnalysisError(error instanceof Error ? error : String(error));

      jobLogger.info(
        {
          errorCode,
          shouldRetry: errorCode === 'LLM_ERROR' || errorCode === 'UNKNOWN',
        },
        'Error classified'
      );

      // Determine phase from error message (if available)
      let phase: string | undefined;
      if (error instanceof Error) {
        if (error.message.includes('Phase 0') || error.message.includes('BARRIER_FAILED')) {
          phase = 'preflight_validation';
        } else if (error.message.includes('Phase 1')) {
          phase = 'stage_4_classification';
        } else if (error.message.includes('Phase 2') || error.message.includes('minimum 10 lessons')) {
          phase = 'stage_4_scope';
        } else if (error.message.includes('Phase 3')) {
          phase = 'stage_4_expert';
        } else if (error.message.includes('Phase 4')) {
          phase = 'stage_4_synthesis';
        } else if (error.message.includes('Phase 5')) {
          phase = 'final_assembly';
        }
      }

      // Log permanent errors (non-retriable)
      if (errorCode === 'BARRIER_FAILED' || errorCode === 'MINIMUM_LESSONS_NOT_MET') {
        jobLogger.error(
          {
            errorCode,
            phase,
          },
          'Permanent error in analysis - will not retry'
        );
      } else {
        jobLogger.warn(
          {
            errorCode,
            phase,
          },
          'Transient error in analysis - BullMQ will retry'
        );
      }

      // Update course status with failure details (failed_at_stage and error_code)
      try {
        const { error: statusUpdateError } = await supabaseAdmin
          .from('courses')
          .update({
            generation_status: 'failed',
            failed_at_stage: 4, // Stage 4
            error_code: errorCode as any, // Map to stage_error_code enum
            updated_at: new Date().toISOString(),
          })
          .eq('id', course_id)
          .eq('organization_id', organization_id);

        if (statusUpdateError) {
          jobLogger.error({ error: statusUpdateError }, 'Failed to update course status with failure details');
        }
      } catch (statusError) {
        jobLogger.error({ error: statusError }, 'Exception updating course status');
      }

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
 * import { stage4AnalysisHandler } from './handlers/stage4-analysis';
 *
 * worker.on('active', (job) => {
 *   if (job.name === 'STRUCTURE_ANALYSIS') {
 *     await stage4AnalysisHandler.process(job);
 *   }
 * });
 * ```
 */
export const stage4AnalysisHandler = new Stage4AnalysisHandler();

export default stage4AnalysisHandler;
