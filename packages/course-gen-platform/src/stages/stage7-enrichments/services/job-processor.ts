/**
 * Stage 7 Job Processor
 * @module stages/stage7-enrichments/services/job-processor
 *
 * Main job processing function for enrichment generation.
 * Handles single-stage and two-stage enrichment flows.
 */

import { Job, Queue } from 'bullmq';
import { logger } from '@/shared/logger';
import type { EnrichmentMetadata } from '@megacampus/shared-types';
import { getRedisClient } from '@/shared/cache/redis';
import type { EnrichmentStatus } from '@megacampus/shared-types';
import type {
  Stage7JobInput,
  Stage7JobResult,
  Stage7ProgressUpdate,
  EnrichmentHandlerInput,
  Stage7EnrichmentType,
  Stage7NlmAsyncState,
  GenerateResult,
} from '../types';
import {
  getEnrichment,
  updateEnrichmentStatus,
  saveEnrichmentContent,
  saveDraftContent,
  incrementGenerationAttempt,
  upsertAssetAndLinkEnrichment,
  saveNotebookLMAsyncMetadataState,
} from './database-service';
import { uploadEnrichmentAsset } from './unified-storage-service';
import { routeEnrichment, isTwoStageEnrichment } from './enrichment-router';
import { STAGE7_CONFIG, ENRICHMENT_PHASE_NAMES } from '../config';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import {
  shouldRetry,
  getRetryDelay,
  getModelForAttempt,
  formatErrorForLogging,
} from '../retry-strategy';
import { notifyEnrichmentReady } from '@/shared/telegram/send';

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

const MEDIA_DEFAULTS_BY_TYPE: Partial<
  Record<Stage7EnrichmentType, { mimeType: string; extension: string }>
> = {
  audio: { mimeType: 'audio/mpeg', extension: 'mp3' },
  nlm_audio: { mimeType: 'audio/mpeg', extension: 'mp3' },
  video: { mimeType: 'video/mp4', extension: 'mp4' },
  nlm_video: { mimeType: 'video/mp4', extension: 'mp4' },
  nlm_infographic: { mimeType: 'image/png', extension: 'png' },
};

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  png: 'image/png',
};

const NLM_TYPES: ReadonlySet<Stage7EnrichmentType> = new Set([
  'nlm_audio',
  'nlm_video',
  'nlm_study_guide',
  'nlm_flashcards',
  'nlm_mind_map',
  'nlm_infographic',
]);
const DEFAULT_NLM_POLL_DELAY_MS = 15_000;
const DEFAULT_NLM_MAX_POLL_DELAY_MS = 60_000;
const DEFAULT_NLM_MAX_WAIT_MS = 76 * 60 * 60 * 1000; // 76h: covers 72h queue wait + 3h generation + 1h buffer

let stage7PollQueue: Queue<Stage7JobInput, Stage7JobResult> | null = null;

function isNotebookLMType(enrichmentType: Stage7EnrichmentType): boolean {
  return NLM_TYPES.has(enrichmentType);
}

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getNlmPollDelayMs(pollAttempt: number): number {
  const initial = getEnvNumber('NOTEBOOKLM_STAGE7_POLL_DELAY_MS', DEFAULT_NLM_POLL_DELAY_MS);
  const maxDelay = getEnvNumber(
    'NOTEBOOKLM_STAGE7_POLL_MAX_DELAY_MS',
    DEFAULT_NLM_MAX_POLL_DELAY_MS
  );
  const clampedAttempt = Math.max(0, Math.min(pollAttempt, 20));
  const scaled = Math.round(initial * Math.pow(1.2, clampedAttempt));
  return Math.max(initial, Math.min(maxDelay, scaled));
}

function getNlmMaxWaitMs(): number {
  return getEnvNumber('NOTEBOOKLM_STAGE7_ASYNC_MAX_WAIT_MS', DEFAULT_NLM_MAX_WAIT_MS);
}

function getStage7PollQueue(): Queue<Stage7JobInput, Stage7JobResult> {
  if (!stage7PollQueue) {
    stage7PollQueue = new Queue<Stage7JobInput, Stage7JobResult>(STAGE7_CONFIG.QUEUE_NAME, {
      connection: getRedisClient(),
    });
  }

  return stage7PollQueue;
}

