/**
 * Stage 7 Job Processor
 * @module stages/stage7-enrichments/services/job-processor
 *
 * Main job processing function for enrichment generation.
 * Handles single-stage and two-stage enrichment flows.
 */

import { Job } from 'bullmq';
import { logger } from '@/shared/logger';
import type { EnrichmentStatus } from '@megacampus/shared-types';
import type {
  Stage7JobInput,
  Stage7JobResult,
  Stage7ProgressUpdate,
  EnrichmentHandlerInput,
} from '../types';
import {
  getEnrichment,
  updateEnrichmentStatus,
  saveEnrichmentContent,
  saveDraftContent,
  linkEnrichmentAsset,
  incrementGenerationAttempt,
} from './database-service';
import { uploadEnrichmentAsset } from './storage-service';
import { routeEnrichment, isTwoStageEnrichment } from './enrichment-router';
import {
  shouldRetry,
  getRetryDelay,
  getModelForAttempt,
  formatErrorForLogging,
} from '../retry-strategy';

/**
 * Update job progress for streaming
 */
async function updateJobProgress(
  job: Job<Stage7JobInput, Stage7JobResult>,
  update: Stage7ProgressUpdate
): Promise<void> {
  try {
    await job.updateProgress(update);

    logger.debug(
      {
        jobId: job.id,
        phase: update.phase,
        progress: update.progress,
      },
      'Stage 7 progress update sent'
    );
  } catch (error) {
    logger.warn(
      {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to update Stage 7 job progress'
    );
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if job has been cancelled
 */
async function checkCancellation(
  job: Job<Stage7JobInput, Stage7JobResult>
): Promise<boolean> {
  try {
    const state = await job.getState();
    return state === 'failed' || state === 'completed';
  } catch {
    return false;
  }
}

/**
 * Process a single Stage 7 enrichment job
 *
 * @param job - BullMQ job to process
 * @returns Job result
 */
export async function processStage7Job(
  job: Job<Stage7JobInput, Stage7JobResult>
): Promise<Stage7JobResult> {
  const {
    enrichmentId,
    enrichmentType,
    lessonId,
    courseId,
    settings = {},
    retryAttempt = 0,
    isDraftPhase = false,
  } = job.data;

  const startTime = Date.now();
  const jobLogger = logger.child({
    jobId: job.id,
    enrichmentId,
    enrichmentType,
    lessonId,
    courseId,
    attempt: job.attemptsMade + 1,
  });

  jobLogger.info('Processing Stage 7 enrichment job');

  // Initialize progress
  await updateJobProgress(job, {
    phase: 'init',
    progress: 0,
    message: 'Initializing enrichment generation',
  });

  try {
    // Fetch enrichment with context
    await updateJobProgress(job, {
      phase: 'fetching_context',
      progress: 10,
      message: 'Fetching enrichment context',
    });

    const enrichmentContext = await getEnrichment(enrichmentId);

    if (!enrichmentContext) {
      throw new Error(`Enrichment not found: ${enrichmentId}`);
    }

    // Check for cancellation
    if (await checkCancellation(job)) {
      jobLogger.info('Job cancelled, aborting');
      return createFailedResult(enrichmentId, 'Job cancelled', startTime);
    }

    // Increment generation attempt
    const attemptNumber = await incrementGenerationAttempt(enrichmentId);
    jobLogger.debug({ attemptNumber }, 'Generation attempt incremented');

    // Determine generation phase
    const isTwoStage = isTwoStageEnrichment(enrichmentType);
    const handler = routeEnrichment(enrichmentType);

    // Update status to generating
    const generatingStatus: EnrichmentStatus = isDraftPhase
      ? 'draft_generating'
      : 'generating';
    await updateEnrichmentStatus(enrichmentId, generatingStatus);

    await updateJobProgress(job, {
      phase: 'generating',
      progress: 30,
      message: `Generating ${enrichmentType} content`,
    });

    // Get model for LLM-based enrichments
    const model = getModelForAttempt(enrichmentType, attemptNumber);

    // Prepare handler input
    const handlerInput: EnrichmentHandlerInput = {
      enrichmentContext,
      settings: {
        ...settings,
        model,
      },
    };

    // Execute generation based on flow type
    if (isTwoStage && isDraftPhase && handler.generateDraft) {
      // Two-stage: Generate draft
      jobLogger.info('Generating draft for two-stage enrichment');

      const draftResult = await handler.generateDraft(handlerInput);

      // Save draft and update status
      await saveDraftContent(enrichmentId, draftResult.draftContent, {
        generated_at: new Date().toISOString(),
        generation_duration_ms: draftResult.metadata.durationMs,
        total_tokens: draftResult.metadata.tokensUsed,
        model_used: draftResult.metadata.modelUsed,
        estimated_cost_usd: 0,
      });

      await updateJobProgress(job, {
        phase: 'draft_ready',
        progress: 100,
        message: 'Draft ready for review',
      });

      jobLogger.info(
        {
          durationMs: draftResult.metadata.durationMs,
        },
        'Draft generation completed'
      );

      return {
        enrichmentId,
        success: true,
        status: 'draft_ready',
        metrics: {
          durationMs: Date.now() - startTime,
          tokensUsed: draftResult.metadata.tokensUsed,
          modelUsed: draftResult.metadata.modelUsed,
        },
      };
    }

    // Single-stage or final generation
    jobLogger.info('Generating final enrichment content');

    const result = await handler.generate(handlerInput);

    await updateJobProgress(job, {
      phase: 'validating',
      progress: 70,
      message: 'Validating generated content',
    });

    // Handle asset upload for audio/video
    if (result.assetBuffer && result.assetMimeType && result.assetExtension) {
      await updateJobProgress(job, {
        phase: 'uploading',
        progress: 85,
        message: 'Uploading asset to storage',
      });

      const assetPath = await uploadEnrichmentAsset(
        courseId,
        lessonId,
        enrichmentId,
        result.assetBuffer,
        result.assetMimeType,
        result.assetExtension
      );

      await linkEnrichmentAsset(enrichmentId, assetPath);

      jobLogger.info({ assetPath }, 'Asset uploaded and linked');
    }

    // Save content and mark as completed
    await saveEnrichmentContent(enrichmentId, result.content, result.metadata);

    await updateJobProgress(job, {
      phase: 'complete',
      progress: 100,
      message: 'Enrichment generation completed',
    });

    const durationMs = Date.now() - startTime;

    jobLogger.info(
      {
        success: true,
        durationMs,
        tokensUsed: result.metadata.total_tokens,
        modelUsed: result.metadata.model_used,
        qualityScore: result.metadata.quality_score,
      },
      'Stage 7 job completed successfully'
    );

    return {
      enrichmentId,
      success: true,
      status: 'completed',
      content: result.content,
      metrics: {
        durationMs,
        tokensUsed: result.metadata.total_tokens,
        costUsd: result.metadata.estimated_cost_usd,
        modelUsed: result.metadata.model_used,
        qualityScore: result.metadata.quality_score,
      },
    };
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const durationMs = Date.now() - startTime;

    jobLogger.error(
      {
        error: formatErrorForLogging(errorObj),
        durationMs,
      },
      'Stage 7 job failed'
    );

    // Check if we should retry
    const retryContext = {
      enrichmentType,
      attempt: retryAttempt + 1,
      error: errorObj,
    };

    if (shouldRetry(retryContext)) {
      const delay = getRetryDelay(retryContext);
      jobLogger.info(
        { delay, nextAttempt: retryContext.attempt + 1 },
        'Will retry after delay'
      );

      // Sleep before retry (BullMQ will handle the actual retry)
      await sleep(delay);

      // Re-throw to trigger BullMQ retry
      throw error;
    }

    // Mark as failed in database
    await updateEnrichmentStatus(
      enrichmentId,
      'failed',
      errorObj.message,
      {
        stack: errorObj.stack,
        attempt: retryAttempt + 1,
        jobId: job.id,
      }
    );

    await updateJobProgress(job, {
      phase: 'error',
      progress: 0,
      message: `Generation failed: ${errorObj.message}`,
    });

    return createFailedResult(enrichmentId, errorObj.message, startTime);
  }
}

/**
 * Create a failed result object
 */
function createFailedResult(
  enrichmentId: string,
  errorMessage: string,
  startTime: number
): Stage7JobResult {
  return {
    enrichmentId,
    success: false,
    status: 'failed',
    error: errorMessage,
    metrics: {
      durationMs: Date.now() - startTime,
    },
  };
}
