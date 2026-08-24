import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';
import { resolveLessonUuid } from '@/shared/database/lesson-resolver';
import { notifyCourseError } from '@/shared/notifications/course-notifications';
import type { Stage6Output } from '../orchestrator';
import { extractContentMarkdown } from './content-utils';
import { sanitizeContent } from '../judge/strip-metadata';
import { cacheLessonMarkdown } from '../../../shared/cache/file-content-cache';
import type { SanityCheckResult } from '../utils/sanity-check';
import { LessonUUID, LessonLabel, Json } from '@megacampus/shared-types';
import type { SelfReviewResult } from '@megacampus/shared-types/judge-types';
import type { LessonQualitySignals } from '@megacampus/shared-types/lesson-content';
import { isStage6QualityAlertsEnabled } from '../quality/flags';
import type { Stage6ExecutionContext, Stage6QualityRecoveryHistory } from '../types';
import { STAGE6_REMEDIATION_CONTEXTS } from '../types';
import type { CourseAuditFinding } from '../quality/course-audit';

// The row accessors and the course-completion check moved to siblings; re-exported so that
// `checkAndSetStage6Complete` keeps the import path every caller already uses.
export { checkAndSetStage6Complete } from './stage6-completion';

const STAGE6_PRIMARY_ACTIVE_STATUS = 'stage_6_generating';
const STAGE6_REMEDIATION_ALLOWED_STATUSES = new Set(['stage_6_complete', 'completed']);

function getQaSignalsFromResult(result: Stage6Output): LessonQualitySignals | undefined {
  return result.lessonContent?.metadata?.qa_signals ?? undefined;
}

function buildMetadataMetricAliases(
  metrics: Pick<Stage6Output['metrics'], 'tokensUsed' | 'durationMs' | 'qualityScore'>,
  qaSignals?: LessonQualitySignals
): Record<string, unknown> {
  return {
    total_tokens: metrics.tokensUsed,
    generation_duration_ms: metrics.durationMs,
    quality_score: metrics.qualityScore,
    qa_signals: qaSignals,
  };
}

function isCourseStatusExecutableForStage6(
  generationStatus: string | null | undefined,
  executionContext: Stage6ExecutionContext
): boolean {
  if (generationStatus === STAGE6_PRIMARY_ACTIVE_STATUS) {
    return true;
  }

  return (
    generationStatus !== null &&
    generationStatus !== undefined &&
    STAGE6_REMEDIATION_CONTEXTS.has(executionContext) &&
    STAGE6_REMEDIATION_ALLOWED_STATUSES.has(generationStatus)
  );
}

export async function isStage6CourseActive(
  courseId: string,
  executionContext: Stage6ExecutionContext = 'full_generation'
): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: course, error } = await supabaseAdmin
      .from('courses')
      .select('generation_status')
      .eq('id', courseId)
      .single();

    if (error || !course) {
      logger.warn(
        {
          courseId,
          executionContext,
          error: error?.message,
        },
        'Failed to fetch course generation_status for Stage 6 activity check'
      );
      return false;
    }

    return isCourseStatusExecutableForStage6(course.generation_status, executionContext);
  } catch (error) {
    logger.error(
      {
        courseId,
        executionContext,
        error: error instanceof Error ? error.message : String(error),
      },
      'Exception while checking whether Stage 6 course is active'
    );
    return false;
  }
}

export async function failStage6Course(courseId: string, reason: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const failedAt = new Date().toISOString();

  try {
    const { error } = await supabaseAdmin
      .from('courses')
      .update({
        generation_status: 'failed',
        failed_at_stage: 6,
        generation_metadata: {
          failed_at: failedAt,
          failed_phase: 'stage_6',
          error_message: reason,
        } as Json,
        updated_at: failedAt,
      })
      .eq('id', courseId);

    if (error) {
      logger.warn(
        {
          courseId,
          reason,
          error: error.message,
        },
        'Failed to mark Stage 6 course as failed'
      );
      return;
    }

    try {
      await notifyCourseError(courseId, 6, reason);
    } catch (notifyError) {
      logger.warn(
        {
          courseId,
          reason,
          error: notifyError instanceof Error ? notifyError.message : String(notifyError),
        },
        'Failed to send Stage 6 course failure notification'
      );
    }
  } catch (error) {
    logger.error(
      {
        courseId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      },
      'Exception while marking Stage 6 course as failed'
    );
  }
}

