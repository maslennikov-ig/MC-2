/**
 * Does the COURSE count as finished?
 *
 * @module stage6-completion
 *
 * Split out of `database-service.ts` at 1101 lines of code. The seam is the subject: everything
 * left there is about ONE lesson — save it, reject it, mark it for review — while this asks a
 * question about all of them at once, and answers it by moving the course out of
 * `stage_6_generating`.
 *
 * The check itself was 345 lines with a cyclomatic complexity of 56, which made the order of its
 * gates hard to see. It is the same order, now with each gate named: load, count, refuse to
 * publish what is not publishable, audit, then finalize.
 */

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';
import {
  notifyCourseCompletion,
  notifyCourseError,
} from '@/shared/notifications/course-notifications';
import {
  explainGenerationProgress,
  parseGenerationProgress,
} from '@/shared/schemas/generation-progress.schema';
import type {
  GenerationProgress,
  GenerationProgressStep,
  LessonLabel,
  LessonUUID,
} from '@megacampus/shared-types';
import { runCourseQualityAudit } from '../quality/course-audit';
import { isStage6CourseAuditEnabled, isStage6QualityAlertsEnabled } from '../quality/flags';
import { markForReview } from './database-service';
import {
  getContentArchetypeFromStoredRow,
  getLessonLabelFromStoredRow,
  getMarkdownFromStoredRow,
  getQaSignalsFromStoredRow,
  getStoredLessonPublishabilityFailure,
  isStoredLessonPublishable,
  STAGE6_FULLY_COMPLETED_STATUSES,
  STAGE6_TERMINAL_LESSON_STATUSES,
  summarizeCourseAuditFindings,
  type StoredLessonContentRow,
} from './stored-lesson-row';

/** The columns the completion check reads, and the latest row per lesson. */
interface CompletionState {
  course: {
    generation_status: string | null;
    course_structure: unknown;
    auto_finalize_after_stage6: boolean | null;
    generation_progress: unknown;
    target_audience: unknown;
  };
  latestRowByLesson: Map<string, StoredLessonContentRow>;
  expectedLessonsCount: number;
}

/**
 * Read everything the check needs, or `null` when there is nothing to decide.
 *
 * `null` covers five different "not now" cases — course missing, not generating, no structure,
 * no lessons expected, contents unreadable — and each logs only where a human could act on it.
 * A course that is simply not in `stage_6_generating` is not a problem and says nothing.
 */
async function loadCompletionState(courseId: string): Promise<CompletionState | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select(
      'generation_status, course_structure, auto_finalize_after_stage6, generation_progress, target_audience'
    )
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    logger.warn(
      { courseId, error: courseError?.message },
      'Failed to fetch course for Stage 6 completion check'
    );
    return null;
  }

  if (course.generation_status !== 'stage_6_generating') return null;

  const structure = course.course_structure as {
    sections: Array<{ section_number: number; lessons: Array<{ lesson_number: number }> }>;
  } | null;
  if (!structure?.sections) return null;

  const expectedLessonsCount = structure.sections.reduce(
    (total, section) => total + (section.lessons?.length || 0),
    0
  );
  if (expectedLessonsCount === 0) return null;

  // Only lessons with completed content count. Rejected drafts must not contribute to
  // Stage 6 completion, which is why this reads every row and keeps the newest per lesson
  // rather than asking the database for a count.
  const { data: contentsData, error: contentsError } = await supabaseAdmin
    .from('lesson_contents')
    .select('lesson_id, status, created_at, content, metadata')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });

  if (contentsError) {
    logger.warn({ courseId, error: contentsError.message }, 'Failed to count generated lessons');
    return null;
  }

  const latestRowByLesson = new Map<string, StoredLessonContentRow>();
  for (const content of (contentsData || []) as StoredLessonContentRow[]) {
    if (!latestRowByLesson.has(content.lesson_id)) {
      latestRowByLesson.set(content.lesson_id, content);
    }
  }

  return { course: course as CompletionState['course'], latestRowByLesson, expectedLessonsCount };
}

/**
 * Two counts, because they answer different questions.
 *
 * `terminal` decides whether Stage 6 is DONE — a failed lesson is done. `fullyCompleted` decides
 * whether the course can be published without a human, and requires the stored content to still
 * pass its sanity check.
 */
