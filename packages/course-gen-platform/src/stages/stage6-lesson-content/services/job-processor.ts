import { Job, UnrecoverableError } from 'bullmq';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { resolveLessonUuid } from '@/shared/database/lesson-resolver';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { checkPauseAndDelay, isCoursePaused } from '@/shared/pause-check';
import { RequiredRagUnavailableError } from '@/shared/rag/document-availability';
import { Stage6EvidenceScopeError } from '@/stages/stage6-lesson-content/rag/evidence-context';
import type { Stage6Output } from '../orchestrator';
import {
  retrieveLessonContext,
  extractSourceDocuments,
  type LessonRAGResult,
  type SourceDocument,
} from '../utils/lesson-rag-retriever';
import { quickSanityCheck, type SanityCheckResult } from '../utils/sanity-check';
import { createLessonLabel, LessonLabel, validateLanguageCode } from '@megacampus/shared-types';
import type { Stage6QualityRungPhaseName } from '@megacampus/shared-types/stage6-quality-recovery';

import { Stage6JobInput, Stage6JobResult, Stage6ModelTierName } from '../types';
import {
  classifyStage6QualityRecoveryFinalDisposition,
  planStage6QualityRecoveryAttempts,
} from '../execution/quality-ladder';
import {
  handlePartialSuccess,
  failStage6Course,
  isStage6CourseActive,
  markForReview,
  saveLessonContent,
  saveSourceDocuments,
  checkAndSetStage6Complete,
  type ReviewMarkerContext,
} from './database-service';
import type { LessonUUID } from '@megacampus/shared-types';
import { extractContentMarkdown } from './content-utils';
import { loadStage6EvidenceForCourse } from '../rag/evidence-loader';

// One attempt at one model lives next door; this file is about which model to try next and what
// to do with the result. `updateJobProgress` and `processWithFallback` are re-exported so that
// every existing import path keeps working.
import {
  createStage6RagFailureResult,
  processWithFallback,
  updateJobProgress,
  type RAGChunk,
} from './model-fallback';

export { processWithFallback, updateJobProgress } from './model-fallback';
export type { RAGChunk } from './model-fallback';