/**
 * Handle partial success scenarios
 */
export async function handlePartialSuccess(
  jobId: string,
  courseId: string,
  lessonUuid: LessonUUID,
  lessonLabel: LessonLabel,
  result: Stage6Output,
  language: string = 'en'
): Promise<void> {
  const isReviewRequired = result.reviewInfo?.needsReview === true;
  if (!result.lessonContent) return;
  if (!isReviewRequired && result.errors.length === 0) return;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Save partial content to lesson_contents table (not lessons table)
    // Serialize content to convert Date objects to strings (LessonContent has Date fields)
    const rawMarkdown = extractContentMarkdown(result.lessonContent, language);
    const markdown = sanitizeContent(rawMarkdown, { component: 'handlePartialSuccess' });
    const qaSignals = getQaSignalsFromResult(result);
    const { error } = await supabaseAdmin.from('lesson_contents').insert({
      lesson_id: lessonUuid,
      course_id: courseId,
      content: JSON.parse(JSON.stringify(result.lessonContent)) as Json,
      status: 'review_required', // Mark as partial success requiring review
      metadata: JSON.parse(
        JSON.stringify({
          markdownContent: markdown,
          partial: true,
          errors: result.errors,
          modelUsed: result.metrics.modelUsed,
          selectedModel: result.metrics.selectedModel,
          fallbackModel: result.metrics.fallbackModel,
          selectedModelTier: result.metrics.selectedModelTier,
          selectedModelTierReason: result.metrics.selectedModelTierReason,
          selectedModelPhase: result.metrics.selectedModelPhase ?? null,
          selectedModelSource: result.metrics.selectedModelSource ?? null,
          qualityScore: result.metrics.qualityScore,
          ...buildMetadataMetricAliases(result.metrics, qaSignals),
          regenerateCount: result.metrics.regenerateCount,
          truncationCount: result.metrics.truncationCount,
          rejectedTokens: result.metrics.rejectedTokens,
          regenerationMode: result.metrics.regenerationMode ?? null,
          qaSignals,
          reviewInfo: result.reviewInfo ?? undefined,
          factualWarnings: result.factualWarnings ?? undefined,
          reviewReasons: result.reviewInfo?.reasons ?? undefined,
          terminalReason: result.reviewInfo?.reasons?.[0] ?? undefined,
          qualityRecovery: result.qualityRecovery ?? undefined,
          qualityRecoveryDisposition: result.qualityRecovery?.final_disposition ?? undefined,
        })
      ) as Json,
      generation_attempt: (result.metrics.regenerateCount ?? 0) + 1,
    });

    if (error) {
      logger.warn(
        {
          jobId,
          courseId,
          lessonUuid,
          lessonLabel,
          error: error.message,
        },
        'Failed to save partial content to lesson_contents table'
      );
    } else {
      logger.warn(
        {
          jobId,
          courseId,
          lessonUuid,
          lessonLabel,
          sectionsCount: result.lessonContent.content.sections.length,
          errorsCount: result.errors.length,
          errors: result.errors,
          qualityScore: result.metrics.qualityScore,
        },
        'Partial success - content saved to lesson_contents for review'
      );
    }
  } catch (error) {
    logger.error(
      {
        jobId,
        courseId,
        lessonUuid,
        lessonLabel,
        error: error instanceof Error ? error.message : String(error),
      },
      'Exception while handling partial success'
    );
  }
}

/**
 * Mark lesson for manual review
 */