function countLessonStates(latestRowByLesson: Map<string, StoredLessonContentRow>): {
  terminalLessonsCount: number;
  fullyCompletedLessonsCount: number;
} {
  let terminalLessonsCount = 0;
  let fullyCompletedLessonsCount = 0;

  for (const latestRow of latestRowByLesson.values()) {
    if (STAGE6_TERMINAL_LESSON_STATUSES.has(latestRow.status)) terminalLessonsCount++;
    if (
      STAGE6_FULLY_COMPLETED_STATUSES.has(latestRow.status) &&
      isStoredLessonPublishable(latestRow)
    ) {
      fullyCompletedLessonsCount++;
    }
  }

  return { terminalLessonsCount, fullyCompletedLessonsCount };
}

/**
 * A row can say `completed` and still hold nothing publishable. Those go back for review.
 *
 * Returns a summary when it found any, which blocks auto-finalize. `suppressAlert` because the
 * caller sends one notification for the course rather than one per lesson.
 */
async function flagUnpublishableLessons(
  courseId: string,
  latestRowByLesson: Map<string, StoredLessonContentRow>
): Promise<string | null> {
  const invalidCompletedLessons = Array.from(latestRowByLesson.values())
    .map(row => ({ row, reason: getStoredLessonPublishabilityFailure(row) }))
    .filter((entry): entry is { row: StoredLessonContentRow; reason: string } =>
      Boolean(entry.reason)
    );

  if (invalidCompletedLessons.length === 0) return null;

  const summary = `not publishable lesson content: ${invalidCompletedLessons
    .slice(0, 3)
    .map(entry => `${getLessonLabelFromStoredRow(entry.row)} (${entry.reason})`)
    .join('; ')}`;

  logger.warn(
    {
      courseId,
      invalidLessons: invalidCompletedLessons.map(entry => ({
        lessonId: entry.row.lesson_id,
        lessonLabel: getLessonLabelFromStoredRow(entry.row),
        reason: entry.reason,
      })),
    },
    'Stage 6 completed rows failed publishability checks'
  );

  for (const entry of invalidCompletedLessons) {
    await markForReview(
      courseId,
      entry.row.lesson_id as LessonUUID,
      getLessonLabelFromStoredRow(entry.row) as LessonLabel,
      `Stage 6 completed content is not publishable: ${entry.reason}`,
      { suppressAlert: true }
    );
  }

  return summary;
}

/**
 * Cross-lesson quality audit — repetition, contradiction, the patterns a single lesson cannot
 * show. Only runs when every lesson is fully completed AND present, because a partial course
 * would produce findings about gaps rather than about quality.
 *
 * Returns a summary when it found anything, which blocks auto-finalize.
 */
