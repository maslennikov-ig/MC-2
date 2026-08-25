/**
 * One attempt at generating a lesson, and what to do when it does not work.
 *
 * @module model-fallback
 *
 * Split out of `job-processor.ts` at 1345 lines of code. The seam is the level of the decision:
 * this module answers "did THIS model, on THIS attempt, produce something usable, and is the
 * failure worth retrying" — while the job processor above it answers "which rung of the quality
 * ladder next" and "where does the result get written". The most-edited file in the repository
 * is the one that most needs those two questions kept apart.
 */

import { Job } from 'bullmq';
import { resolveLessonUuid } from '@/shared/database/lesson-resolver';
import { logger } from '@/shared/logger';
import {
  executeStage6 as executeStage6Orchestrator,
  type Stage6Input,
  type Stage6Output,
} from '../orchestrator';
import type {
  Stage6JobInput,
  Stage6JobResult,
  ProgressUpdate,
  ModelConfig,
  Stage6ModelTierName,
  Stage6PrefetchedGeneratorResponse,
} from '../types';
import { MODEL_FALLBACK } from '../config';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createStage6RagFailureResult(
  lessonId: string,
  startTime: number,
  errorMessage: string
): Stage6JobResult {
  return {
    lessonId,
    success: false,
    lessonContent: null,
    errors: [errorMessage],
    metrics: {
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
      modelUsed: null,
      selectedModel: null,
      fallbackModel: null,
      selectedModelTier: null,
      selectedModelTierReason: null,
      selectedModelPhase: null,
      selectedModelSource: null,
      qualityScore: 0,
      regenerateCount: 0,
      truncationCount: 0,
      rejectedTokens: 0,
      regenerationMode: null,
      attemptLadder: [],
    },
  };
}

type Stage6FailureDisposition = 'quality_review' | 'non_retryable' | 'retryable';

const NON_RETRYABLE_STAGE6_PATTERNS = [
  'invalid job input',
  'invalid lesson_id',
  'invalid depth value',
  'schema validation',
  'zod',
  'unauthorized',
  'forbidden',
  'invalid api key',
  'cannot aggregate empty',
  'missing prerequisites',
];

const STRUCTURAL_MISMATCH_PATTERNS = [
  'schema validation',
  'validation failed',
  'zod',
  'invalid',
  'missing field',
  'missing required',
  'required field',
  'sections mismatch',
];

function isLessonSpecificationQualityMismatchError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes('max regeneration retries') &&
    normalizedMessage.includes('review lessonspecification') &&
    normalizedMessage.includes('mismatch')
  );
}

function classifyStage6FailureMessages(messages: string[]): Stage6FailureDisposition {
  let sawQualityReview = false;

  for (const message of messages) {
    const normalizedMessage = message.toLowerCase();

    if (isLessonSpecificationQualityMismatchError(normalizedMessage)) {
      sawQualityReview = true;
      continue;
    }

    if (NON_RETRYABLE_STAGE6_PATTERNS.some(pattern => normalizedMessage.includes(pattern))) {
      return 'non_retryable';
    }

    if (
      normalizedMessage.includes('mismatch') &&
      STRUCTURAL_MISMATCH_PATTERNS.some(pattern => normalizedMessage.includes(pattern))
    ) {
      return 'non_retryable';
    }
  }

  return sawQualityReview ? 'quality_review' : 'retryable';
}

function buildStage6QualityReviewOutput(
  errors: string[],
  existingResult?: Stage6Output
): Stage6Output {
  const reasons =
    existingResult?.reviewInfo?.reasons && existingResult.reviewInfo.reasons.length > 0
      ? existingResult.reviewInfo.reasons
      : errors;

  return {
    lessonContent: existingResult?.lessonContent ?? null,
    success: true,
    errors,
    metrics: existingResult?.metrics ?? {
      tokensUsed: 0,
      durationMs: 0,
      modelUsed: null,
      selectedModel: null,
      fallbackModel: null,
      selectedModelTier: null,
      selectedModelTierReason: null,
      selectedModelPhase: null,
      selectedModelSource: null,
      qualityScore: 0,
      regenerateCount: 0,
      truncationCount: 0,
      rejectedTokens: 0,
      regenerationMode: null,
      attemptLadder: [],
    },
    reviewInfo: {
      needsReview: true,
      reasons,
    },
    lessonDigest: existingResult?.lessonDigest,
  };
}

