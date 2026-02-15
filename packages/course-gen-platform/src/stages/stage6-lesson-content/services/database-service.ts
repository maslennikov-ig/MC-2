import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';
import { resolveLessonUuid } from '@/shared/database/lesson-resolver';
import { notifyCourseCompletion } from '@/shared/notifications/course-notifications';
import type { Stage6Output } from '../orchestrator';
import { extractContentMarkdown } from './content-utils';
import type { SanityCheckResult } from '../utils/sanity-check';
import {
  LessonUUID,
  LessonLabel,
  GenerationProgress,
  GenerationProgressStep,
  Json,
} from '@megacampus/shared-types';
import type { SelfReviewResult } from '@megacampus/shared-types/judge-types';
import { parseGenerationProgress } from '@/shared/schemas/generation-progress.schema';

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
  if (!result.lessonContent || result.errors.length === 0) {
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Save partial content to lesson_contents table (not lessons table)
    // Serialize content to convert Date objects to strings (LessonContent has Date fields)
    const { error } = await supabaseAdmin.from('lesson_contents').upsert(
      {
        lesson_id: lessonUuid,
        course_id: courseId,
        content: JSON.parse(JSON.stringify(result.lessonContent)) as Json,
        status: 'review_required', // Mark as partial success requiring review
        metadata: JSON.parse(
          JSON.stringify({
            markdownContent: extractContentMarkdown(result.lessonContent, language),
            partial: true,
            errors: result.errors,
            qualityScore: result.metrics.qualityScore,
          })
        ) as Json,
      },
      {
        onConflict: 'lesson_id',
      }
    );

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
export async function markForReview(
  courseId: string,
  lessonUuid: LessonUUID,
  lessonLabel: LessonLabel,
  reason: string
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { error } = await supabaseAdmin
      .from('lessons')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', lessonUuid);

    if (error) {
      logger.warn(
        {
          courseId,
          lessonUuid,
          lessonLabel,
          reason,
          error: error.message,
        },
        'Failed to update lesson for review'
      );
    } else {
      logger.info(
        {
          courseId,
          lessonUuid,
          lessonLabel,
          reason,
        },
        'Lesson marked for manual review'
      );
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

    const { error } = await supabaseAdmin.from('lesson_contents').insert({
      lesson_id: lessonUuid,
      course_id: courseId,
      content: JSON.parse(JSON.stringify(result.lessonContent)) as Json,
      metadata: JSON.parse(
        JSON.stringify({
          lessonLabel,
          tokensUsed: result.metrics.tokensUsed,
          modelUsed: result.metrics.modelUsed,
          qualityScore: result.metrics.qualityScore,
          durationMs: result.metrics.durationMs,
          generatedAt: new Date().toISOString(),
          markdownContent: extractContentMarkdown(result.lessonContent, language),
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
  generationAttempt: number
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
        'generation_status, course_structure, auto_finalize_after_stage6, generation_progress'
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

    // Count lessons with generated content from lesson_contents table
    // lesson_contents has course_id directly, content stored as jsonb
    const { data: contentsData, error: contentsError } = await supabaseAdmin
      .from('lesson_contents')
      .select('id, lesson_id')
      .eq('course_id', courseId)
      .not('content', 'is', null);

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

    // Count unique lessons with content (there may be multiple content versions per lesson)
    const uniqueLessonIds = new Set(contentsData?.map(c => c.lesson_id) || []);
    const completedLessonsCount = uniqueLessonIds.size;

    logger.debug(
      {
        courseId,
        expectedLessonsCount,
        completedLessonsCount,
        autoFinalize: course.auto_finalize_after_stage6,
      },
      'Checking Stage 6 completion'
    );

    // If all lessons are complete, transition to stage_6_complete
    if (completedLessonsCount >= expectedLessonsCount) {
      // Determine target status based on auto_finalize flag
      const shouldAutoFinalize = course.auto_finalize_after_stage6 === true;

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
        message: shouldAutoFinalize ? 'Курс успешно создан!' : 'Генерация уроков завершена',
        lessons_completed: completedLessonsCount,
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
            completedLessonsCount,
            autoFinalize: shouldAutoFinalize,
          },
          shouldAutoFinalize
            ? 'All lessons generated - course auto-finalized to completed'
            : 'All lessons generated - course status updated to stage_6_complete'
        );

        // Send completion notifications (non-blocking)
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