async function enqueueNlmPollJob(
  baseInput: Stage7JobInput,
  state: Stage7NlmAsyncState,
  delayMs: number
): Promise<string> {
  const queue = getStage7PollQueue();
  const jobId = `enrich-ondemand-${baseInput.enrichmentId}-${state.taskId}-poll-${state.pollAttempt}`;

  const existing = await queue.getJob(jobId);
  if (existing) {
    return existing.id ?? jobId;
  }

  const job = await queue.add(
    `${baseInput.enrichmentType}-${baseInput.enrichmentId}`,
    {
      ...baseInput,
      isDraftPhase: false,
      nlmAsyncState: state,
    },
    {
      jobId,
      delay: Math.max(0, delayMs),
      attempts: STAGE7_CONFIG.MAX_RETRIES,
      backoff: {
        type: 'exponential',
        delay: STAGE7_CONFIG.RETRY_DELAY_MS,
      },
      removeOnComplete: {
        count: 1000,
        age: 24 * 60 * 60,
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 60 * 60,
      },
    }
  );

  return job.id ?? jobId;
}

function createCancelledResult(enrichmentId: string, startTime: number): Stage7JobResult {
  return {
    enrichmentId,
    success: true,
    status: 'cancelled',
    metrics: {
      durationMs: Date.now() - startTime,
    },
  };
}

function resolveAssetFormat(
  enrichmentType: Stage7EnrichmentType,
  providedMimeType?: string,
  providedExtension?: string
): { mimeType: string; extension: string } {
  const normalizedExtension = providedExtension?.toLowerCase().replace(/^\./, '');
  const mimeFromExtension = normalizedExtension
    ? MIME_BY_EXTENSION[normalizedExtension]
    : undefined;

  if (normalizedExtension && (providedMimeType || mimeFromExtension)) {
    return {
      mimeType: providedMimeType ?? mimeFromExtension ?? 'application/octet-stream',
      extension: normalizedExtension,
    };
  }

  const defaults = MEDIA_DEFAULTS_BY_TYPE[enrichmentType];
  if (!defaults) {
    throw new Error(
      `Asset format missing for enrichment type ${enrichmentType}. Provide assetMimeType and assetExtension.`
    );
  }

  return {
    mimeType: providedMimeType ?? defaults.mimeType,
    extension: normalizedExtension ?? defaults.extension,
  };
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if job has been cancelled
 */
async function checkCancellation(job: Job<Stage7JobInput, Stage7JobResult>): Promise<boolean> {
  try {
    const state = await job.getState();
    return state === 'failed' || state === 'completed';
  } catch {
    return false;
  }
}

async function finalizeSuccessfulResult(
  job: Job<Stage7JobInput, Stage7JobResult>,
  params: {
    enrichmentId: string;
    enrichmentType: Stage7EnrichmentType;
    courseId: string;
    lessonId: string;
    result: GenerateResult;
    startTime: number;
    logMessage: string;
    jobLogger: typeof logger;
  }
): Promise<Stage7JobResult> {
  const {
    enrichmentId,
    enrichmentType,
    courseId,
    lessonId,
    result,
    startTime,
    logMessage,
    jobLogger,
  } = params;

  await updateJobProgress(job, {
    phase: 'validating',
    progress: 70,
    message: 'Validating generated content',
  });

  let assetId: string | undefined;

  if (result.assetBuffer) {
    const assetFormat = resolveAssetFormat(
      enrichmentType,
      result.assetMimeType,
      result.assetExtension
    );

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
      assetFormat.mimeType,
      assetFormat.extension
    );

    assetId = await upsertAssetAndLinkEnrichment({
      enrichmentId,
      courseId,
      lessonId,
      enrichmentType,
      storagePath: assetPath,
      mimeType: assetFormat.mimeType,
      extension: assetFormat.extension,
      fileSizeBytes: result.assetBuffer.length,
    });

    jobLogger.info({ assetPath, assetId }, 'Asset uploaded and linked');
  }

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
    logMessage
  );

  // Send Telegram notification (fire-and-forget)
  notifyEnrichmentReady({ courseId, lessonId, enrichmentType }).catch(err => {
    jobLogger.warn({ err: String(err) }, 'Failed to send enrichment notification');
  });

  return {
    enrichmentId,
    success: true,
    status: 'completed',
    assetId,
    content: result.content,
    metrics: {
      durationMs,
      tokensUsed: result.metadata.total_tokens,
      costUsd: result.metadata.estimated_cost_usd,
      modelUsed: result.metadata.model_used,
      qualityScore: result.metadata.quality_score,
    },
  };
}

/**
 * Process a single Stage 7 enrichment job
 *
 * @param job - BullMQ job to process
 * @returns Job result
 */