/**
 * Update job progress for streaming
 */
export async function updateJobProgress(job: Job, update: ProgressUpdate): Promise<void> {
  try {
    await job.updateProgress(update);

    logger.debug(
      {
        jobId: job.id,
        phase: update.phase,
        progress: update.progress,
      },
      'Progress update sent'
    );
  } catch (error) {
    logger.warn(
      {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to update job progress'
    );
  }
}

/**
 * Execute Stage 6 orchestrator adapter
 */
async function executeStage6(input: Stage6JobInput): Promise<Stage6Output> {
  const {
    lessonSpec,
    courseId,
    ragChunks,
    ragContextId,
    language,
    modelOverride,
    maxTokensOverride,
    userRefinementPrompt,
    style,
    analysisResult,
    selectedModel,
    fallbackModel,
    selectedModelTier,
    selectedModelTierReason,
    selectedModelPhase,
    selectedModelSource,
    prefetchedGeneratorResponse,
  } = input;

  const lessonLabel = lessonSpec.lesson_id;
  const lessonUuid = await resolveLessonUuid(courseId, lessonLabel);

  const orchestratorInput: Stage6Input = {
    lessonSpec,
    courseId,
    language,
    lessonUuid,
    ragChunks: ragChunks ?? [],
    ragContextId: ragContextId ?? undefined,
    userRefinementPrompt,
    modelOverride,
    maxTokensOverride,
    style,
    analysisResult,
    selectedModel: selectedModel ?? null,
    fallbackModel: fallbackModel ?? null,
    selectedModelTier: selectedModelTier ?? null,
    selectedModelTierReason: selectedModelTierReason ?? null,
    selectedModelPhase: selectedModelPhase ?? null,
    selectedModelSource: selectedModelSource ?? null,
    prefetchedGeneratorResponse,
  };

  return executeStage6Orchestrator(orchestratorInput);
}

/**
 * Errors that should NOT be retried — structural/input issues that will fail again.
 * Aligned with Stage 5 isRetryableError pattern (v0.30.4).
 */
function isNonRetryableStage6Error(error: Error): boolean {
  return classifyStage6FailureMessages([error.message]) === 'non_retryable';
}

/**
 * Check if orchestrator result errors indicate a non-retryable structural problem.
 */
function hasNonRetryableResultErrors(errors: string[]): boolean {
  return classifyStage6FailureMessages(errors) === 'non_retryable';
}

/**
 * Process job with model fallback strategy
 */
// RAG chunk type for Stage 6 (matches actual Qdrant search result structure)
export interface RAGChunk {
  metadata: Record<string, unknown>;
  chunk_id: string;
  content: string;
  document_id: string;
  document_name: string;
  relevance_score: number;
  page_or_section?: string;
}

export type Stage6ModelSelection = {
  selectedModel: string;
  fallbackModel: string;
  selectedModelTier: Stage6ModelTierName | null;
  selectedModelTierReason: string;
  selectedModelPhase: string | null;
  selectedModelSource: string | null;
  maxTokensOverride?: number | null;
};

/**
 * The input for one generation attempt.
 *
 * Twelve fields, and they were written out twice — once for the primary model and once for the
 * fallback — differing only in `modelOverride`. A field added to one copy and not the other is
 * a model attribute that silently disappears on fallback, which is exactly the failure this
 * repository has already paid for in cost attribution.
 */
function buildStage6ExecutionInput(
  job: Job<Stage6JobInput, Stage6JobResult>,
  modelOverride: string,
  context: {
    lessonUuid: string | null;
    ragChunks: RAGChunk[];
    ragContextId: string | null;
    modelSelection?: Stage6ModelSelection;
    prefetchedGeneratorResponse: Stage6PrefetchedGeneratorResponse | undefined;
  }
): Stage6JobInput {
  const { lessonUuid, ragChunks, ragContextId, modelSelection, prefetchedGeneratorResponse } =
    context;
  return {
    ...job.data,
    lessonUuid,
    ragChunks,
    ragContextId,
    modelOverride,
    maxTokensOverride: modelSelection?.maxTokensOverride ?? undefined,
    selectedModel: modelSelection?.selectedModel ?? null,
    fallbackModel: modelSelection?.fallbackModel ?? null,
    selectedModelTier: modelSelection?.selectedModelTier ?? null,
    selectedModelTierReason: modelSelection?.selectedModelTierReason ?? null,
    selectedModelPhase: modelSelection?.selectedModelPhase ?? null,
    selectedModelSource: modelSelection?.selectedModelSource ?? null,
    prefetchedGeneratorResponse,
  };
}

/**
 * The three ways an attempt can be DONE rather than retried, shared by both models.
 *
 * Returns the output to hand back, or `null` meaning "this attempt did not settle it". The
 * order matters and is not arbitrary: a successful result wins; a result the pipeline itself
 * flagged for review is fail-open and must NOT be retried, because retrying it burns a paid
 * call to reach the same verdict; and a LessonSpecification quality mismatch that has exhausted
 * its own retries is the outer ladder's business, not this function's.
 */
function settleStage6Attempt(
  result: Stage6Output,
  log: {
    jobId: string;
    model: string;
    attempt?: number;
    isFallback: boolean;
  }
): Stage6Output | null {
  const { jobId, model, attempt, isFallback } = log;
  const modelField = isFallback ? { fallbackModel: model } : { model, attempt };

  if (result.success) {
    if (isFallback) {
      logger.info({ jobId, fallbackModel: model }, 'Fallback model succeeded');
    }
    return result;
  }

  if (result.reviewInfo?.needsReview) {
    logger.warn(
      { jobId, ...modelField, reviewInfo: result.reviewInfo },
      isFallback
        ? 'Fallback attempt ended with review_required (fail-open)'
        : 'Primary model attempt ended with review_required (fail-open)'
    );
    return result;
  }

  if (classifyStage6FailureMessages(result.errors) === 'quality_review') {
    logger.info(
      { jobId, ...modelField, errors: result.errors },
      isFallback
        ? 'Treating fallback Stage 6 quality mismatch exhaustion as review_required for outer ladder'
        : 'Treating Stage 6 quality mismatch exhaustion as review_required for outer ladder'
    );
    return buildStage6QualityReviewOutput(result.errors, result);
  }

  return null;
}

/**
 * A thrown quality mismatch means the same thing a returned one does.
 *
 * Both models handled this identically; only the log wording differed.
 */
function settleStage6Exception(
  error: Error,
  log: { jobId: string; model: string; attempt?: number; isFallback: boolean }
): Stage6Output | null {
  if (classifyStage6FailureMessages([error.message]) !== 'quality_review') return null;

  const { jobId, model, attempt, isFallback } = log;
  logger.info(
    {
      jobId,
      ...(isFallback ? { fallbackModel: model } : { model, attempt }),
      error: error.message,
    },
    isFallback
      ? 'Treating fallback Stage 6 quality mismatch exception as review_required for outer ladder'
      : 'Treating Stage 6 quality mismatch exception as review_required for outer ladder'
  );
  return buildStage6QualityReviewOutput([error.message]);
}

export async function processWithFallback(
  job: Job<Stage6JobInput, Stage6JobResult>,
  modelConfig: ModelConfig,
  lessonUuid: string | null,
  ragChunks: RAGChunk[],
  ragContextId: string | null,
  modelSelection?: Stage6ModelSelection,
  prefetchedGeneratorResponse?: Stage6PrefetchedGeneratorResponse | null
): Promise<Stage6Output> {
  let lastError: Error | null = null;
  const jobId = job.id ?? 'unknown';
  let pendingPrefetchedResponse =
    prefetchedGeneratorResponse === undefined
      ? (job.data.prefetchedGeneratorResponse ?? null)
      : prefetchedGeneratorResponse;

  // A prefetched Batch response belongs to ONE attempt. Consuming it here means a retry
  // regenerates rather than replaying the response that already failed.
  const consumePrefetchedResponse = (): Stage6PrefetchedGeneratorResponse | undefined => {
    const response = pendingPrefetchedResponse ?? undefined;
    pendingPrefetchedResponse = null;
    return response;
  };

  const executionContext = () => ({
    lessonUuid,
    ragChunks,
    ragContextId,
    modelSelection,
    prefetchedGeneratorResponse: consumePrefetchedResponse(),
  });

  for (let attempt = 1; attempt <= MODEL_FALLBACK.maxPrimaryAttempts; attempt++) {
    const log = { jobId, model: modelConfig.primary, attempt, isFallback: false };

    try {
      logger.info(
        {
          jobId,
          model: modelConfig.primary,
          attempt,
          maxAttempts: MODEL_FALLBACK.maxPrimaryAttempts,
        },
        'Attempting with primary model'
      );

      const result = await executeStage6(
        buildStage6ExecutionInput(job, modelConfig.primary, executionContext())
      );

      const settled = settleStage6Attempt(result, log);
      if (settled) return settled;

      lastError = new Error(result.errors.join(', ') || 'Unknown generation error');

      // Bail out immediately for non-retryable structural errors in result
      if (hasNonRetryableResultErrors(result.errors)) {
        logger.warn(
          { jobId, model: modelConfig.primary, attempt, errors: result.errors },
          'Non-retryable result errors, skipping remaining attempts and fallback'
        );
        throw lastError;
      }

      logger.warn(
        { jobId, model: modelConfig.primary, attempt, errors: result.errors },
        'Primary model attempt returned unsuccessful result'
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const settled = settleStage6Exception(lastError, log);
      if (settled) return settled;

      // Bail out immediately for non-retryable structural errors
      if (isNonRetryableStage6Error(lastError)) {
        logger.warn(
          { jobId, model: modelConfig.primary, attempt, error: lastError.message },
          'Non-retryable error, skipping remaining attempts and fallback'
        );
        throw lastError;
      }

      logger.warn(
        { jobId, model: modelConfig.primary, attempt, error: lastError.message },
        'Primary model attempt failed with exception'
      );
    }

    if (attempt < MODEL_FALLBACK.maxPrimaryAttempts) {
      const backoffMs = 1000 * Math.pow(2, attempt - 1);
      logger.debug({ jobId, backoffMs }, 'Waiting before retry');
      await sleep(backoffMs);
    }
  }

  logger.info(
    { jobId, fallbackModel: modelConfig.fallback, previousError: lastError?.message },
    'Falling back to secondary model'
  );

  const fallbackLog = { jobId, model: modelConfig.fallback, isFallback: true };

  try {
    const result = await executeStage6(
      buildStage6ExecutionInput(job, modelConfig.fallback, executionContext())
    );

    const settled = settleStage6Attempt(result, fallbackLog);
    if (settled) return settled;

    logger.error(
      { jobId, fallbackModel: modelConfig.fallback, errors: result.errors },
      'Fallback model returned unsuccessful result'
    );
    throw new Error(result.errors.join(', ') || 'Fallback model returned unsuccessful result');
  } catch (error) {
    const fallbackError = error instanceof Error ? error : new Error(String(error));

    const settled = settleStage6Exception(fallbackError, fallbackLog);
    if (settled) return settled;

    logger.error(
      {
        jobId,
        fallbackModel: modelConfig.fallback,
        error: fallbackError.message,
        primaryError: lastError?.message,
      },
      'Both primary and fallback models failed'
    );

    // The PRIMARY error is what the caller sees when both failed: it is the one that describes
    // the model the ladder actually chose, and the fallback failing too is corroboration.
    throw lastError || fallbackError;
  }
}

/**
 * Enrich summary_preview with actual lesson digest from database.
 *
 * When a previous lesson has already been generated and its digest persisted,
 * override the objectives-based summary_preview with the real digest.
 * This improves inter-lesson coherence for retries, regenerations, and
 * cases where the previous lesson completed before the current one started.
 *
 * Mutates lessonSpec.lesson_context.previous_lesson.summary_preview in place.
 */
