import { Job, UnrecoverableError } from 'bullmq';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { resolveLessonUuid } from '@/shared/database/lesson-resolver';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { checkPauseAndDelay, isCoursePaused } from '@/shared/pause-check';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import { RequiredRagUnavailableError } from '@/shared/rag/document-availability';
import {
  executeStage6 as executeStage6Orchestrator,
  type Stage6Input,
  type Stage6Output,
} from '../orchestrator';
import {
  retrieveLessonContext,
  extractSourceDocuments,
  type LessonRAGResult,
  type SourceDocument,
} from '../utils/lesson-rag-retriever';
import { quickSanityCheck, type SanityCheckResult } from '../utils/sanity-check';
import { createLessonLabel, LessonLabel, validateLanguageCode } from '@megacampus/shared-types';
import type {
  Stage6AutomaticQualityRungPhaseName,
  Stage6QualityRungPhaseName,
} from '@megacampus/shared-types/stage6-quality-recovery';

import {
  Stage6JobInput,
  Stage6JobResult,
  ProgressUpdate,
  ModelConfig,
  Stage6ExecutionPolicy,
  Stage6QualityRecoveryAttemptHistory,
  Stage6QualityRecoveryHistory,
  Stage6ModelTierName,
} from '../types';
import { MODEL_FALLBACK } from '../config';
import {
  classifyStage6QualityRecoveryFinalDisposition,
  planStage6QualityRecoveryAttempts,
} from '../execution/quality-ladder';
import { selectStage6ModelTier } from '../nodes/generator/model-selector';
import {
  handlePartialSuccess,
  failStage6Course,
  isStage6CourseActive,
  markForReview,
  saveLessonContent,
  saveSourceDocuments,
  checkAndSetStage6Complete,
} from './database-service';
import { extractContentMarkdown } from './content-utils';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
interface RAGChunk {
  metadata: Record<string, unknown>;
  chunk_id: string;
  content: string;
  document_id: string;
  document_name: string;
  relevance_score: number;
  page_or_section?: string;
}

