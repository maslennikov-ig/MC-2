import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';
import { resolveLessonUuid } from '@/shared/database/lesson-resolver';
import {
  notifyCourseCompletion,
  notifyCourseError,
} from '@/shared/notifications/course-notifications';
import type { Stage6Output } from '../orchestrator';
import { extractContentMarkdown } from './content-utils';
import { sanitizeContent } from '../judge/strip-metadata';
import { cacheLessonMarkdown } from '../../../shared/cache/file-content-cache';
import type { SanityCheckResult } from '../utils/sanity-check';
import {
  LessonUUID,
  LessonLabel,
  GenerationProgress,
  GenerationProgressStep,
  Json,
  Database,
} from '@megacampus/shared-types';
import type { SelfReviewResult } from '@megacampus/shared-types/judge-types';
import { parseGenerationProgress } from '@/shared/schemas/generation-progress.schema';
import type { LessonContent, LessonQualitySignals } from '@megacampus/shared-types/lesson-content';
import { runCourseQualityAudit, type CourseAuditFinding } from '../quality/course-audit';
import { isStage6CourseAuditEnabled, isStage6QualityAlertsEnabled } from '../quality/flags';
import type { Stage6ExecutionContext, Stage6QualityRecoveryHistory } from '../types';
import { STAGE6_REMEDIATION_CONTEXTS } from '../types';

const STAGE6_TERMINAL_LESSON_STATUSES = new Set([
  'completed',
  'review_required',
  'failed',
  'approved',
]);
const STAGE6_FULLY_COMPLETED_STATUSES = new Set(['completed', 'approved']);