export interface ReviewMarkerContext {
  modelUsed?: string | null;
  selectedModel?: string | null;
  fallbackModel?: string | null;
  selectedModelTier?: string | null;
  selectedModelTierReason?: string | null;
  selectedModelPhase?: string | null;
  selectedModelSource?: string | null;
  regenerateCount?: number | null;
  truncationCount?: number | null;
  rejectedTokens?: number | null;
  regenerationMode?: string | null;
  reviewInfo?: Stage6Output['reviewInfo'];
  factualWarnings?: Stage6Output['factualWarnings'];
  qaSignals?: LessonQualitySignals | null;
  qualityRecovery?: Stage6QualityRecoveryHistory;
  sanityCheck?: SanityCheckResult;
  courseAuditFindings?: Array<Pick<CourseAuditFinding, 'kind' | 'detail'>>;
  suppressAlert?: boolean;
}

export async function markForReview(
  courseId: string,
  lessonUuid: LessonUUID,
  lessonLabel: LessonLabel,
  reason: string,
  context: ReviewMarkerContext = {}
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const markedAt = new Date().toISOString();

  try {
    const { error: lessonUpdateError } = await supabaseAdmin
      .from('lessons')
      .update({
        updated_at: markedAt,
      })
      .eq('id', lessonUuid);

    if (lessonUpdateError) {
      logger.warn(
        {
          courseId,
          lessonUuid,
          lessonLabel,
          reason,
          error: lessonUpdateError.message,
        },
        'Failed to update lesson for review'
      );
    }

    const { error: failedContentError } = await supabaseAdmin.from('lesson_contents').insert({
      lesson_id: lessonUuid,
      course_id: courseId,
      status: 'review_required',
      metadata: JSON.parse(
        JSON.stringify({
          lessonLabel,
          markedForReviewAt: markedAt,
          failureReason: reason,
          terminalReason: reason,
          modelUsed: context.modelUsed ?? null,
          selectedModel: context.selectedModel ?? null,
          fallbackModel: context.fallbackModel ?? null,
          selectedModelTier: context.selectedModelTier ?? null,
          selectedModelTierReason: context.selectedModelTierReason ?? null,
          selectedModelPhase: context.selectedModelPhase ?? null,
          selectedModelSource: context.selectedModelSource ?? null,
          regenerateCount: context.regenerateCount ?? null,
          truncationCount: context.truncationCount ?? null,
          rejectedTokens: context.rejectedTokens ?? null,
          regenerationMode: context.regenerationMode ?? null,
          reviewInfo: context.reviewInfo ?? undefined,
          factualWarnings: context.factualWarnings ?? undefined,
          reviewReasons: context.reviewInfo?.reasons ?? [reason],
          qaSignals: context.qaSignals ?? undefined,
          qa_signals: context.qaSignals ?? undefined,
          qualityRecovery: context.qualityRecovery ?? undefined,
          qualityRecoveryDisposition: context.qualityRecovery?.final_disposition ?? undefined,
          sanityCheck: context.sanityCheck
            ? {
                passed: context.sanityCheck.ok,
                reason: context.sanityCheck.reason,
                charCount: context.sanityCheck.metrics?.charCount,
                wordCount: context.sanityCheck.metrics?.wordCount,
              }
            : undefined,
          courseAuditFindings: context.courseAuditFindings ?? undefined,
        })
      ) as Json,
      generation_attempt: (context.regenerateCount ?? 0) + 1,
    });

    if (failedContentError) {
      logger.warn(
        {
          courseId,
          lessonUuid,
          lessonLabel,
          reason,
          error: failedContentError.message,
        },
        'Failed to persist review_required lesson marker'
      );
    } else {
      logger.info(
        {
          courseId,
          lessonUuid,
          lessonLabel,
          reason,
          context,
        },
        'Lesson marked for manual review'
      );

      if (
        !context.suppressAlert &&
        isStage6QualityAlertsEnabled() &&
        /(retry|course audit|review required)/i.test(reason)
      ) {
        try {
          await notifyCourseError(courseId, 6, reason);
        } catch (notifyError) {
          logger.warn(
            {
              courseId,
              lessonUuid,
              lessonLabel,
              error: notifyError instanceof Error ? notifyError.message : String(notifyError),
            },
            'Failed to send Stage 6 review escalation notification'
          );
        }
      }
    }
  } catch (error) {
    logger.error(
      {
        courseId,
        lessonUuid,
        lessonLabel,
        reason,
        error: error instanceof Error ? error.message : String(error),
      },
      'Exception while marking lesson for review'
    );
  }
}