export async function enrichSummaryPreviewFromDB(
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
// Which rung, which model, and the ladder's own history live next door.
import {
  appendQualityRecoveryAttempt,
  buildZeroMetrics,
  createSelectedModelTierReason,
  mapRungToLegacyTier,
  resolveRungModelConfig,
  resolveStage6ExecutionPlan,
  type ResolvedStage6ExecutionPlan,
} from './quality-ladder-plan';

/**
 * Process a single Stage 6 job
 * @param job - The BullMQ job to process
 * @param token - Job token for lock management (required for pause/delay, validated at runtime)
 */
/** The model choice the ladder last made, which the failure path needs in order to report it. */
interface ResolvedModelSelection {
  model: string | null;
  fallback: string | null;
  tier: Stage6ModelTierName | null;
  reason: string | null;
  phaseName: Stage6QualityRungPhaseName | null;
  source: string | null;
}

/** Everything the phases below share. Assembled once, after the input has been validated. */
interface Stage6JobContext {
  job: Job<Stage6JobInput, Stage6JobResult>;
  courseId: string;
  language: string;
  lessonSpec: NonNullable<Stage6JobInput['lessonSpec']>;
  lessonLabel: LessonLabel;
  lessonUuid: LessonUUID | null;
  /** `logger.child(...)`, whose pino generic differs from the root logger's. */
  jobLogger: typeof logger;
  executionPlan: ResolvedStage6ExecutionPlan;
  ragChunks: RAGChunk[];
  ragContextId: string | null;
  sourceDocuments: SourceDocument[];
  startTime: number;
  runCompletionCheck: () => void;
}

/**
 * Retrieve the lesson's RAG context, or decide the job cannot proceed.
 *
 * Three outcomes, and the difference between them matters: missing documents are FINE and the
 * lesson is written without them; a retrieval error is survivable and logged; but an evidence
 * scope violation — a tenant, version or source-ref the run was never allowed to read — fails
 * the whole COURSE closed, because continuing would write a lesson from someone else's document.
 */
async function loadRagContextForJob(
  job: Job<Stage6JobInput, Stage6JobResult>,
  lessonSpec: NonNullable<Stage6JobInput['lessonSpec']>,
  courseId: string,
  startTime: number
): Promise<
  | {
      ok: true;
      ragChunks: RAGChunk[];
      ragContextId: string | null;
      sourceDocuments: SourceDocument[];
    }
  | { ok: false; result: Stage6JobResult }
> {
  let stage6Evidence: Awaited<ReturnType<typeof loadStage6EvidenceForCourse>>;
  try {
    stage6Evidence = await loadStage6EvidenceForCourse({
      courseId,
      requestedOrganizationId: job.data.organizationId,
      providedAnalysisResult: job.data.analysisResult,
    });
  } catch (error) {
    if (!(error instanceof Stage6EvidenceScopeError)) throw error;
    await failStage6Course(courseId, error.message);
    return {
      ok: false,
      result: createStage6RagFailureResult(lessonSpec.lesson_id, startTime, error.message),
    };
  }

  try {
    const ragResult: LessonRAGResult = await retrieveLessonContext({
      courseId,
      organizationId: stage6Evidence.organizationId,
      lessonSpec,
      evidenceContext: stage6Evidence.evidenceContext,
      // Priority boost is enabled by default in retrieveLessonContext
    });

    // Extract source document attribution for traceability
    // @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
    const sourceDocuments = extractSourceDocuments(ragResult.chunks);

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        courseId,
        chunksCount: ragResult.chunks.length,
        cached: ragResult.cached,
        coverageScore: ragResult.coverageScore,
        retrievalDurationMs: ragResult.retrievalDurationMs,
        sourceDocumentsCount: sourceDocuments.length,
        coreDocsUsed: sourceDocuments.filter(document => document.document_priority === 'CORE')
          .length,
      },
      'RAG context retrieved for lesson'
    );

    return {
      ok: true,
      ragChunks: ragResult.chunks,
      ragContextId: ragResult.lessonId,
      sourceDocuments,
    };
  } catch (error) {
    // Availability may be optional for courses without documents, but an evidence
    // tenant/version/ref violation is never optional and must fail closed.
    if (error instanceof RequiredRagUnavailableError || error instanceof Stage6EvidenceScopeError) {
      await failStage6Course(courseId, error.message);
      return {
        ok: false,
        result: createStage6RagFailureResult(lessonSpec.lesson_id, startTime, error.message),
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
    return { ok: true, ragChunks: [], ragContextId: null, sourceDocuments: [] };
  }
}

/**
 * Walk the quality ladder until a rung produces content that does not need review.
 *
 * Two nested loops, and they mean different things: the OUTER one climbs to a stronger rung,
 * the INNER one retries the same rung with the same model. Every attempt is appended to
 * `qualityRecovery` whether it succeeded, was judged retryable, or threw — that history is what
 * `attemptLadder` reports and what makes a ladder run auditable after the fact.
 *
 * `selection` is written on every attempt so the failure path can say which model was in play
 * when the job died.
 */
async function runQualityLadder(
  context: Stage6JobContext,
  selection: ResolvedModelSelection
): Promise<Stage6Output> {
  const { job, courseId, language, lessonUuid, jobLogger, executionPlan, ragChunks, ragContextId } =
    context;

  const plannedRungs = planStage6QualityRecoveryAttempts(
    executionPlan.qualityRecovery.mode === 'manual'
      ? { manualTriggered: true }
      : { initialAutomaticRung: executionPlan.initialAutomaticRung! }
  );

  let lastReviewResult: Stage6Output | null = null;
  let pendingPrefetchedResponse = job.data.prefetchedGeneratorResponse ?? null;

  for (const rung of plannedRungs) {
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

      selection.model = rungModelConfig.primary;
      selection.fallback = rungModelConfig.fallback;
      selection.tier = selectedModelTier;
      selection.reason = selectedModelTierReason;
      selection.phaseName = rung.phase_name;
      selection.source = rungModelConfig.source;

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

      const attemptRecord = {
        sequence_index: rung.sequence_index,
        phase_name: rung.phase_name,
        mode: rung.mode,
        is_initial_rung: rung.is_initial_rung,
        promoted_from_phase_name: rung.promoted_from_phase_name,
        max_regeneration_retries: rung.max_regeneration_retries,
        manual_triggered: rung.manual_triggered,
        rung_attempt_index: rungAttemptIndex,
        selected_model: rungModelConfig.primary,
        fallback_model: rungModelConfig.fallback,
        selected_model_phase: rung.phase_name,
        selected_model_source: rungModelConfig.source,
      };

      try {
        const prefetchedResponseForRung = pendingPrefetchedResponse;
        pendingPrefetchedResponse = null;
        const rungResult = await processWithFallback(
          job,
          { primary: rungModelConfig.primary, fallback: rungModelConfig.fallback },
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
          },
          prefetchedResponseForRung
        );

        const needsQualityPromotion = rungResult.reviewInfo?.needsReview === true;

        appendQualityRecoveryAttempt(executionPlan.qualityRecovery, {
          ...attemptRecord,
          outcome: needsQualityPromotion ? 'quality_retryable' : 'accepted',
          model_used: rungResult.metrics.modelUsed,
          quality_score: rungResult.metrics.qualityScore,
          errors: [...rungResult.errors],
          review_reasons: rungResult.reviewInfo?.reasons,
        });

        // The rung knows which model it used; the orchestrator below it may not have said.
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
          return { ...rungResult, qualityRecovery: executionPlan.qualityRecovery };
        }

        lastReviewResult = rungResult;
      } catch (error) {
        appendQualityRecoveryAttempt(executionPlan.qualityRecovery, {
          ...attemptRecord,
          outcome: 'failed',
          model_used: null,
          quality_score: 0,
          errors: [error instanceof Error ? error.message : String(error)],
        });

        throw error;
      }
    }
  }

  // Every rung was climbed and every one wanted review. The last one's content is what ships,
  // labelled with the disposition the terminal rung earned.
  const terminalRung = plannedRungs.at(-1);
  if (!lastReviewResult || !terminalRung) {
    throw new Error('Stage 6 quality ladder ended without a terminal result');
  }

  executionPlan.qualityRecovery.final_disposition = classifyStage6QualityRecoveryFinalDisposition({
    exhaustedPhaseName: terminalRung.phase_name,
    mode: executionPlan.qualityRecovery.mode,
  });

  return { ...lastReviewResult, qualityRecovery: executionPlan.qualityRecovery };
}