type StoredLessonContentRow = {
  lesson_id: string;
  status: string;
  created_at: string;
  content?: Json | null;
  metadata?: Json | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getQaSignalsFromResult(result: Stage6Output): LessonQualitySignals | undefined {
  return result.lessonContent?.metadata?.qa_signals ?? undefined;
}

/**
 * QA signals are stored in two locations with different casing:
 * 1. metadata.qaSignals (camelCase) — written by saveLessonContent/handlePartialSuccess
 *    to the top-level metadata JSONB column
 * 2. content.metadata.qa_signals (snake_case) — embedded in the LessonContent JSON
 *    via the Zod schema (LessonContentMetadataSchema)
 * Both paths are checked for backward compatibility.
 */
function getQaSignalsFromStoredRow(
  row: StoredLessonContentRow
): Partial<LessonQualitySignals> | null {
  if (isRecord(row.metadata) && isRecord(row.metadata.qaSignals)) {
    return row.metadata.qaSignals as Partial<LessonQualitySignals>;
  }

  if (
    isRecord(row.content) &&
    isRecord(row.content.metadata) &&
    isRecord(row.content.metadata.qa_signals)
  ) {
    return row.content.metadata.qa_signals as Partial<LessonQualitySignals>;
  }

  return null;
}

function getMarkdownFromStoredRow(row: StoredLessonContentRow): string {
  if (isRecord(row.metadata) && typeof row.metadata.markdownContent === 'string') {
    return row.metadata.markdownContent;
  }

  if (isRecord(row.content) && typeof row.content.raw_markdown === 'string') {
    return row.content.raw_markdown;
  }

  if (isRecord(row.content) && isRecord(row.content.content) && isRecord(row.content.metadata)) {
    return extractContentMarkdown(row.content as unknown as LessonContent);
  }

  return '';
}

function getLessonLabelFromStoredRow(row: StoredLessonContentRow): string {
  if (isRecord(row.metadata) && typeof row.metadata.lessonLabel === 'string') {
    return row.metadata.lessonLabel;
  }

  return row.lesson_id;
}

function getContentArchetypeFromStoredRow(row: StoredLessonContentRow): string | null {
  if (isRecord(row.content) && isRecord(row.content.metadata)) {
    const archetype = row.content.metadata.archetype_used;
    return typeof archetype === 'string' ? archetype : null;
  }

  return null;
}

function getAttemptLadderFromResult(
  result:
    | Pick<Stage6Output, 'qualityRecovery' | 'metrics'>
    | { qualityRecovery?: Stage6QualityRecoveryHistory; attemptLadder?: Stage6QualityRecoveryHistory['attempts'] }
): Stage6QualityRecoveryHistory['attempts'] {
  const metricsAttemptLadder =
    'metrics' in result ? result.metrics.attemptLadder : undefined;
  const directAttemptLadder = 'attemptLadder' in result ? result.attemptLadder : undefined;
  return result.qualityRecovery?.attempts ?? metricsAttemptLadder ?? directAttemptLadder ?? [];
}

function summarizeCourseAuditFindings(findings: CourseAuditFinding[]): string {
  return findings
    .slice(0, 3)
    .map(finding => `${finding.kind} [${finding.lessonLabels.join(', ')}]`)
    .join('; ');
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
          selectedModelPhase: result.metrics.selectedModelPhase,
          selectedModelSource: result.metrics.selectedModelSource,
          qualityScore: result.metrics.qualityScore,
          regenerateCount: result.metrics.regenerateCount,
          truncationCount: result.metrics.truncationCount,
          rejectedTokens: result.metrics.rejectedTokens,
          regenerationMode: result.metrics.regenerationMode ?? null,
          attemptLadder: getAttemptLadderFromResult(result),
          qaSignals: getQaSignalsFromResult(result),
          reviewInfo: result.reviewInfo ?? undefined,
          qualityRecovery: result.qualityRecovery ?? undefined,
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
  qaSignals?: LessonQualitySignals | null;
  courseAuditFindings?: Array<Pick<CourseAuditFinding, 'kind' | 'detail'>>;
  qualityRecovery?: Stage6QualityRecoveryHistory;
  attemptLadder?: Stage6QualityRecoveryHistory['attempts'];
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
          attemptLadder:
            context.qualityRecovery?.attempts ?? context.attemptLadder ?? [],
          reviewInfo: context.reviewInfo ?? undefined,
          qaSignals: context.qaSignals ?? undefined,
          courseAuditFindings: context.courseAuditFindings ?? undefined,
          qualityRecovery: context.qualityRecovery ?? undefined,
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
 * Check whether a Stage 6 job is allowed to run for this course.
 *
 * For normal full_generation jobs, only `stage_6_generating` is accepted.
 * For remediation jobs (partial_regeneration, manual_regeneration,
 * generate_missing), `stage_6_generating` is also the expected state because
 * `transitionToStage6Generating()` moves the course there before enqueueing.
 * However, if the transition was skipped or a race occurred, remediation jobs
 * also accept `stage_6_complete` and `completed` so they don't silently no-op.
 */
export async function isStage6CourseActive(
  courseId: string,
  executionContext?: Stage6ExecutionContext
): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data, error } = await supabaseAdmin
      .from('courses')
      .select('generation_status')
      .eq('id', courseId)
      .single();

    if (error) {
      logger.warn({ courseId, error: error.message }, 'Failed to read Stage 6 course status');
      return true;
    }

    const status = data?.generation_status;

    if (status === 'stage_6_generating') {
      return true;
    }

    // Remediation contexts tolerate completed/stage_6_complete because
    // transitionToStage6Generating may have raced or been skipped.
    if (
      executionContext &&
      STAGE6_REMEDIATION_CONTEXTS.has(executionContext) &&
      (status === 'stage_6_complete' || status === 'completed')
    ) {
      logger.info(
        { courseId, executionContext, generationStatus: status },
        'Remediation job allowed on completed course'
      );
      return true;
    }

    return false;
  } catch (error) {
    logger.warn(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Exception while checking Stage 6 course status'
    );
    return true;
  }
}

