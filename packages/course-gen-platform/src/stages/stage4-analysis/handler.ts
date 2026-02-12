/**
 * Stage 4 Analysis Handler
 * @module orchestrator/handlers/stage4-analysis
 *
 * Handles STRUCTURE_ANALYSIS jobs using multi-phase analysis orchestration.
 * Executes all 6 analysis phases and stores the result in courses.analysis_result JSONB column.
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
import type {
  StructureAnalysisJobData,
  Json,
  StructureAnalysisJob,
} from '@megacampus/shared-types';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import type pino from 'pino';
import logger from '../../shared/logger';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { runAnalysisOrchestration } from './orchestrator';
import { acquireGenerationLock } from '@/shared/locks';
import { generateVisualStyle } from './utils/visual-style-generator';
import { handleStageCompletion } from '../../shared/auto-approval';
import { notifyStageComplete, notifyCourseError } from '../../shared/notifications';
import { checkPauseAndDelay } from '../../shared/pause-check';
import { isPipelineInterrupt } from '@/shared/errors';

import {
  type StructureAnalysisJobResult,
  type AnalysisErrorDetails,
  classifyAnalysisError,
  determinePhaseFromError,
  validateAndInitializeStage4,
  buildAnalysisInput,
  handleStatusTransitions,
  markCourseAsFailed,
  trackStage4Tokens,
} from './handler-helpers';

// Re-export types for consumers
export type { AnalysisErrorDetails, StructureAnalysisJobResult };

/**
 * Stage 4 Analysis Handler
 *
 * Processes STRUCTURE_ANALYSIS jobs by executing the multi-phase analysis
 * orchestrator and storing results in the database.
 */
class Stage4AnalysisHandler {
  /**
   * Process the STRUCTURE_ANALYSIS job
   *
   * Main entry point called by BullMQ worker.
   */
  async process(
    job: Job<StructureAnalysisJobData>,
    token?: string
  ): Promise<StructureAnalysisJobResult> {
    return await this.execute(job.data, job, token);
  }

