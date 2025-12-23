import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';
import { resolveLessonUuid } from '@/shared/database/lesson-resolver';
import type { Stage6Output } from '../orchestrator';
import { extractContentMarkdown } from './content-utils';
import type { SanityCheckResult } from '../utils/sanity-check';
import { LessonUUID, LessonLabel } from '@megacampus/shared-types';

/**
 * Handle partial success scenarios
 */
export async function handlePartialSuccess(
  jobId: string,
  courseId: string,
  lessonUuid: LessonUUID,
  lessonLabel: LessonLabel,
  result: Stage6Output
): Promise<void> {
  if (!result.lessonContent || result.errors.length === 0) {
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { error } = await supabaseAdmin
      .from('lessons')
      .update({
        content: extractContentMarkdown(result.lessonContent),
        updated_at: new Date().toISOString(),
      })
      .eq('id', lessonUuid);

    if (error) {
      logger.warn(
        {
          jobId,
          courseId,
          lessonUuid,
          lessonLabel,
          error: error.message,
        },
        'Failed to save partial content to database'
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
        'Partial success - content saved for review'
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
  sanityResult?: SanityCheckResult
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

    const { error } = await supabaseAdmin
      .from('lesson_contents')
      .insert({
        lesson_id: lessonUuid,
        course_id: courseId,
        content: JSON.parse(JSON.stringify(result.lessonContent)),
        metadata: JSON.parse(JSON.stringify({
          lessonLabel,
          tokensUsed: result.metrics.tokensUsed,
          modelUsed: result.metrics.modelUsed,
          qualityScore: result.metrics.qualityScore,
          durationMs: result.metrics.durationMs,
          generatedAt: new Date().toISOString(),
          markdownContent: extractContentMarkdown(result.lessonContent),
          sanityCheck: sanityResult ? {
            passed: sanityResult.ok,
            reason: sanityResult.reason,
            charCount: sanityResult.metrics?.charCount,
            wordCount: sanityResult.metrics?.wordCount,
          } : undefined,
        })),
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