export async function failStage6Course(courseId: string, reason: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();
  const failedAt = new Date().toISOString();

  try {
    const { data, error } = await supabaseAdmin
      .from('courses')
      .update({
        generation_status: 'failed',
        failed_at_stage: 6,
        error_code: 'NETWORK_ERROR' as Database['public']['Enums']['stage_error_code'],
        generation_metadata: {
          error_code: 'NETWORK_ERROR',
          failed_at: failedAt,
          failed_phase: 'rag_preflight',
          error_message: reason,
        } as Json,
        updated_at: failedAt,
      })
      .eq('id', courseId)
      .eq('generation_status', 'stage_6_generating')
      .select('id');

    if (error) {
      logger.error({ courseId, error: error.message, reason }, 'Failed to mark Stage 6 course failed');
      return false;
    }

    const didTransition = Array.isArray(data) && data.length > 0;
    if (!didTransition) {
      logger.info(
        { courseId, reason },
        'Stage 6 course failure already handled or course no longer generating'
      );
      return false;
    }

    try {
      await notifyCourseError(courseId, 6, reason);
    } catch (notifyError) {
      logger.warn(
        {
          courseId,
          error: notifyError instanceof Error ? notifyError.message : String(notifyError),
        },
        'Failed to send Stage 6 infrastructure error notification'
      );
    }

    return true;
  } catch (error) {
    logger.error(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
        reason,
      },
      'Exception while marking Stage 6 course failed'
    );
    return false;
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
    const { error } = await supabaseAdmin.from('lesson_contents').insert({
      lesson_id: lessonUuid,
      course_id: courseId,
      content: JSON.parse(JSON.stringify(result.lessonContent)) as Json,
      metadata: JSON.parse(
        JSON.stringify({
          lessonLabel,
          tokensUsed: result.metrics.tokensUsed,
          modelUsed: result.metrics.modelUsed,
          selectedModel: result.metrics.selectedModel,
          fallbackModel: result.metrics.fallbackModel,
          selectedModelTier: result.metrics.selectedModelTier,
          selectedModelTierReason: result.metrics.selectedModelTierReason,
          selectedModelPhase: result.metrics.selectedModelPhase,
          selectedModelSource: result.metrics.selectedModelSource,
          qualityScore: result.metrics.qualityScore,
          regenerateCount: result.metrics.regenerateCount,
          truncationCount: result.metrics.truncationCount,
          rejectedTokens: result.metrics.rejectedTokens,
          regenerationMode: result.metrics.regenerationMode ?? null,
          attemptLadder: getAttemptLadderFromResult(result),
          durationMs: result.metrics.durationMs,
          generatedAt: new Date().toISOString(),
          markdownContent: markdown,
          qaSignals: getQaSignalsFromResult(result),
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
          lessonDigest: result.lessonDigest ?? undefined,
          qualityRecovery: result.qualityRecovery ?? undefined,
        })
      ) as Json,
      status: 'completed',
      generation_attempt: 1,
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
    attemptLadder?: Stage6QualityRecoveryHistory['attempts'];
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
    const metadata = {
      lessonLabel,
      generatedAt: new Date().toISOString(),
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
      attemptLadder: context?.attemptLadder ?? [],
      generationAttempt,
    };

    const { error } = await supabaseAdmin.from('lesson_contents').insert({
      lesson_id: resolvedLessonUuid,
      course_id: courseId,
      content: JSON.parse(JSON.stringify(contentObject)) as Json,
      metadata: JSON.parse(JSON.stringify(metadata)) as Json,
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

/**
 * Check if all lessons are generated and update course status to stage_6_complete
 *
 * This function is called after each successful lesson save to check if all lessons
 * in the course have been generated. If so, it transitions the course from
 * stage_6_generating to stage_6_complete.
 *
 * If auto_finalize_after_stage6 is enabled, it also transitions to 'completed'
 * and sets generation_completed_at.
 *
 * @param courseId - Course UUID
 */
export async function checkAndSetStage6Complete(courseId: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Get current course status, progress, and auto_finalize flag
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select(
        'generation_status, course_structure, auto_finalize_after_stage6, generation_progress, target_audience'
      )
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      logger.warn(
        {
          courseId,
          error: courseError?.message,
        },
        'Failed to fetch course for Stage 6 completion check'
      );
      return;
    }

    // Only check if currently in stage_6_generating
    if (course.generation_status !== 'stage_6_generating') {
      return;
    }

    // Count expected lessons from course_structure
    const structure = course.course_structure as {
      sections: Array<{
        section_number: number;
        lessons: Array<{ lesson_number: number }>;
      }>;
    } | null;

    if (!structure || !structure.sections) {
      return;
    }

    const expectedLessonsCount = structure.sections.reduce(
      (total, section) => total + (section.lessons?.length || 0),
      0
    );

    if (expectedLessonsCount === 0) {
      return;
    }

    // Count lessons with completed content only.
    // Rejected drafts must not contribute to Stage 6 completion.
    const { data: contentsData, error: contentsError } = await supabaseAdmin
      .from('lesson_contents')
      .select('lesson_id, status, created_at, content, metadata')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });

    if (contentsError) {
      logger.warn(
        {
          courseId,
          error: contentsError.message,
        },
        'Failed to count generated lessons'
      );
      return;
    }

    const latestRowByLesson = new Map<string, StoredLessonContentRow>();
    for (const content of (contentsData || []) as StoredLessonContentRow[]) {
      if (!latestRowByLesson.has(content.lesson_id)) {
        latestRowByLesson.set(content.lesson_id, content);
      }
    }

    let terminalLessonsCount = 0;
    let fullyCompletedLessonsCount = 0;
    for (const latestRow of latestRowByLesson.values()) {
      const latestStatus = latestRow.status;
      if (STAGE6_TERMINAL_LESSON_STATUSES.has(latestStatus)) {
        terminalLessonsCount++;
      }
      if (STAGE6_FULLY_COMPLETED_STATUSES.has(latestStatus)) {
        fullyCompletedLessonsCount++;
      }
    }

    logger.debug(
      {
        courseId,
        expectedLessonsCount,
        terminalLessonsCount,
        fullyCompletedLessonsCount,
        autoFinalize: course.auto_finalize_after_stage6,
      },
      'Checking Stage 6 completion'
    );

    // If all lessons reached a terminal state, transition course out of stage_6_generating.
    if (terminalLessonsCount >= expectedLessonsCount) {
      let courseAuditBlockedFinalize = false;
      let courseAuditSummary: string | null = null;

      if (
        isStage6CourseAuditEnabled() &&
        fullyCompletedLessonsCount >= expectedLessonsCount &&
        latestRowByLesson.size >= expectedLessonsCount
      ) {
        const auditLessons = Array.from(latestRowByLesson.values())
          .filter(row => STAGE6_FULLY_COMPLETED_STATUSES.has(row.status))
          .map(row => ({
            lessonId: row.lesson_id,
            lessonLabel: getLessonLabelFromStoredRow(row),
            markdown: getMarkdownFromStoredRow(row),
            targetAudience:
              typeof course.target_audience === 'string' ? course.target_audience : null,
            contentArchetype: getContentArchetypeFromStoredRow(row),
            qaSignals: getQaSignalsFromStoredRow(row),
          }))
          .filter(lesson => lesson.markdown.trim().length > 0);

        if (auditLessons.length === expectedLessonsCount) {
          const auditResult = runCourseQualityAudit(auditLessons);

          if (auditResult.findings.length > 0) {
            courseAuditBlockedFinalize = true;
            courseAuditSummary = summarizeCourseAuditFindings(auditResult.findings);

            logger.warn(
              {
                courseId,
                findings: auditResult.findings,
                affectedLessonIds: auditResult.affectedLessonIds,
              },
              'Stage 6 course audit found conservative review-required patterns'
            );

            for (const lesson of auditLessons) {
              const flags = auditResult.perLessonFlags[lesson.lessonId] ?? [];
              if (flags.length === 0) {
                continue;
              }

              await markForReview(
                courseId,
                lesson.lessonId as LessonUUID,
                lesson.lessonLabel as LessonLabel,
                `Stage 6 course audit flagged: ${flags.join(', ')}`,
                {
                  qaSignals: lesson.qaSignals
                    ? {
                        version: lesson.qaSignals.version ?? 1,
                        ...lesson.qaSignals,
                        course_flags: Array.from(
                          new Set([...(lesson.qaSignals?.course_flags ?? []), ...flags])
                        ),
                      }
                    : {
                        version: 1,
                        course_flags: flags,
                      },
                  courseAuditFindings: auditResult.findings
                    .filter(finding => finding.lessonIds.includes(lesson.lessonId))
                    .map(finding => ({ kind: finding.kind, detail: finding.detail })),
                  suppressAlert: true,
                }
              );
            }

            if (isStage6QualityAlertsEnabled()) {
              try {
                await notifyCourseError(
                  courseId,
                  6,
                  `Stage 6 course audit flagged ${auditResult.findings.length} finding(s): ${courseAuditSummary}`
                );
              } catch (notifyError) {
                logger.warn(
                  {
                    courseId,
                    error: notifyError instanceof Error ? notifyError.message : String(notifyError),
                  },
                  'Failed to send Stage 6 quality alert notification'
                );
              }
            }
          }
        }
      }

      // Auto-finalize only when every lesson has fully completed content.
      const shouldAutoFinalize =
        course.auto_finalize_after_stage6 === true &&
        !courseAuditBlockedFinalize &&
        fullyCompletedLessonsCount >= expectedLessonsCount;

      // Set generation_completed_at when finalizing
      const completedAt = shouldAutoFinalize ? new Date().toISOString() : undefined;

      // Update progress with 100% and completion message
      // Validate existing progress data with Zod schema
      const parsedProgress = parseGenerationProgress(course.generation_progress);
      if (!parsedProgress && course.generation_progress) {
        logger.warn(
          {
            courseId,
            generation_progress: course.generation_progress,
          },
          'Invalid generation_progress data in database - using fallback'
        );
      }
      const existingProgress = (parsedProgress || {}) as Partial<GenerationProgress>;

      // Update all steps to completed status if steps exist
      const updatedSteps: GenerationProgressStep[] | undefined = existingProgress.steps?.map(
        step => ({
          ...step,
          status: 'completed' as const,
          completed_at: step.completed_at || new Date().toISOString(),
        })
      );

      const updatedProgress: GenerationProgress = {
        ...existingProgress,
        percentage: 100,
        message: shouldAutoFinalize
          ? 'Курс успешно создан!'
          : courseAuditBlockedFinalize
            ? 'Генерация уроков завершена, аудит курса требует проверки'
            : 'Генерация уроков завершена, требуется проверка',
        lessons_completed: terminalLessonsCount,
        ...(updatedSteps && { steps: updatedSteps }),
      };

      // Note: Theoretical race condition possible if two lessons complete simultaneously
      // (progress fetched earlier could be stale). Accepted because:
      // 1. Very rare (requires exact timing within ~50-200ms window)
      // 2. Final state (status = completed) is always correct
      // 3. Only intermediate progress could be lost (cosmetic)
      // 4. .eq('generation_status') prevents duplicate completion
      const { error: updateError } = await supabaseAdmin
        .from('courses')
        .update({
          generation_status: shouldAutoFinalize ? 'completed' : 'stage_6_complete',
          generation_progress: updatedProgress,
          ...(completedAt && { generation_completed_at: completedAt }),
          // Set publication status when auto-finalizing so the course becomes viewable
          ...(shouldAutoFinalize && { status: 'published' as const }),
        })
        .eq('id', courseId)
        .eq('generation_status', 'stage_6_generating'); // Only update if still generating

      if (updateError) {
        logger.warn(
          {
            courseId,
            targetStatus: shouldAutoFinalize ? 'completed' : 'stage_6_complete',
            error: updateError.message,
          },
          `Failed to update course status to ${shouldAutoFinalize ? 'completed' : 'stage_6_complete'}`
        );
      } else {
        logger.info(
          {
            courseId,
            expectedLessonsCount,
            terminalLessonsCount,
            fullyCompletedLessonsCount,
            autoFinalize: shouldAutoFinalize,
            courseAuditBlockedFinalize,
            courseAuditSummary,
          },
          shouldAutoFinalize
            ? 'All lessons generated - course auto-finalized to completed'
            : 'All lessons reached terminal status - course moved to stage_6_complete'
        );

        // Send "course ready" notifications only for true auto-finalization.
        if (shouldAutoFinalize) {
          try {
            await notifyCourseCompletion(courseId);
          } catch (notifyError) {
            logger.warn(
              {
                courseId,
                error: notifyError instanceof Error ? notifyError.message : String(notifyError),
              },
              'Failed to send completion notifications (non-fatal)'
            );
          }
        }
      }
    }
  } catch (error) {
    logger.warn(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Exception while checking Stage 6 completion'
    );
  }
}