/**
 * Save generated lesson content to database
 */
export async function saveLessonContent(
  courseId: string,
  lessonLabel: string,
  result: Stage6Output,
  sanityResult?: SanityCheckResult,
  language: string = 'en'
): Promise<void> {
  if (!result.lessonContent) return;

  if (sanityResult && !sanityResult.ok) {
    logger.warn(
      {
        courseId,
        lessonLabel,
        reason: sanityResult.reason,
        metrics: sanityResult.metrics,
      },
      'Refusing to persist completed lesson content because sanity check failed'
    );
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const lessonUuid = await resolveLessonUuid(courseId, lessonLabel);

    if (!lessonUuid) {
      logger.warn(
        { courseId, lessonLabel },
        'Could not resolve lesson UUID - content not saved to database (available in job result)'
      );
      return;
    }

    const rawMarkdown = extractContentMarkdown(result.lessonContent, language);
    const markdown = sanitizeContent(rawMarkdown, { component: 'saveLessonContent' });
    const qaSignals = getQaSignalsFromResult(result);
    const { error } = await supabaseAdmin.from('lesson_contents').insert({
      lesson_id: lessonUuid,
      course_id: courseId,
      content: JSON.parse(JSON.stringify(result.lessonContent)) as Json,
      metadata: JSON.parse(
        JSON.stringify({
          lessonLabel,
          tokensUsed: result.metrics.tokensUsed,
          ...buildMetadataMetricAliases(result.metrics, qaSignals),
          modelUsed: result.metrics.modelUsed,
          selectedModel: result.metrics.selectedModel,
          fallbackModel: result.metrics.fallbackModel,
          selectedModelTier: result.metrics.selectedModelTier,
          selectedModelTierReason: result.metrics.selectedModelTierReason,
          selectedModelPhase: result.metrics.selectedModelPhase ?? null,
          selectedModelSource: result.metrics.selectedModelSource ?? null,
          qualityScore: result.metrics.qualityScore,
          regenerateCount: result.metrics.regenerateCount,
          truncationCount: result.metrics.truncationCount,
          rejectedTokens: result.metrics.rejectedTokens,
          regenerationMode: result.metrics.regenerationMode ?? null,
          durationMs: result.metrics.durationMs,
          generatedAt: new Date().toISOString(),
          markdownContent: markdown,
          qaSignals,
          qualityRecovery: result.qualityRecovery ?? undefined,
          qualityRecoveryDisposition: result.qualityRecovery?.final_disposition ?? undefined,
          reviewReasons: result.reviewInfo?.reasons ?? undefined,
          terminalReason: result.reviewInfo?.reasons?.[0] ?? undefined,
          sanityCheck: sanityResult
            ? {
                passed: sanityResult.ok,
                reason: sanityResult.reason,
                charCount: sanityResult.metrics?.charCount,
                wordCount: sanityResult.metrics?.wordCount,
              }
            : undefined,
          // Human review info for UI warnings (only present if review needed)
          reviewInfo: result.reviewInfo ?? undefined,
          factualWarnings: result.factualWarnings ?? undefined,
          lessonDigest: result.lessonDigest ?? undefined,
        })
      ) as Json,
      status: 'completed',
      generation_attempt: (result.metrics.regenerateCount ?? 0) + 1,
    });

    if (error) {
      logger.warn(
        {
          error: error.message,
          courseId,
          lessonLabel,
          lessonUuid,
        },
        'Failed to persist lesson content to database (content available in job result)'
      );
    } else {
      // Cache lesson markdown in Redis for Stage 7 fast access
      if (lessonUuid) {
        void cacheLessonMarkdown(courseId, lessonUuid, markdown);
      }
      logger.info(
        {
          courseId,
          lessonLabel,
          lessonUuid,
          qualityScore: result.metrics.qualityScore,
          tokensUsed: result.metrics.tokensUsed,
        },
        'Lesson content saved successfully'
      );

      const { data: newCount, error: rpcError } = await supabaseAdmin.rpc(
        'increment_lessons_completed',
        { p_course_id: courseId }
      );

      if (rpcError) {
        logger.warn(
          {
            courseId,
            lessonLabel,
            error: rpcError.message,
          },
          'Failed to increment lessons_completed counter (non-fatal)'
        );
      } else {
        logger.debug(
          {
            courseId,
            lessonLabel,
            lessonsCompleted: newCount,
          },
          'Incremented lessons_completed counter'
        );
      }

      // Track tokens in generation_progress (idempotent — safe for lesson retries)
      const lessonTokens = result.metrics.tokensUsed;
      if (lessonTokens && lessonTokens > 0 && lessonUuid) {
        const { error: tokenError } = await supabaseAdmin.rpc('upsert_stage_tokens', {
          p_course_id: courseId,
          p_stage_key: `lesson:${lessonUuid}`,
          p_tokens: lessonTokens,
        });
        if (tokenError) {
          logger.warn(
            { courseId, lessonLabel, tokens: lessonTokens, error: tokenError.message },
            'Failed to upsert stage tokens (non-fatal)'
          );
        }
      }
    }
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        courseId,
        lessonLabel,
      },
      'Database error saving lesson content (content available in job result)'
    );
  }
}