/**
 * The review marker's payload: what was generated, by which model, and how it scored.
 *
 * Written out four times before this, once per branch that can mark a lesson for review, which
 * is how a field gets added to three of them.
 */
function buildReviewMarkerContext(
  result: Stage6Output,
  reviewInfo: Stage6Output['reviewInfo'],
  sanityCheck?: SanityCheckResult
): ReviewMarkerContext {
  return {
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
    reviewInfo,
    factualWarnings: result.factualWarnings,
    qaSignals: result.lessonContent?.metadata?.qa_signals ?? null,
    qualityRecovery: result.qualityRecovery,
    ...(sanityCheck && { sanityCheck }),
  };
}

/**
 * Does the generated markdown survive a look at it?
 *
 * A lesson can pass the judge and still be unusable — truncated, empty, all headings. This is
 * the last gate before it is saved as finished, and failing it sends the lesson to review with
 * the specific reason at the FRONT of the list, ahead of anything the pipeline already said.
 */
function evaluateSanity(
  result: Stage6Output,
  language: string,
  jobLogger: Stage6JobContext['jobLogger']
): { sanityResult: SanityCheckResult; sanityReviewReason: string | null } {
  if (!result.lessonContent) return { sanityResult: { ok: true }, sanityReviewReason: null };

  const markdown = extractContentMarkdown(result.lessonContent, language);
  const sanityResult = quickSanityCheck(markdown);

  if (sanityResult.ok) {
    jobLogger.debug({ metrics: sanityResult.metrics }, 'Content passed sanity check');
    return { sanityResult, sanityReviewReason: null };
  }

  const sanityReviewReason = `Stage 6 sanity check failed: ${sanityResult.reason ?? 'unknown'}`;
  jobLogger.warn(
    {
      reason: sanityResult.reason,
      metrics: sanityResult.metrics,
      qualityScore: result.metrics.qualityScore,
    },
    'Content failed sanity check; marking lesson for review'
  );
  return { sanityResult, sanityReviewReason };
}