/**
 * `fallback_model_id` for an LLM-based enrichment, or null when it does not apply.
 *
 * Read only when a retry is actually about to use it: the first attempt needs no
 * fallback, and accounting for a route failure must not add a database round
 * trip to the happy path. A config that cannot be read is not an error here —
 * the caller then uses the last-resort constant.
 */
async function resolveConfiguredFallbackModel(
  enrichmentType: Stage7EnrichmentType,
  courseId: string,
  attempt: number
): Promise<string | null> {
  if (attempt <= 1) return null;
  const phaseName = ENRICHMENT_PHASE_NAMES[enrichmentType as keyof typeof ENRICHMENT_PHASE_NAMES];
  if (!phaseName) return null;

  try {
    const config = await createModelConfigService().getModelForPhase(phaseName, courseId);
    return config.fallbackModelId;
  } catch (error) {
    logger.warn(
      {
        phaseName,
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Could not read the configured fallback model; using the built-in one'
    );
    return null;
  }
}

/**
 * A NotebookLM task that has not finished: record where it got to and book the next poll.
 *
 * This existed twice, verbatim apart from three things — whether the draft rides along in the
 * async state, the log line, and which metrics the caller reports. Everything that matters is
 * identical: the timeout against `getNlmMaxWaitMs()`, the attempt counter, the metadata write,
 * the backoff, the enqueue and the progress update. Two copies of a poll scheduler is two places
 * for a poll to be lost.
 *
 * The timeout THROWS rather than returning a failure, so it lands in the caller's retry
 * decision like any other error.
 */
async function scheduleDeferredNlmPoll(
  job: Job<Stage7JobInput, Stage7JobResult>,
  input: {
    enrichmentId: string;
    enrichmentMetadata: EnrichmentMetadata | null;
    deferredTask: NonNullable<GenerateResult['deferredTask']>;
    nlmAsyncState: Stage7NlmAsyncState | undefined;
    isNlmPollJob: boolean;
    draft?: Stage7NlmAsyncState['draft'];
    logMessage: string;
    /** `logger.child(...)`, whose pino generic differs from the root logger's. */
    jobLogger: typeof logger;
  }
): Promise<void> {
  const {
    enrichmentId,
    enrichmentMetadata,
    deferredTask,
    nlmAsyncState,
    isNlmPollJob,
    draft,
    logMessage,
    jobLogger,
  } = input;

  const startedAt = nlmAsyncState?.startedAt ?? new Date().toISOString();
  const elapsedMs = Date.now() - new Date(startedAt).getTime();
  const maxWaitMs = getNlmMaxWaitMs();
  if (elapsedMs > maxWaitMs) {
    throw new Error(
      `NotebookLM detached async task timed out after ${maxWaitMs}ms (taskId=${deferredTask.taskId})`
    );
  }

  const nextPollAttempt = (nlmAsyncState?.pollAttempt ?? 0) + 1;
  const nextAsyncState: Stage7NlmAsyncState = {
    taskId: deferredTask.taskId,
    mediaType: deferredTask.mediaType,
    pollAttempt: nextPollAttempt,
    startedAt,
    ...(draft ? { draft } : {}),
  };

  await saveNotebookLMAsyncMetadataState(enrichmentId, enrichmentMetadata, {
    taskId: nextAsyncState.taskId,
    mediaType: nextAsyncState.mediaType,
    status: deferredTask.status,
    pollAttempt: nextAsyncState.pollAttempt,
    startedAt: nextAsyncState.startedAt,
    lastPolledAt: new Date().toISOString(),
    responseMetadata: deferredTask.responseMetadata,
  });

  const pollDelayMs = getNlmPollDelayMs(nextPollAttempt);
  const nextJobId = await enqueueNlmPollJob(job.data, nextAsyncState, pollDelayMs);

  await updateJobProgress(job, {
    phase: isNlmPollJob ? 'polling_async' : 'pending_async',
    progress: 55,
    message: `NotebookLM task ${deferredTask.status}; next poll in ${Math.round(pollDelayMs / 1000)}s`,
  });

  jobLogger.info(
    {
      taskId: nextAsyncState.taskId,
      mediaType: nextAsyncState.mediaType,
      pollAttempt: nextAsyncState.pollAttempt,
      pollDelayMs,
      nextJobId,
      taskStatus: deferredTask.status,
    },
    logMessage
  );
}

/**
 * The job threw. Retry it, or write the failure where a user can see it.
 *
 * Retry re-throws so BullMQ owns the attempt counter — `job.attemptsMade` is the truth, not
 * anything carried in job data, because a retried job carries the ORIGINAL data.
 */
async function handleStage7Failure(
  job: Job<Stage7JobInput, Stage7JobResult>,
  error: unknown,
  input: {
    enrichmentId: string;
    enrichmentType: Stage7JobInput['enrichmentType'];
    startTime: number;
    /** `logger.child(...)`, whose pino generic differs from the root logger's. */
    jobLogger: typeof logger;
  }
): Promise<Stage7JobResult> {
  const { enrichmentId, enrichmentType, startTime, jobLogger } = input;
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const durationMs = Date.now() - startTime;

  jobLogger.error({ error: formatErrorForLogging(errorObj), durationMs }, 'Stage 7 job failed');

  // Check if we should retry (use BullMQ's actual attempt counter, not static job data)
  const retryContext = { enrichmentType, attempt: job.attemptsMade + 1, error: errorObj };

  if (shouldRetry(retryContext)) {
    const delay = getRetryDelay(retryContext);
    jobLogger.info(
      {
        delay,
        currentAttempt: retryContext.attempt,
        nextAttempt: retryContext.attempt + 1,
        maxRetries: 3,
      },
      'Will retry after delay'
    );

    // Sleep before retry (BullMQ will handle the actual retry)
    await sleep(delay);

    // Re-throw to trigger BullMQ retry
    throw error;
  }

  // Mark as failed in database
  await updateEnrichmentStatus(enrichmentId, 'failed', errorObj.message, {
    stack: errorObj.stack,
    attempt: job.attemptsMade + 1,
    jobId: job.id,
  });

  await updateJobProgress(job, {
    phase: 'error',
    progress: 0,
    message: `Generation failed: ${errorObj.message}`,
  });

  return createFailedResult(enrichmentId, errorObj.message, startTime);
}

export async function processStage7Job(
  job: Job<Stage7JobInput, Stage7JobResult>
): Promise<Stage7JobResult> {
  const {
    enrichmentId,
    enrichmentType,
    lessonId,
    courseId,
    settings = {},
    isDraftPhase = false,
    nlmAsyncState,
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

    if (enrichmentContext.enrichment.status === 'cancelled') {
      jobLogger.info('Enrichment already cancelled, skipping job');
      return createCancelledResult(enrichmentId, startTime);
    }

    const isNlmPollJob = Boolean(nlmAsyncState && isNotebookLMType(enrichmentType));

    // A poll job for an enrichment that already finished is a straggler: the task completed
    // through another path and this one must not reopen it.
    if (
      isNlmPollJob &&
      (enrichmentContext.enrichment.status === 'completed' ||
        enrichmentContext.enrichment.status === 'failed')
    ) {
      jobLogger.info(
        { currentStatus: enrichmentContext.enrichment.status },
        'Skipping stale NotebookLM poll job because enrichment is already terminal'
      );
      return {
        enrichmentId,
        success: enrichmentContext.enrichment.status === 'completed',
        status: enrichmentContext.enrichment.status,
        metrics: { durationMs: Date.now() - startTime },
      };
    }

    // Check for cancellation
    if (await checkCancellation(job)) {
      jobLogger.info('Job cancelled, aborting');
      return createFailedResult(enrichmentId, 'Job cancelled', startTime);
    }

    // Increment generation attempt only for non-poll jobs.
    const attemptNumber = isNlmPollJob
      ? Math.max(enrichmentContext.enrichment.generation_attempt || 1, 1)
      : await incrementGenerationAttempt(enrichmentId);
    jobLogger.debug(
      { attemptNumber, isNlmPollJob },
      isNlmPollJob
        ? 'Reusing generation attempt for NLM poll job'
        : 'Generation attempt incremented'
    );

    // Determine generation phase
    const isTwoStage = isTwoStageEnrichment(enrichmentType);
    const handler = routeEnrichment(enrichmentType);

    // Update status to generating
    const generatingStatus: EnrichmentStatus = isDraftPhase ? 'draft_generating' : 'generating';
    await updateEnrichmentStatus(enrichmentId, generatingStatus);

    await updateJobProgress(job, {
      phase: 'generating',
      progress: 30,
      message: `Generating ${enrichmentType} content`,
    });

    // Get model for LLM-based enrichments. A first attempt gets no override, so
    // the handler resolves the configured model; a retry is forced onto the
    // configured fallback, since the configured route just failed.
    const model = getModelForAttempt(
      enrichmentType,
      attemptNumber,
      await resolveConfiguredFallbackModel(enrichmentType, courseId, attemptNumber)
    );

    // Prepare handler input
    const handlerInput: EnrichmentHandlerInput = {
      enrichmentContext,
      settings: {
        ...settings,
        // Only when there is one: writing the key unconditionally overwrote a
        // model the caller had chosen with whatever this package thought.
        ...(model ? { model } : {}),
        __nlm_async_mode: isNlmPollJob ? 'poll' : 'start',
        __nlm_bridge_task_id: nlmAsyncState?.taskId,
        __nlm_poll_attempt: nlmAsyncState?.pollAttempt ?? 0,
      },
    };

    // Two-stage, phase 1: produce a draft for a human to approve.
    if (isTwoStage && isDraftPhase && handler.generateDraft) {
      jobLogger.info('Generating draft for two-stage enrichment');

      const draftResult = await handler.generateDraft(handlerInput);

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

      jobLogger.info({ durationMs: draftResult.metadata.durationMs }, 'Draft generation completed');

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

    // Two-stage, phase 2: final content from the approved draft.
    if (isTwoStage && !isDraftPhase && handler.generateFinal) {
      jobLogger.info('Generating final content from approved draft');

      // The approved draft is the enrichment's own content, with selected_variant set.
      const draftContent = enrichmentContext.enrichment.content;
      if (!draftContent) {
        throw new Error('Draft content missing for final generation. Please regenerate the draft.');
      }

      const storedMetadata = enrichmentContext.enrichment.metadata as Record<
        string,
        unknown
      > | null;
      const result = await handler.generateFinal(handlerInput, {
        draftContent,
        metadata: {
          durationMs: 0, // Already counted in draft phase
          tokensUsed: (storedMetadata?.total_tokens as number) ?? 0,
          modelUsed: (storedMetadata?.model_used as string) ?? 'unknown',
        },
      });

      return finalizeSuccessfulResult(job, {
        enrichmentId,
        enrichmentType,
        courseId,
        lessonId,
        result,
        startTime,
        logMessage: 'Stage 7 two-stage final generation completed',
        jobLogger,
      });
    }

    // NotebookLM single-stage: a draft feeds straight into the final call, and the result may
    // be a detached task rather than content.
    if (isNotebookLMType(enrichmentType) && handler.generateDraft && handler.generateFinal) {
      const activeDraft = nlmAsyncState?.draft ?? (await handler.generateDraft(handlerInput));
      const nlmResult = await handler.generateFinal(handlerInput, activeDraft);

      if (nlmResult.deferredTask) {
        await scheduleDeferredNlmPoll(job, {
          enrichmentId,
          enrichmentMetadata: enrichmentContext.enrichment.metadata,
          deferredTask: nlmResult.deferredTask,
          nlmAsyncState,
          isNlmPollJob,
          draft: activeDraft,
          logMessage: 'NotebookLM detached task pending, scheduled poll job',
          jobLogger,
        });

        return {
          enrichmentId,
          success: true,
          status: 'generating',
          metrics: {
            durationMs: Date.now() - startTime,
            tokensUsed: nlmResult.metadata.total_tokens,
            costUsd: nlmResult.metadata.estimated_cost_usd,
            modelUsed: nlmResult.metadata.model_used,
          },
        };
      }

      return finalizeSuccessfulResult(job, {
        enrichmentId,
        enrichmentType,
        courseId,
        lessonId,
        result: nlmResult,
        startTime,
        logMessage: 'Stage 7 NotebookLM single-stage generation completed',
        jobLogger,
      });
    }

    jobLogger.info('Generating final enrichment content');
    const result = await handler.generate(handlerInput);

    // Handle deferred async task from single-stage handlers (e.g. NLM text/image artifacts)
    if (result.deferredTask) {
      await scheduleDeferredNlmPoll(job, {
        enrichmentId,
        enrichmentMetadata: enrichmentContext.enrichment.metadata,
        deferredTask: result.deferredTask,
        nlmAsyncState,
        isNlmPollJob,
        logMessage: 'Single-stage handler returned deferred task, scheduled poll job',
        jobLogger,
      });

      return {
        enrichmentId,
        success: true,
        status: 'generating',
        metrics: { durationMs: Date.now() - startTime },
      };
    }

    return finalizeSuccessfulResult(job, {
      enrichmentId,
      enrichmentType,
      courseId,
      lessonId,
      result,
      startTime,
      logMessage: 'Stage 7 job completed successfully',
      jobLogger,
    });
  } catch (error) {
    return handleStage7Failure(job, error, {
      enrichmentId,
      enrichmentType,
      startTime,
      jobLogger,
    });
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