/**
 * Save rejected content to database for debugging purposes
 *
 * Called when selfReviewer returns REGENERATE status.
 * Stores the rejected content with metadata about why it was rejected.
 *
 * @param courseId - Course UUID
 * @param lessonLabel - Lesson label (e.g., "1.1")
 * @param lessonUuid - Lesson UUID (optional, will be resolved if not provided)
 * @param generatedContent - The raw markdown content that was rejected
 * @param selfReviewResult - The selfReviewer result with rejection reasons
 * @param generationAttempt - Current generation attempt number
 */
export async function saveRejectedContent(
  courseId: string,
  lessonLabel: string,
  lessonUuid: string | null,
  generatedContent: string | null,
  selfReviewResult: SelfReviewResult,
  generationAttempt: number,
  context?: {
    modelUsed?: string | null;
    selectedModel?: string | null;
    fallbackModel?: string | null;
    selectedModelTier?: string | null;
    selectedModelTierReason?: string | null;
    selectedModelPhase?: string | null;
    selectedModelSource?: string | null;
    modelOverride?: string | null;
    regenerateCount?: number | null;
    truncationCount?: number | null;
    rejectedTokens?: number | null;
    regenerationMode?: string | null;
    reviewContent?: string | null;
    reviewContentSource?: 'canonical' | 'raw';
    canonicalizationFailureReason?: string | null;
  }
): Promise<void> {
  if (!generatedContent) {
    logger.debug(
      { courseId, lessonLabel },
      'No content to save as rejected (generatedContent is null)'
    );
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Resolve lesson UUID if not provided
    let resolvedLessonUuid = lessonUuid;
    if (!resolvedLessonUuid) {
      resolvedLessonUuid = await resolveLessonUuid(courseId, lessonLabel);
    }

    if (!resolvedLessonUuid) {
      logger.warn(
        { courseId, lessonLabel },
        'Could not resolve lesson UUID - rejected content not saved'
      );
      return;
    }

    // Build content object with raw markdown
    const contentObject = {
      raw_markdown: generatedContent,
      lesson_id: lessonLabel,
      course_id: courseId,
    };

    // Build metadata with rejection details
    // failureReason is the canonical field name used by markForReview and UI queries.
    // rejectionReason is kept for backward compatibility with existing debug tooling.
    const metadata = {
      lessonLabel,
      generatedAt: new Date().toISOString(),
      failureReason: selfReviewResult.reasoning,
      rejectionReason: selfReviewResult.reasoning,
      rejectionStatus: selfReviewResult.status,
      issues: selfReviewResult.issues,
      heuristicsPassed: selfReviewResult.heuristicsPassed,
      heuristicDetails: selfReviewResult.heuristicDetails,
      tokensUsed: selfReviewResult.tokensUsed,
      durationMs: selfReviewResult.durationMs,
      contentLength: generatedContent.length,
      wordCount: generatedContent.split(/\s+/).filter(Boolean).length,
      modelUsed: context?.modelUsed ?? null,
      selectedModel: context?.selectedModel ?? null,
      fallbackModel: context?.fallbackModel ?? null,
      selectedModelTier: context?.selectedModelTier ?? null,
      selectedModelTierReason: context?.selectedModelTierReason ?? null,
      selectedModelPhase: context?.selectedModelPhase ?? null,
      selectedModelSource: context?.selectedModelSource ?? null,
      modelOverride: context?.modelOverride ?? null,
      regenerateCount: context?.regenerateCount ?? null,
      truncationCount: context?.truncationCount ?? null,
      rejectedTokens: context?.rejectedTokens ?? null,
      regenerationMode: context?.regenerationMode ?? null,
      reviewContent:
        context?.reviewContent && context.reviewContent !== generatedContent
          ? context.reviewContent
          : undefined,
      reviewContentSource: context?.reviewContentSource ?? 'raw',
      canonicalizationFailureReason: context?.canonicalizationFailureReason ?? null,
      generationAttempt,
    };

    const { error } = await supabaseAdmin.from('lesson_contents').insert({
      lesson_id: resolvedLessonUuid,
      course_id: courseId,
      content: contentObject,
      metadata,
      status: 'rejected',
      generation_attempt: generationAttempt,
    });

    if (error) {
      logger.warn(
        {
          error: error.message,
          courseId,
          lessonLabel,
          lessonUuid: resolvedLessonUuid,
        },
        'Failed to save rejected content to database'
      );
    } else {
      logger.info(
        {
          courseId,
          lessonLabel,
          lessonUuid: resolvedLessonUuid,
          generationAttempt,
          rejectionReason: selfReviewResult.reasoning,
          issuesCount: selfReviewResult.issues.length,
        },
        'Rejected content saved for debugging'
      );
    }
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        courseId,
        lessonLabel,
      },
      'Exception while saving rejected content'
    );
  }
}