/**
 * Write the outcome down: as a finished lesson, as a partial success, or as review-required.
 *
 * Every branch that persists anything also triggers the course-completion check, because a
 * course is finished when every lesson reaches a TERMINAL state and review_required is one.
 * Missing that call on any branch leaves a course stuck in `stage_6_generating` forever.
 */
async function persistLessonOutcome(
  context: Stage6JobContext,
  result: Stage6Output,
  outcome: {
    effectiveNeedsReview: boolean;
    sanityNeedsReview: boolean;
    sanityReviewReason: string | null;
    sanityResult: SanityCheckResult;
    effectiveReviewInfo: Stage6Output['reviewInfo'];
  }
): Promise<void> {
  const {
    job,
    courseId,
    language,
    lessonSpec,
    lessonLabel,
    lessonUuid,
    jobLogger,
    sourceDocuments,
    runCompletionCheck,
  } = context;
  const {
    effectiveNeedsReview,
    sanityNeedsReview,
    sanityReviewReason,
    sanityResult,
    effectiveReviewInfo,
  } = outcome;

  if (effectiveNeedsReview) {
    if (sanityNeedsReview && lessonUuid) {
      await markForReview(
        courseId,
        lessonUuid,
        lessonLabel,
        sanityReviewReason!,
        buildReviewMarkerContext(result, effectiveReviewInfo, sanityResult)
      );
      runCompletionCheck();
    } else if (lessonUuid && result.lessonContent) {
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
        buildReviewMarkerContext(
          result,
          effectiveReviewInfo,
          sanityNeedsReview ? sanityResult : undefined
        )
      );
      runCompletionCheck();
    } else {
      jobLogger.warn(
        { lessonLabel },
        'Cannot save review_required marker - lessonUuid not resolved'
      );
    }

    if (lessonUuid && sourceDocuments.length > 0) {
      await saveSourceDocuments(courseId, lessonUuid, sourceDocuments);
    }
    return;
  }

  if (result.lessonContent && result.errors.length > 0) {
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

  if (result.success && result.lessonContent) {
    await saveLessonContent(courseId, lessonSpec.lesson_id, result, sanityResult, language);

    // Save source documents attribution for traceability
    // @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
    if (lessonUuid && sourceDocuments.length > 0) {
      await saveSourceDocuments(courseId, lessonUuid, sourceDocuments);
    }

    // Check if all lessons reached terminal statuses and update course status.
    runCompletionCheck();
  }
}

/**
 * The job died after everything the ladder had to offer.
 *
 * The lesson is still marked for review rather than left silent, because a course whose lesson
 * simply vanished cannot finish: `checkAndSetStage6Complete` counts TERMINAL lessons, and a
 * lesson with no row at all is not one.
 */