export async function processWithFallback(
  job: Job<Stage6JobInput, Stage6JobResult>,
  modelConfig: ModelConfig,
  lessonUuid: string | null,
  ragChunks: RAGChunk[],
  ragContextId: string | null,
  modelSelection?: {
    selectedModel: string;
    fallbackModel: string;
    selectedModelTier: Stage6ModelTierName | null;
    selectedModelTierReason: string;
    selectedModelPhase: string | null;
    selectedModelSource: string | null;
    maxTokensOverride?: number | null;
  }
): Promise<Stage6Output> {
  let lastError: Error | null = null;
  const jobId = job.id ?? 'unknown';

  for (let attempt = 1; attempt <= MODEL_FALLBACK.maxPrimaryAttempts; attempt++) {
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

      const result = await executeStage6({
        ...job.data,
        lessonUuid,
        ragChunks,
        ragContextId,
        modelOverride: modelConfig.primary,
        maxTokensOverride: modelSelection?.maxTokensOverride ?? undefined,
        selectedModel: modelSelection?.selectedModel ?? null,
        fallbackModel: modelSelection?.fallbackModel ?? null,
        selectedModelTier: modelSelection?.selectedModelTier ?? null,
        selectedModelTierReason: modelSelection?.selectedModelTierReason ?? null,
        selectedModelPhase: modelSelection?.selectedModelPhase ?? null,
        selectedModelSource: modelSelection?.selectedModelSource ?? null,
      });

      if (result.success) {
        return result;
      }

      if (result.reviewInfo?.needsReview) {
        logger.warn(
          {
            jobId,
            model: modelConfig.primary,
            attempt,
            reviewInfo: result.reviewInfo,
          },
          'Primary model attempt ended with review_required (fail-open)'
        );
        return result;
      }

      if (classifyStage6FailureMessages(result.errors) === 'quality_review') {
        logger.info(
          {
            jobId,
            model: modelConfig.primary,
            attempt,
            errors: result.errors,
          },
          'Treating Stage 6 quality mismatch exhaustion as review_required for outer ladder'
        );
        return buildStage6QualityReviewOutput(result.errors, result);
      }

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
        {
          jobId,
          model: modelConfig.primary,
          attempt,
          errors: result.errors,
        },
        'Primary model attempt returned unsuccessful result'
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (classifyStage6FailureMessages([lastError.message]) === 'quality_review') {
        logger.info(
          { jobId, model: modelConfig.primary, attempt, error: lastError.message },
          'Treating Stage 6 quality mismatch exception as review_required for outer ladder'
        );
        return buildStage6QualityReviewOutput([lastError.message]);
      }

      // Bail out immediately for non-retryable structural errors
      if (isNonRetryableStage6Error(lastError)) {
        logger.warn(
          { jobId, model: modelConfig.primary, attempt, error: lastError.message },
          'Non-retryable error, skipping remaining attempts and fallback'
        );
        throw lastError;
      }

      logger.warn(
        {
          jobId,
          model: modelConfig.primary,
          attempt,
          error: lastError.message,
        },
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
    {
      jobId,
      fallbackModel: modelConfig.fallback,
      previousError: lastError?.message,
    },
    'Falling back to secondary model'
  );

  try {
    const result = await executeStage6({
      ...job.data,
      lessonUuid,
      ragChunks,
      ragContextId,
      modelOverride: modelConfig.fallback,
      maxTokensOverride: modelSelection?.maxTokensOverride ?? undefined,
      selectedModel: modelSelection?.selectedModel ?? null,
      fallbackModel: modelSelection?.fallbackModel ?? null,
      selectedModelTier: modelSelection?.selectedModelTier ?? null,
      selectedModelTierReason: modelSelection?.selectedModelTierReason ?? null,
      selectedModelPhase: modelSelection?.selectedModelPhase ?? null,
      selectedModelSource: modelSelection?.selectedModelSource ?? null,
    });

    if (result.success) {
      logger.info(
        {
          jobId,
          fallbackModel: modelConfig.fallback,
        },
        'Fallback model succeeded'
      );
      return result;
    }

    if (result.reviewInfo?.needsReview) {
      logger.warn(
        {
          jobId,
          fallbackModel: modelConfig.fallback,
          reviewInfo: result.reviewInfo,
        },
        'Fallback attempt ended with review_required (fail-open)'
      );
      return result;
    }

    if (classifyStage6FailureMessages(result.errors) === 'quality_review') {
      logger.info(
        {
          jobId,
          fallbackModel: modelConfig.fallback,
          errors: result.errors,
        },
        'Treating fallback Stage 6 quality mismatch exhaustion as review_required for outer ladder'
      );
      return buildStage6QualityReviewOutput(result.errors, result);
    }

    const fallbackError = new Error(
      result.errors.join(', ') || 'Fallback model returned unsuccessful result'
    );
    logger.error(
      {
        jobId,
        fallbackModel: modelConfig.fallback,
        errors: result.errors,
      },
      'Fallback model returned unsuccessful result'
    );
    throw fallbackError;
  } catch (error) {
    const fallbackError = error instanceof Error ? error : new Error(String(error));

    if (classifyStage6FailureMessages([fallbackError.message]) === 'quality_review') {
      logger.info(
        { jobId, fallbackModel: modelConfig.fallback, error: fallbackError.message },
        'Treating fallback Stage 6 quality mismatch exception as review_required for outer ladder'
      );
      return buildStage6QualityReviewOutput([fallbackError.message]);
    }

    logger.error(
      {
        jobId,
        fallbackModel: modelConfig.fallback,
        error: fallbackError.message,
        primaryError: lastError?.message,
      },
      'Both primary and fallback models failed'
    );

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
async function enrichSummaryPreviewFromDB(
  courseId: string,
  lessonSpec: Stage6JobInput['lessonSpec']
): Promise<void> {
  const prevLessonId = lessonSpec.lesson_context?.previous_lesson?.lesson_id;
  if (!prevLessonId) return;

  try {
    const prevUuid = await resolveLessonUuid(courseId, prevLessonId);
    if (!prevUuid) return;

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('lesson_contents')
      .select('metadata')
      .eq('lesson_id', prevUuid)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const digest = (data?.metadata as Record<string, unknown>)?.lessonDigest;
    if (typeof digest === 'string' && digest.length > 0) {
      lessonSpec.lesson_context!.previous_lesson!.summary_preview = digest;
      logger.info(
        { courseId, lessonId: lessonSpec.lesson_id, prevLessonId, digestLength: digest.length },
        'Enriched summary_preview with previous lesson digest from DB'
      );
    }
  } catch {
    // Non-fatal: fall back to objectives-based summary_preview
    logger.debug(
      { courseId, lessonId: lessonSpec.lesson_id, prevLessonId },
      'Could not enrich summary_preview from DB (non-fatal)'
    );
  }
}

/**
 * Build a zero-value metrics object for early-return / error paths where
 * tier selection has already completed but no generation was performed.
 */
function buildZeroMetrics(
  tierResult: {
    model: string | null;
    fallback: string | null;
    tier: Stage6ModelTierName | null;
    reason: string | null;
    phaseName?: string | null;
    source?: string | null;
  },
  durationMs: number
): Stage6JobResult['metrics'] {
  return {
    tokensUsed: 0,
    durationMs,
    modelUsed: null,
    selectedModel: tierResult.model,
    fallbackModel: tierResult.fallback,
    selectedModelTier: tierResult.tier,
    selectedModelTierReason: tierResult.reason,
    selectedModelPhase: tierResult.phaseName ?? null,
    selectedModelSource: tierResult.source ?? null,
    qualityScore: 0,
    regenerateCount: 0,
    truncationCount: 0,
    rejectedTokens: 0,
    regenerationMode: null,
    attemptLadder: [],
  };
}

interface ResolvedStage6ExecutionPlan {
  initialAutomaticTier: {
    tier: Stage6ModelTierName;
    reason: string;
  } | null;
  initialAutomaticRung?: Stage6AutomaticQualityRungPhaseName;
  qualityRecovery: Stage6QualityRecoveryHistory;
}

interface ResolvedRungModelConfig {
  primary: string;
  fallback: string;
  source: string;
  maxTokens: number | null;
}

function isManualTopRegenerationPolicy(
  policy?: Stage6ExecutionPolicy
): policy is Stage6ExecutionPolicy {
  return policy?.mode === 'manual_top_regeneration';
}

function mapTierToAutomaticRung(tier: Stage6ModelTierName): Stage6AutomaticQualityRungPhaseName {
  return `stage_6_${tier}` as Stage6AutomaticQualityRungPhaseName;
}

function mapRungToLegacyTier(phaseName: Stage6QualityRungPhaseName): Stage6ModelTierName | null {
  switch (phaseName) {
    case 'stage_6_simple':
      return 'simple';
    case 'stage_6_normal':
      return 'normal';
    case 'stage_6_complex':
      return 'complex';
    default:
      return null;
  }
}

async function resolveRungModelConfig(
  phaseName: Stage6QualityRungPhaseName,
  courseId: string,
  language: string
): Promise<ResolvedRungModelConfig> {
  const modelConfigService = createModelConfigService();
  const phaseConfig = await modelConfigService.getModelForPhase(
    phaseName,
    courseId,
    undefined,
    language
  );

  return {
    primary: phaseConfig.modelId,
    fallback: phaseConfig.fallbackModelId ?? MODEL_FALLBACK.fallback,
    source: phaseConfig.source,
    maxTokens: phaseConfig.maxTokens ?? null,
  };
}

async function resolveStage6ExecutionPlan(
  lessonSpec: Stage6JobInput['lessonSpec'],
  courseId: string,
  executionPolicy?: Stage6ExecutionPolicy
): Promise<ResolvedStage6ExecutionPlan> {
  if (isManualTopRegenerationPolicy(executionPolicy)) {
    return {
      initialAutomaticTier: null,
      qualityRecovery: {
        mode: 'manual',
        manual_triggered: true,
        attempts: [],
      },
    };
  }

  const tierResult = await selectStage6ModelTier(lessonSpec, courseId);

  return {
    initialAutomaticTier: {
      tier: tierResult.tier,
      reason: tierResult.reason,
    },
    initialAutomaticRung: mapTierToAutomaticRung(tierResult.tier),
    qualityRecovery: {
      mode: 'automatic',
      attempts: [],
    },
  };
}

function createSameTierRetryReason(
  phaseName: Stage6QualityRungPhaseName,
  rungAttemptIndex: number
): string {
  return rungAttemptIndex === 0
    ? `Initial quality rung ${phaseName}`
    : `Same-tier retry ${rungAttemptIndex} for ${phaseName}`;
}

function createPromotedRungReason(
  phaseName: Stage6QualityRungPhaseName,
  promotedFromPhaseName: Stage6QualityRungPhaseName | undefined
): string {
  if (promotedFromPhaseName) {
    return `Promoted from ${promotedFromPhaseName} to ${phaseName} after quality_retryable`;
  }

  return `Quality rung ${phaseName}`;
}

function createSelectedModelTierReason(
  rungPhaseName: Stage6QualityRungPhaseName,
  rungAttemptIndex: number,
  promotedFromPhaseName: Stage6QualityRungPhaseName | undefined,
  initialAutomaticTierReason: string | null,
  modelSource: string
): string {
  if (rungPhaseName === 'stage_6_manual_regeneration') {
    return `Manual top-model regeneration via ${rungPhaseName} (${modelSource})`;
  }

  if (promotedFromPhaseName) {
    return `${createPromotedRungReason(rungPhaseName, promotedFromPhaseName)} (${modelSource})`;
  }

  const retryReason = createSameTierRetryReason(rungPhaseName, rungAttemptIndex);
  if (initialAutomaticTierReason) {
    return `${initialAutomaticTierReason}; ${retryReason} (${modelSource})`;
  }

  return `${retryReason} (${modelSource})`;
}

function appendQualityRecoveryAttempt(
  qualityRecovery: Stage6QualityRecoveryHistory,
  attempt: Stage6QualityRecoveryAttemptHistory
): void {
  qualityRecovery.attempts.push(attempt);
}

/**
 * Process a single Stage 6 job
 * @param job - The BullMQ job to process
 * @param token - Job token for lock management (required for pause/delay, validated at runtime)
 */
export async function processStage6Job(
  job: Job<Stage6JobInput, Stage6JobResult>,
  token?: string
): Promise<Stage6JobResult> {
  // Style parameter flows through job.data spread to executeStage6 via processWithFallback
  const {
    lessonSpec,
    courseId,
    language: rawLanguage,
    style,
    userRefinementPrompt: _userRefinementPrompt,
  } = job.data;
  const language = validateLanguageCode(rawLanguage);
  const startTime = Date.now();

  // Check if course generation is paused - if so, delay this job
  await checkPauseAndDelay(job, courseId, token);

  const executionContext = job.data.executionContext ?? 'full_generation';
  const courseActive = await isStage6CourseActive(courseId, executionContext);
  if (!courseActive) {
    // Throw UnrecoverableError so BullMQ marks the job as *failed*, not completed.
    // This prevents false-positive "completed" status when a job no-ops due to
    // the course no longer being in an active generation state.
    const message = `Stage 6 course is no longer active (executionContext=${executionContext})`;
    logger.warn({ jobId: job.id, courseId, executionContext }, message);
    throw new UnrecoverableError(message);
  }

  if (
    !lessonSpec ||
    !lessonSpec.lesson_id ||
    !lessonSpec.sections ||
    !Array.isArray(lessonSpec.sections)
  ) {
    const errorMsg = 'Invalid job input: lessonSpec must have lesson_id and sections array';
    logger.error({ jobId: job.id, lessonSpec }, errorMsg);
    return {
      lessonId: lessonSpec?.lesson_id || 'unknown',
      success: false,
      lessonContent: null,
      errors: [errorMsg],
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

  let ragChunks: RAGChunk[] = [];
  let ragContextId: string | null = null;
  let sourceDocuments: SourceDocument[] = [];

  try {
    const ragResult: LessonRAGResult = await retrieveLessonContext({
      courseId,
      lessonSpec,
      // Priority boost is enabled by default in retrieveLessonContext
    });
    ragChunks = ragResult.chunks;
    ragContextId = ragResult.lessonId;

    // Extract source document attribution for traceability
    // @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
    sourceDocuments = extractSourceDocuments(ragChunks);

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        courseId,
        chunksCount: ragChunks.length,
        cached: ragResult.cached,
        coverageScore: ragResult.coverageScore,
        retrievalDurationMs: ragResult.retrievalDurationMs,
        sourceDocumentsCount: sourceDocuments.length,
        coreDocsUsed: sourceDocuments.filter(d => d.document_priority === 'CORE').length,
      },
      'RAG context retrieved for lesson'
    );
  } catch (error) {
    if (error instanceof RequiredRagUnavailableError) {
      const errorMsg = error.message;

      await failStage6Course(courseId, errorMsg);

      return {
        lessonId: lessonSpec.lesson_id,
        success: false,
        lessonContent: null,
        errors: [errorMsg],
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

    logger.warn(
      {
        lessonId: lessonSpec.lesson_id,
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'RAG retrieval failed, continuing without context'
    );
  }

  // Enrich summary_preview with actual digest from previous lesson (if available)
  await enrichSummaryPreviewFromDB(courseId, lessonSpec);

  let lessonLabel: LessonLabel;
  try {
    lessonLabel = createLessonLabel(lessonSpec.lesson_id);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { lessonId: lessonSpec.lesson_id, error: errorMsg },
      'Invalid lesson_id format - cannot process job'
    );
    return {
      lessonId: lessonSpec.lesson_id,
      success: false,
      lessonContent: null,
      errors: ['Invalid lesson_id format: ' + errorMsg],
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

  const lessonUuid = await resolveLessonUuid(courseId, lessonLabel);
  const executionPlan = await resolveStage6ExecutionPlan(
    lessonSpec,
    courseId,
    job.data.executionPolicy
  );

  const initialSelectionSummary = executionPlan.initialAutomaticTier
    ? {
        selectedModelTier: executionPlan.initialAutomaticTier.tier,
        selectedModelTierReason: executionPlan.initialAutomaticTier.reason,
      }
    : {
        selectedModelTier: null,
        selectedModelTierReason: 'Manual top-model regeneration requested',
      };

  // Check pause status for logging (Issue #9 from code review)
  // Note: If we reached here, course was not paused at job start (checkPauseAndDelay passed)
  const pauseStatusForLogging = await isCoursePaused(courseId);

  const jobLogger = logger.child({
    jobId: job.id,
    lessonId: lessonLabel,
    lessonUuid,
    courseId,
    attempt: job.attemptsMade + 1,
    language,
    style: style ?? 'default',
    selectedModelTier: initialSelectionSummary.selectedModelTier,
    selectedModelTierReason: initialSelectionSummary.selectedModelTierReason,
    executionPolicy: job.data.executionPolicy?.mode ?? 'automatic_ladder',
    executionContext,
    isPaused: pauseStatusForLogging,
  });

  jobLogger.info(
    {
      lessonTitle: lessonSpec.title,
      sectionsCount: lessonSpec.sections.length,
      ragChunksCount: ragChunks.length,
      isPaused: pauseStatusForLogging,
    },
    'Processing Stage 6 job'
  );

  await logTrace({
    courseId,
    lessonId: lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'init',
    stepName: 'start',
    inputData: {
      lessonLabel,
      lessonTitle: lessonSpec.title,
      ragChunksCount: ragChunks.length,
      ragContextId,
      qualityRecoveryMode: executionPlan.qualityRecovery.mode,
      initialAutomaticRung: executionPlan.initialAutomaticRung,
      executionContext,
      selectedModelTier: initialSelectionSummary.selectedModelTier,
      selectedModelTierReason: initialSelectionSummary.selectedModelTierReason,
      selectedModelPhase: executionPlan.initialAutomaticRung ?? 'stage_6_manual_regeneration',
      isPaused: pauseStatusForLogging,
    },
    durationMs: 0,
  });

  const runCompletionCheck = () => {
    // Skip for partialGenerate jobs — frontend tracks completion independently.
    if (job.data.skipCompletionCheck) {
      jobLogger.debug('Skipping completion check (partialGenerate job)');
      return;
    }

    checkAndSetStage6Complete(courseId).catch(err => {
      jobLogger.warn(
        { courseId, error: err instanceof Error ? err.message : String(err) },
        'Non-blocking: Failed to check Stage 6 completion'
      );
    });
  };

  let lastResolvedModelSelection: {
    model: string | null;
    fallback: string | null;
    tier: Stage6ModelTierName | null;
    reason: string | null;
    phaseName: Stage6QualityRungPhaseName | null;
    source: string | null;
  } = {
    model: null,
    fallback: null,
    tier: initialSelectionSummary.selectedModelTier,
    reason: initialSelectionSummary.selectedModelTierReason,
    phaseName: executionPlan.initialAutomaticRung ?? 'stage_6_manual_regeneration',
    source: null,
  };

  await updateJobProgress(job, {
    lessonId: lessonSpec.lesson_id,
    phase: 'planner',
    progress: 0,
    message: 'Starting lesson generation',
  });

  try {
    const plannedRungs = planStage6QualityRecoveryAttempts(
      executionPlan.qualityRecovery.mode === 'manual'
        ? { manualTriggered: true }
        : { initialAutomaticRung: executionPlan.initialAutomaticRung! }
    );

    let result: Stage6Output | null = null;
    let lastReviewResult: Stage6Output | null = null;

    outer: for (const rung of plannedRungs) {
      const totalRungAttempts = rung.max_regeneration_retries + 1;

      for (let rungAttemptIndex = 0; rungAttemptIndex < totalRungAttempts; rungAttemptIndex++) {
        const rungModelConfig = await resolveRungModelConfig(rung.phase_name, courseId, language);
        const selectedModelTier = mapRungToLegacyTier(rung.phase_name);
        const selectedModelTierReason = createSelectedModelTierReason(
          rung.phase_name,
          rungAttemptIndex,
          rung.promoted_from_phase_name,
          executionPlan.initialAutomaticTier?.reason ?? null,
          rungModelConfig.source
        );

        lastResolvedModelSelection = {
          model: rungModelConfig.primary,
          fallback: rungModelConfig.fallback,
          tier: selectedModelTier,
          reason: selectedModelTierReason,
          phaseName: rung.phase_name,
          source: rungModelConfig.source,
        };

        jobLogger.info(
          {
            rungPhaseName: rung.phase_name,
            rungAttemptIndex,
            totalRungAttempts,
            primaryModel: rungModelConfig.primary,
            fallbackModel: rungModelConfig.fallback,
            selectedModelTier,
            selectedModelTierReason,
          },
          'Executing Stage 6 quality rung'
        );

        try {
          const rungResult = await processWithFallback(
            job,
            {
              primary: rungModelConfig.primary,
              fallback: rungModelConfig.fallback,
            },
            lessonUuid,
            ragChunks,
            ragContextId,
            {
              selectedModel: rungModelConfig.primary,
              fallbackModel: rungModelConfig.fallback,
              selectedModelTier,
              selectedModelTierReason,
              selectedModelPhase: rung.phase_name,
              selectedModelSource: rungModelConfig.source,
              maxTokensOverride: rungModelConfig.maxTokens,
            }
          );

          const needsQualityPromotion = rungResult.reviewInfo?.needsReview === true;

          appendQualityRecoveryAttempt(executionPlan.qualityRecovery, {
            sequence_index: rung.sequence_index,
            phase_name: rung.phase_name,
            mode: rung.mode,
            is_initial_rung: rung.is_initial_rung,
            promoted_from_phase_name: rung.promoted_from_phase_name,
            max_regeneration_retries: rung.max_regeneration_retries,
            manual_triggered: rung.manual_triggered,
            rung_attempt_index: rungAttemptIndex,
            outcome: needsQualityPromotion ? 'quality_retryable' : 'accepted',
            selected_model: rungModelConfig.primary,
            fallback_model: rungModelConfig.fallback,
            selected_model_phase: rung.phase_name,
            selected_model_source: rungModelConfig.source,
            model_used: rungResult.metrics.modelUsed,
            quality_score: rungResult.metrics.qualityScore,
            errors: [...rungResult.errors],
            review_reasons: rungResult.reviewInfo?.reasons,
          });

          rungResult.metrics.selectedModel =
            rungResult.metrics.selectedModel ?? rungModelConfig.primary;
          rungResult.metrics.fallbackModel =
            rungResult.metrics.fallbackModel ?? rungModelConfig.fallback;
          rungResult.metrics.selectedModelTier =
            rungResult.metrics.selectedModelTier ?? selectedModelTier;
          rungResult.metrics.selectedModelTierReason =
            rungResult.metrics.selectedModelTierReason ?? selectedModelTierReason;
          rungResult.metrics.selectedModelPhase =
            rungResult.metrics.selectedModelPhase ?? rung.phase_name;
          rungResult.metrics.selectedModelSource =
            rungResult.metrics.selectedModelSource ?? rungModelConfig.source;
          rungResult.metrics.attemptLadder = [...executionPlan.qualityRecovery.attempts];

          if (!needsQualityPromotion) {
            result = {
              ...rungResult,
              qualityRecovery: executionPlan.qualityRecovery,
            };
            break outer;
          }

          lastReviewResult = rungResult;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          appendQualityRecoveryAttempt(executionPlan.qualityRecovery, {
            sequence_index: rung.sequence_index,
            phase_name: rung.phase_name,
            mode: rung.mode,
            is_initial_rung: rung.is_initial_rung,
            promoted_from_phase_name: rung.promoted_from_phase_name,
            max_regeneration_retries: rung.max_regeneration_retries,
            manual_triggered: rung.manual_triggered,
            rung_attempt_index: rungAttemptIndex,
            outcome: 'failed',
            selected_model: rungModelConfig.primary,
            fallback_model: rungModelConfig.fallback,
            selected_model_phase: rung.phase_name,
            selected_model_source: rungModelConfig.source,
            model_used: null,
            quality_score: 0,
            errors: [errorMessage],
          });

          throw error;
        }
      }
    }

    if (!result) {
      const terminalRung = plannedRungs.at(-1);
      if (!lastReviewResult || !terminalRung) {
        throw new Error('Stage 6 quality ladder ended without a terminal result');
      }

      executionPlan.qualityRecovery.final_disposition =
        classifyStage6QualityRecoveryFinalDisposition({
          exhaustedPhaseName: terminalRung.phase_name,
          mode: executionPlan.qualityRecovery.mode,
        });

      result = {
        ...lastReviewResult,
        qualityRecovery: executionPlan.qualityRecovery,
      };
    }

    const durationMs = Date.now() - startTime;
    const needsReview = result.reviewInfo?.needsReview === true;

    let sanityResult: SanityCheckResult = { ok: true };
    if (result.lessonContent) {
      const markdown = extractContentMarkdown(result.lessonContent, language);
      sanityResult = quickSanityCheck(markdown);

      if (!sanityResult.ok) {
        jobLogger.warn(
          {
            reason: sanityResult.reason,
            metrics: sanityResult.metrics,
            qualityScore: result.metrics.qualityScore,
          },
          'Content failed sanity check (non-blocking warning)'
        );
      } else {
        jobLogger.debug({ metrics: sanityResult.metrics }, 'Content passed sanity check');
      }
    }

    await updateJobProgress(job, {
      lessonId: lessonSpec.lesson_id,
      phase: 'complete',
      progress: 100,
      message: needsReview
        ? 'Generation complete (review required)'
        : result.success
          ? 'Generation complete'
          : 'Generation completed with errors',
      tokensUsed: result.metrics.tokensUsed,
    });

    if (needsReview) {
      if (lessonUuid && result.lessonContent) {
        await handlePartialSuccess(
          job.id ?? 'unknown',
          courseId,
          lessonUuid,
          lessonLabel,
          result,
          language
        );
        runCompletionCheck();
      } else if (lessonUuid) {
        await markForReview(
          courseId,
          lessonUuid,
          lessonLabel,
          result.reviewInfo?.reasons?.join('; ') || 'Review required by generation pipeline',
          {
            modelUsed: result.metrics.modelUsed,
            selectedModel: result.metrics.selectedModel,
            fallbackModel: result.metrics.fallbackModel,
            selectedModelTier: result.metrics.selectedModelTier,
            selectedModelTierReason: result.metrics.selectedModelTierReason,
            selectedModelPhase: result.metrics.selectedModelPhase,
            selectedModelSource: result.metrics.selectedModelSource,
            regenerateCount: result.metrics.regenerateCount,
            truncationCount: result.metrics.truncationCount,
            rejectedTokens: result.metrics.rejectedTokens,
            regenerationMode: result.metrics.regenerationMode ?? null,
            reviewInfo: result.reviewInfo,
            qaSignals: result.lessonContent?.metadata.qa_signals ?? null,
            qualityRecovery: result.qualityRecovery,
          }
        );
        runCompletionCheck();
      } else {
        jobLogger.warn(
          { lessonLabel },
          'Cannot save review_required marker - lessonUuid not resolved'
        );
      }
    } else if (result.lessonContent && result.errors.length > 0) {
      if (lessonUuid) {
        await handlePartialSuccess(
          job.id ?? 'unknown',
          courseId,
          lessonUuid,
          lessonLabel,
          result,
          language
        );
        runCompletionCheck();
      } else {
        jobLogger.warn({ lessonLabel }, 'Cannot save partial success - lessonUuid not resolved');
      }
    }

    if (!needsReview && result.success && result.lessonContent) {
      await saveLessonContent(courseId, lessonSpec.lesson_id, result, sanityResult, language);

      // Save source documents attribution for traceability
      // @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
      if (lessonUuid && sourceDocuments.length > 0) {
        await saveSourceDocuments(courseId, lessonUuid, sourceDocuments);
      }

      // Check if all lessons reached terminal statuses and update course status.
      runCompletionCheck();
    }

    jobLogger.info(
      {
        success: result.success,
        durationMs,
        tokensUsed: result.metrics.tokensUsed,
        qualityScore: result.metrics.qualityScore,
        modelUsed: result.metrics.modelUsed,
        selectedModel: result.metrics.selectedModel,
        fallbackModel: result.metrics.fallbackModel,
        selectedModelTier: result.metrics.selectedModelTier,
        selectedModelPhase: result.metrics.selectedModelPhase,
        selectedModelSource: result.metrics.selectedModelSource,
        regenerateCount: result.metrics.regenerateCount,
        truncationCount: result.metrics.truncationCount,
        rejectedTokens: result.metrics.rejectedTokens,
        reviewRequired: needsReview,
        hasPartialContent:
          result.lessonContent !== null && (result.errors.length > 0 || needsReview),
      },
      'Stage 6 job processed'
    );

    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'complete',
      stepName: 'finish',
      inputData: { lessonLabel },
      outputData: {
        qualityScore: result.metrics.qualityScore,
        modelUsed: result.metrics.modelUsed,
        selectedModel: result.metrics.selectedModel,
        fallbackModel: result.metrics.fallbackModel,
        selectedModelTier: result.metrics.selectedModelTier,
        selectedModelTierReason: result.metrics.selectedModelTierReason,
        selectedModelPhase: result.metrics.selectedModelPhase,
        selectedModelSource: result.metrics.selectedModelSource,
        attemptLadder: result.metrics.attemptLadder,
        qualityRecovery: result.qualityRecovery,
        reviewRequired: needsReview,
        tokensUsed: result.metrics.tokensUsed,
        regenerateCount: result.metrics.regenerateCount,
        truncationCount: result.metrics.truncationCount,
        rejectedTokens: result.metrics.rejectedTokens,
      },
      modelUsed: result.metrics.modelUsed,
      durationMs,
    });

    return {
      lessonId: lessonSpec.lesson_id,
      success: result.success,
      lessonContent: result.lessonContent,
      errors: result.errors,
      qualityRecovery: result.qualityRecovery,
      metrics: {
        ...result.metrics,
        durationMs,
        selectedModelPhase:
          result.metrics.selectedModelPhase ?? lastResolvedModelSelection.phaseName,
        selectedModelSource:
          result.metrics.selectedModelSource ?? lastResolvedModelSelection.source,
        attemptLadder: result.metrics.attemptLadder ?? executionPlan.qualityRecovery.attempts,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    jobLogger.error(
      {
        error: errorMsg,
        durationMs,
        primaryModel: lastResolvedModelSelection.model,
        fallbackModel: lastResolvedModelSelection.fallback,
        selectedModelPhase: lastResolvedModelSelection.phaseName,
        selectedModelSource: lastResolvedModelSelection.source,
        qualityRecovery: executionPlan.qualityRecovery,
      },
      'Stage 6 job failed after all retry attempts'
    );

    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'complete',
      stepName: 'failed',
      inputData: {
        lessonLabel,
        selectedModel: lastResolvedModelSelection.model,
        fallbackModel: lastResolvedModelSelection.fallback,
        selectedModelPhase: lastResolvedModelSelection.phaseName,
        selectedModelSource: lastResolvedModelSelection.source,
      },
      errorData: {
        error: errorMsg,
        attemptLadder: executionPlan.qualityRecovery.attempts,
      },
      durationMs,
    });

    if (lessonUuid) {
      await markForReview(
        courseId,
        lessonUuid,
        lessonLabel,
        `Generation failed after model fallback: ${errorMsg}`,
        {
          modelUsed: null,
          selectedModel: lastResolvedModelSelection.model,
          fallbackModel: lastResolvedModelSelection.fallback,
          selectedModelTier: lastResolvedModelSelection.tier,
          selectedModelTierReason: lastResolvedModelSelection.reason,
          selectedModelPhase: lastResolvedModelSelection.phaseName,
          selectedModelSource: lastResolvedModelSelection.source,
          regenerateCount: 0,
          truncationCount: 0,
          rejectedTokens: 0,
          regenerationMode: null,
          qualityRecovery: executionPlan.qualityRecovery,
        }
      );
      runCompletionCheck();
    } else {
      jobLogger.warn({ lessonLabel, errorMsg }, 'Cannot mark for review - lessonUuid not resolved');
    }

    await updateJobProgress(job, {
      lessonId: lessonSpec.lesson_id,
      phase: 'planner',
      progress: 0,
      message: `Generation failed: ${errorMsg}`,
    });

    return {
      lessonId: lessonSpec.lesson_id,
      success: false,
      lessonContent: null,
      errors: [errorMsg],
      qualityRecovery: executionPlan.qualityRecovery,
      metrics: buildZeroMetrics(
        {
          model: lastResolvedModelSelection.model,
          fallback: lastResolvedModelSelection.fallback,
          tier: lastResolvedModelSelection.tier,
          reason: lastResolvedModelSelection.reason,
          phaseName: lastResolvedModelSelection.phaseName,
          source: lastResolvedModelSelection.source,
        },
        durationMs
      ),
    };
  }
}