  /**
   * Execute the analysis job
   *
   * Core logic: orchestration -> visual style -> DB commit -> result
   */
  async execute(
    jobData: StructureAnalysisJobData,
    job: Job<StructureAnalysisJobData>,
    token?: string
  ): Promise<StructureAnalysisJobResult> {
    const startTime = Date.now();
    const {
      courseId: course_id,
      organizationId: organization_id,
      userId: user_id,
      courseSize: jobCourseSize,
    } = jobData;

    // Warn if token is missing
    if (!token) {
      logger.warn(
        { jobId: job.id, courseId: course_id, organizationId: organization_id },
        'Job token missing - pause/delay functionality disabled for this job'
      );
    }

    // Check if generation is paused
    await checkPauseAndDelay(job, course_id, token);

    // Acquire generation lock (FR-037)
    const lockGuard = await acquireGenerationLock(
      course_id,
      `stage-4-${job.id || Date.now()}`,
      logger
    );

    try {
      // Layer 3: Worker validation and fallback initialization
      await validateAndInitializeStage4(course_id, user_id, organization_id, job.id);

      const jobLogger = logger.child({
        jobId: job.id,
        jobType: 'STRUCTURE_ANALYSIS',
        courseId: course_id,
        organizationId: organization_id,
        userId: user_id,
        attemptsMade: job.attemptsMade,
      });

      // Build analysis input from database
      const { analysisInput, documentSummaries } = await buildAnalysisInput(
        course_id,
        organization_id,
        jobCourseSize ?? undefined,
        jobLogger
      );

      // Log input details
      jobLogger.info(
        {
          target_audience: analysisInput.target_audience,
          fallback_used: !analysisInput.target_audience,
        },
        'Target audience configuration for Stage 4'
      );
      jobLogger.info(
        {
          has_description: !!analysisInput.course_description,
          has_outcomes: !!analysisInput.learning_outcomes,
        },
        'Additional context availability for Stage 4'
      );
      jobLogger.info(
        {
          topic: analysisInput.topic,
          language: analysisInput.language,
          documentCount: documentSummaries.length,
          attemptsMade: job.attemptsMade,
        },
        'Starting Stage 4 analysis job'
      );

      const supabaseAdmin = getSupabaseAdmin();

      try {
        // STEP 0: Handle status transitions
        await handleStatusTransitions(course_id, organization_id, job, jobLogger);

        // STEP 1: Execute multi-phase analysis
        const analysisResult = await this.executeAnalysis(
          course_id,
          organization_id,
          user_id,
          analysisInput,
          job,
          jobData
        );

        // STEP 2: Generate visual style (non-blocking)
        const visualStyle = await this.generateVisualStyleSafe(
          analysisInput,
          analysisResult,
          jobLogger
        );

        // STEP 3: Store result in database
        await this.storeResult(
          supabaseAdmin,
          course_id,
          organization_id,
          analysisResult,
          visualStyle,
          jobLogger
        );

        // Release heartbeat
        clearInterval(lockGuard.heartbeatInterval);

        // Track tokens
        await trackStage4Tokens(course_id, analysisResult.metadata?.total_tokens?.total, jobLogger);

        // STEP 4: Handle stage completion
        await this.handleStageCompletion(course_id, jobLogger);

        // STEP 5: Return success result
        const totalDurationMs = Date.now() - startTime;
        this.logSuccessMetrics(analysisResult, totalDurationMs, jobLogger);

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
        return await this.handleExecutionError(
          error,
          course_id,
          organization_id,
          startTime,
          job,
          supabaseAdmin,
          jobLogger
        );
      }
    } finally {
      await lockGuard.release();
    }
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /** Execute the analysis orchestration */
  private async executeAnalysis(
    courseId: string,
    organizationId: string | undefined,
    userId: string | undefined,
    analysisInput: import('@megacampus/shared-types').StructureAnalysisInput,
    job: Job<StructureAnalysisJobData>,
    jobData: StructureAnalysisJobData
  ): Promise<AnalysisResult> {
    // Build legacy-compatible object for orchestrator (uses snake_case StructureAnalysisJob)
    const orchestratorJob: StructureAnalysisJob = {
      course_id: courseId,
      organization_id: organizationId || 'unknown',
      user_id: userId || 'system',
      input: analysisInput,
      priority: 10,
      attempt_count: job.attemptsMade,
      created_at: jobData.createdAt,
    };
    return await runAnalysisOrchestration(orchestratorJob);
  }

  /** Generate visual style (non-blocking) */
  private async generateVisualStyleSafe(
    analysisInput: import('@megacampus/shared-types').StructureAnalysisInput,
    analysisResult: AnalysisResult,
    jobLogger: pino.Logger
  ): Promise<Awaited<ReturnType<typeof generateVisualStyle>> | null> {
    try {
      jobLogger.info({}, 'Generating visual style for course imagery');
      const visualStyle = await generateVisualStyle({
        courseTitle: analysisInput.topic,
        courseTopic: analysisResult.topic_analysis.determined_topic || analysisInput.topic,
        language: analysisInput.language,
        category: analysisResult.course_category.primary,
      });
      jobLogger.info(
        {
          colorScheme: visualStyle.colorScheme.slice(0, 50),
          aesthetic: visualStyle.aesthetic.slice(0, 50),
        },
        'Visual style generated successfully'
      );
      return visualStyle;
    } catch (visualStyleError) {
      jobLogger.warn(
        {
          error:
            visualStyleError instanceof Error ? visualStyleError.message : String(visualStyleError),
        },
        'Visual style generation failed - cards will use default styling'
      );
      return null;
    }
  }

  /** Store analysis result in database */
  private async storeResult(
    supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
    courseId: string,
    organizationId: string | undefined,
    analysisResult: AnalysisResult,
    visualStyle: unknown,
    jobLogger: pino.Logger
  ): Promise<void> {
    jobLogger.info(
      {
        total_lessons: analysisResult.recommended_structure.total_lessons,
        total_sections: analysisResult.recommended_structure.total_sections,
        category: analysisResult.course_category.primary,
        research_flags_count: analysisResult.research_flags.length,
        hasVisualStyle: !!visualStyle,
      },
      'Analysis completed - storing result in database'
    );

    const updateQuery = supabaseAdmin
      .from('courses')
      .update({
        analysis_result: analysisResult as unknown as Json,
        visual_style: visualStyle as Json,
        total_lessons_count: analysisResult.recommended_structure.total_lessons,
        total_sections_count: analysisResult.recommended_structure.total_sections,
        target_audience: analysisResult.topic_analysis?.target_audience || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);

    // Apply organization filter if available
    const { error: updateError } = organizationId
      ? await updateQuery.eq('organization_id', organizationId)
      : await updateQuery;

    if (updateError) {
      jobLogger.error({ error: updateError, courseId }, 'Failed to store analysis result');
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    jobLogger.info({ courseId }, 'Analysis result stored successfully');
  }

  /** Handle stage completion (auto-approve or await approval) */
  private async handleStageCompletion(courseId: string, jobLogger: pino.Logger): Promise<void> {
    try {
      const { autoApproved } = await handleStageCompletion(courseId, 4);
      jobLogger.info(
        { courseId },
        autoApproved ? 'Stage 4 auto-approved, proceeding to Stage 5' : 'Stage 4 awaiting approval'
      );
      await notifyStageComplete(courseId, 4);
    } catch (stageError) {
      jobLogger.error(
        { courseId, error: stageError instanceof Error ? stageError.message : String(stageError) },
        'Failed to handle stage completion for Stage 4'
      );
      try {
        await notifyCourseError(courseId, 4, 'Auto-approval failed');
      } catch {
        jobLogger.warn({ courseId }, 'Failed to send error notification');
      }
      throw stageError;
    }
  }

  /** Log success metrics */
  private logSuccessMetrics(
    analysisResult: AnalysisResult,
    totalDurationMs: number,
    jobLogger: pino.Logger
  ): void {
    jobLogger.info(
      {
        duration_ms: totalDurationMs,
        total_lessons: analysisResult.recommended_structure.total_lessons,
        total_sections: analysisResult.recommended_structure.total_sections,
        estimated_hours: analysisResult.recommended_structure.estimated_content_hours,
        category: analysisResult.course_category.primary,
        research_flags: analysisResult.research_flags.length,
        total_cost_usd: analysisResult.metadata.total_cost_usd,
        total_tokens: analysisResult.metadata.total_tokens.total,
        models_used: analysisResult.metadata.model_usage,
      },
      'Stage 4 analysis job completed successfully'
    );
  }

  /** Handle execution errors: classify, update DB, decide retry */
  private async handleExecutionError(
    error: unknown,
    courseId: string,
    organizationId: string | undefined,
    startTime: number,
    job: Job<StructureAnalysisJobData>,
    _supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
    jobLogger: pino.Logger
  ): Promise<StructureAnalysisJobResult> {
    const totalDurationMs = Date.now() - startTime;

    // Check for pipeline interrupt
    if (isPipelineInterrupt(error)) {
      jobLogger.info(
        { errorCode: (error as { code: string }).code, courseId },
        'Pipeline paused (not an error)'
      );
    } else {
      jobLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          duration_ms: totalDurationMs,
          attemptsMade: job.attemptsMade,
        },
        'Stage 4 analysis job failed'
      );
    }

    // Classify error
    const errorCode = classifyAnalysisError(error instanceof Error ? error : String(error));
    const phase = error instanceof Error ? determinePhaseFromError(error) : undefined;
    jobLogger.info(
      { errorCode, shouldRetry: errorCode === 'LLM_ERROR' || errorCode === 'UNKNOWN' },
      'Error classified'
    );

    // Special handling for clarifying questions (not a real error)
    if (errorCode === 'AWAITING_CLARIFYING_ANSWERS') {
      return {
        success: true,
        message: 'Paused for clarifying questions - awaiting user input',
        course_id: courseId,
        metadata: {
          total_duration_ms: totalDurationMs,
          retry_count: job.attemptsMade,
          completed_at: new Date().toISOString(),
        },
      };
    }

    // Log error type
    if (errorCode === 'BARRIER_FAILED' || errorCode === 'MINIMUM_LESSONS_NOT_MET') {
      jobLogger.error({ errorCode, phase }, 'Permanent error in analysis - will not retry');
    } else {
      jobLogger.warn({ errorCode, phase }, 'Transient error in analysis - BullMQ will retry');
    }

    // Mark as failed if permanent error or last attempt
    const isPermanentError =
      errorCode === 'BARRIER_FAILED' || errorCode === 'MINIMUM_LESSONS_NOT_MET';
    const maxAttempts = job.opts.attempts || 3;
    const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

    if (isPermanentError || isLastAttempt) {
      jobLogger.info(
        {
          courseId,
          errorCode,
          isPermanentError,
          isLastAttempt,
          attemptsMade: job.attemptsMade,
          maxAttempts,
        },
        'Marking course as failed'
      );
      await markCourseAsFailed(courseId, organizationId, errorCode, jobLogger);
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

    throw error;
  }
}

/**
 * Export singleton instance
 */
export const stage4AnalysisHandler = new Stage4AnalysisHandler();

export default stage4AnalysisHandler;