async function handleStage6JobFailure(
  context: Stage6JobContext,
  error: unknown,
  selection: ResolvedModelSelection
): Promise<Stage6JobResult> {
  const {
    job,
    courseId,
    lessonSpec,
    lessonLabel,
    lessonUuid,
    jobLogger,
    executionPlan,
    startTime,
    runCompletionCheck,
  } = context;
  const errorMsg = error instanceof Error ? error.message : String(error);
  const durationMs = Date.now() - startTime;

  jobLogger.error(
    {
      error: errorMsg,
      durationMs,
      primaryModel: selection.model,
      fallbackModel: selection.fallback,
      selectedModelPhase: selection.phaseName,
      selectedModelSource: selection.source,
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
      selectedModel: selection.model,
      fallbackModel: selection.fallback,
      selectedModelPhase: selection.phaseName,
      selectedModelSource: selection.source,
    },
    errorData: { error: errorMsg, attemptLadder: executionPlan.qualityRecovery.attempts },
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
        selectedModel: selection.model,
        fallbackModel: selection.fallback,
        selectedModelTier: selection.tier,
        selectedModelTierReason: selection.reason,
        selectedModelPhase: selection.phaseName,
        selectedModelSource: selection.source,
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
    metrics: buildZeroMetrics(selection, durationMs),
  };
}

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

  if (!lessonSpec?.lesson_id || !Array.isArray(lessonSpec.sections)) {
    const errorMsg = 'Invalid job input: lessonSpec must have lesson_id and sections array';
    logger.error({ jobId: job.id, lessonSpec }, errorMsg);
    return createStage6RagFailureResult(lessonSpec?.lesson_id || 'unknown', startTime, errorMsg);
  }

  const ragContext = await loadRagContextForJob(job, lessonSpec, courseId, startTime);
  if (!ragContext.ok) return ragContext.result;
  const { ragChunks, ragContextId, sourceDocuments } = ragContext;

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
    return createStage6RagFailureResult(
      lessonSpec.lesson_id,
      startTime,
      'Invalid lesson_id format: ' + errorMsg
    );
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

  const context: Stage6JobContext = {
    job,
    courseId,
    language,
    lessonSpec,
    lessonLabel,
    lessonUuid,
    jobLogger,
    executionPlan,
    ragChunks,
    ragContextId,
    sourceDocuments,
    startTime,
    runCompletionCheck: () => {
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
    },
  };

  const selection: ResolvedModelSelection = {
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
    const result = await runQualityLadder(context, selection);
    const durationMs = Date.now() - startTime;

    const { sanityResult, sanityReviewReason } = evaluateSanity(result, language, jobLogger);
    const sanityNeedsReview = Boolean(result.lessonContent && sanityReviewReason);
    const needsReview = result.reviewInfo?.needsReview === true;
    const effectiveNeedsReview = needsReview || sanityNeedsReview;
    const effectiveReviewInfo = sanityNeedsReview
      ? {
          needsReview: true as const,
          reasons: [
            sanityReviewReason!,
            ...(result.reviewInfo?.reasons?.filter(reason => reason !== sanityReviewReason) ?? []),
          ],
        }
      : result.reviewInfo;

    let completionMessage: string;
    if (effectiveNeedsReview) {
      completionMessage = 'Generation complete (review required)';
    } else if (result.success) {
      completionMessage = 'Generation complete';
    } else {
      completionMessage = 'Generation completed with errors';
    }

    await updateJobProgress(job, {
      lessonId: lessonSpec.lesson_id,
      phase: 'complete',
      progress: 100,
      message: completionMessage,
      tokensUsed: result.metrics.tokensUsed,
    });

    await persistLessonOutcome(context, result, {
      effectiveNeedsReview,
      sanityNeedsReview,
      sanityReviewReason,
      sanityResult,
      effectiveReviewInfo,
    });

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
        reviewRequired: effectiveNeedsReview,
        hasPartialContent:
          result.lessonContent !== null && (result.errors.length > 0 || effectiveNeedsReview),
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
        selectedModelPhase: result.metrics.selectedModelPhase ?? selection.phaseName,
        selectedModelSource: result.metrics.selectedModelSource ?? selection.source,
        attemptLadder: result.metrics.attemptLadder ?? executionPlan.qualityRecovery.attempts,
      },
    };
  } catch (error) {
    return handleStage6JobFailure(context, error, selection);
  }
}