/**
 * Save source documents attribution to lessons table
 *
 * Records which documents contributed to lesson content generation.
 * Called during Stage 6 after RAG retrieval.
 *
 * @param courseId - Course UUID
 * @param lessonUuid - Lesson UUID
 * @param sourceDocuments - Source documents from extractSourceDocuments()
 * @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
 */
export async function saveSourceDocuments(
  courseId: string,
  lessonUuid: LessonUUID,
  sourceDocuments: Array<{
    document_id: string;
    document_name: string;
    document_priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
    chunk_count: number;
  }>
): Promise<void> {
  if (!lessonUuid) {
    logger.warn({ courseId }, 'Cannot save source_documents - lessonUuid not provided');
    return;
  }

  if (sourceDocuments.length === 0) {
    logger.debug({ courseId, lessonUuid }, 'No source_documents to save');
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { error } = await supabaseAdmin
      .from('lessons')
      .update({
        source_documents: sourceDocuments,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lessonUuid);

    if (error) {
      logger.warn(
        {
          courseId,
          lessonUuid,
          error: error.message,
          documentCount: sourceDocuments.length,
        },
        'Failed to save source_documents to lessons table'
      );
    } else {
      logger.debug(
        {
          courseId,
          lessonUuid,
          documentCount: sourceDocuments.length,
          coreCount: sourceDocuments.filter(d => d.document_priority === 'CORE').length,
          importantCount: sourceDocuments.filter(d => d.document_priority === 'IMPORTANT').length,
        },
        'Source documents saved to lesson'
      );
    }
  } catch (error) {
    logger.warn(
      {
        courseId,
        lessonUuid,
        error: error instanceof Error ? error.message : String(error),
      },
      'Exception while saving source_documents'
    );
  }
}