async function auditCourseQuality(
  courseId: string,
  state: CompletionState,
  fullyCompletedLessonsCount: number
): Promise<string | null> {
  const { course, latestRowByLesson, expectedLessonsCount } = state;

  if (
    !isStage6CourseAuditEnabled() ||
    fullyCompletedLessonsCount < expectedLessonsCount ||
    latestRowByLesson.size < expectedLessonsCount
  ) {
    return null;
  }

  const auditLessons = Array.from(latestRowByLesson.values())
    .filter(row => STAGE6_FULLY_COMPLETED_STATUSES.has(row.status))
    .map(row => ({
      lessonId: row.lesson_id,
      lessonLabel: getLessonLabelFromStoredRow(row),
      markdown: getMarkdownFromStoredRow(row),
      targetAudience: typeof course.target_audience === 'string' ? course.target_audience : null,
      contentArchetype: getContentArchetypeFromStoredRow(row),
      qaSignals: getQaSignalsFromStoredRow(row),
    }))
    .filter(lesson => lesson.markdown.trim().length > 0);

  if (auditLessons.length !== expectedLessonsCount) return null;

  const auditResult = runCourseQualityAudit(auditLessons);
  if (auditResult.findings.length === 0) return null;

  const summary = summarizeCourseAuditFindings(auditResult.findings);

  logger.warn(
    { courseId, findings: auditResult.findings, affectedLessonIds: auditResult.affectedLessonIds },
    'Stage 6 course audit found conservative review-required patterns'
  );

  for (const lesson of auditLessons) {
    const flags = auditResult.perLessonFlags[lesson.lessonId] ?? [];
    if (flags.length === 0) continue;

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
          : { version: 1, course_flags: flags },
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
        `Stage 6 course audit flagged ${auditResult.findings.length} finding(s): ${summary}`
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

  return summary;
}

/** 100%, every step closed, and a message that says which of the three endings this is. */
function buildCompletionProgress(
  courseId: string,
  rawProgress: unknown,
  shouldAutoFinalize: boolean,
  auditBlockedFinalize: boolean,
  terminalLessonsCount: number
): GenerationProgress {
  const parsedProgress = parseGenerationProgress(rawProgress);
  if (!parsedProgress && rawProgress) {
    logger.warn(
      {
        courseId,
        invalidFields: explainGenerationProgress(rawProgress),
        generation_progress: rawProgress,
      },
      'Invalid generation_progress data in database - using fallback'
    );
  }

  const existingProgress = (parsedProgress || {}) as Partial<GenerationProgress>;
  const updatedSteps: GenerationProgressStep[] | undefined = existingProgress.steps?.map(step => ({
    ...step,
    status: 'completed' as const,
    completed_at: step.completed_at || new Date().toISOString(),
  }));

  let message: string;
  if (shouldAutoFinalize) {
    message = 'Курс успешно создан!';
  } else if (auditBlockedFinalize) {
    message = 'Генерация уроков завершена, аудит курса требует проверки';
  } else {
    message = 'Генерация уроков завершена, требуется проверка';
  }

  return {
    ...existingProgress,
    percentage: 100,
    message,
    lessons_completed: terminalLessonsCount,
    ...(updatedSteps && { steps: updatedSteps }),
  };
}

/**
 * Check if all lessons for a course are complete and update course status.
 *
 * Called after each lesson finishes. Moves the course out of `stage_6_generating` once every
 * lesson has reached a terminal state, and publishes it outright when the owner asked for
 * auto-finalize AND nothing was flagged.
 *
 * Never throws: a failure here must not fail the lesson that triggered it.
 */
export async function checkAndSetStage6Complete(courseId: string): Promise<void> {
  try {
    const state = await loadCompletionState(courseId);
    if (!state) return;

    const { course, latestRowByLesson, expectedLessonsCount } = state;
    const { terminalLessonsCount, fullyCompletedLessonsCount } =
      countLessonStates(latestRowByLesson);

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

    if (terminalLessonsCount < expectedLessonsCount) return;

    const unpublishableSummary = await flagUnpublishableLessons(courseId, latestRowByLesson);
    const auditSummary = await auditCourseQuality(courseId, state, fullyCompletedLessonsCount);
    const courseAuditSummary = auditSummary ?? unpublishableSummary;
    const courseAuditBlockedFinalize = courseAuditSummary !== null;

    // Auto-finalize only when every lesson has fully completed content.
    const shouldAutoFinalize =
      course.auto_finalize_after_stage6 === true &&
      !courseAuditBlockedFinalize &&
      fullyCompletedLessonsCount >= expectedLessonsCount;

    const completedAt = shouldAutoFinalize ? new Date().toISOString() : undefined;
    const updatedProgress = buildCompletionProgress(
      courseId,
      course.generation_progress,
      shouldAutoFinalize,
      courseAuditBlockedFinalize,
      terminalLessonsCount
    );

    // Note: Theoretical race condition possible if two lessons complete simultaneously
    // (progress fetched earlier could be stale). Accepted because:
    // 1. Very rare (requires exact timing within ~50-200ms window)
    // 2. Final state (status = completed) is always correct
    // 3. Only intermediate progress could be lost (cosmetic)
    // 4. .eq('generation_status') prevents duplicate completion
    const { error: updateError } = await getSupabaseAdmin()
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
      return;
    }

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
  } catch (error) {
    logger.warn(
      { courseId, error: error instanceof Error ? error.message : String(error) },
      'Exception while checking Stage 6 completion'
    );
  }
}
