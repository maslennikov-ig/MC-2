import type { Job } from 'bullmq';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AnalysisResult,
  type Language,
  type Stage6HandoffJobData,
} from '@megacampus/shared-types';

import type { JobResult } from './base-handler';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger';
import {
  convertToLessonSpecV2,
  parseCourseStructureLessons,
} from '../../shared/auto-approval/helpers';
import {
  enqueueStage6Lesson,
  type EnqueueStage6LessonOptions,
} from '../../stages/stage6-lesson-content/enqueue';
import { checkAndSetStage6Complete } from '../../stages/stage6-lesson-content/services/database-service';
import {
  DEFAULT_COURSE_STYLE,
  isValidStyle,
} from '@megacampus/shared-types/style-prompts';

interface Stage6HandoffCourse {
  organization_id: string;
  generation_status: string | null;
  course_structure: unknown;
  language: string | null;
  style: string | null;
  title: string | null;
  analysis_result: unknown;
}

interface EnqueuedStage6Lesson {
  id?: string;
  getState?: () => Promise<string>;
}

export interface Stage6HandoffDependencies {
  loadCourse: (courseId: string) => Promise<Stage6HandoffCourse>;
  claimGenerating: (courseId: string, currentStatus: string | null) => Promise<void>;
  enqueueLesson: (options: EnqueueStage6LessonOptions) => Promise<EnqueuedStage6Lesson>;
  checkComplete: (courseId: string) => Promise<void>;
}

/**
 * Claim the Stage 6 state before a lesson can run. A guarded update returning no
 * row is a lost claim and must be retried rather than reported as success.
 */
export async function claimStage6Generating(
  supabase: SupabaseClient,
  courseId: string,
  currentStatus: string | null
): Promise<void> {
  if (currentStatus === 'stage_6_generating') return;
  if (currentStatus !== 'stage_6_init') {
    throw new Error(`Stage 6 handoff cannot start from status ${currentStatus ?? 'null'}`);
  }

  const { data, error } = await supabase
    .from('courses')
    .update({ generation_status: 'stage_6_generating' })
    .eq('id', courseId)
    .eq('generation_status', 'stage_6_init')
    .select('id');

  if (error) {
    throw new Error(`Stage 6 handoff status claim failed: ${error.message}`);
  }
  if (!data || data.length !== 1) {
    throw new Error(`Stage 6 handoff status claim updated ${data?.length ?? 0} rows`);
  }
}

async function loadStage6HandoffCourse(courseId: string): Promise<Stage6HandoffCourse> {
  const { data, error } = await getSupabaseAdmin()
    .from('courses')
    .select(
      'organization_id, generation_status, course_structure, language, style, title, analysis_result'
    )
    .eq('id', courseId)
    .single();

  if (error || !data?.course_structure) {
    throw new Error(`Course structure not found for Stage 6: ${error?.message ?? 'no data'}`);
  }
  return data;
}

const productionDependencies: Stage6HandoffDependencies = {
  loadCourse: loadStage6HandoffCourse,
  claimGenerating: (courseId, status) =>
    claimStage6Generating(getSupabaseAdmin(), courseId, status),
  enqueueLesson: enqueueStage6Lesson,
  checkComplete: checkAndSetStage6Complete,
};

/**
 * Retryable Stage 6 course-level operation.
 *
 * The course becomes observable as generating before fanout. Per-lesson job IDs
 * remain stable, so a worker retry fills only missing jobs. The final completion
 * check closes the fast-lesson race and revisits already terminal lessons after
 * a recovered partial fanout.
 */
export async function runStage6Handoff(
  input: Pick<Stage6HandoffJobData, 'courseId' | 'organizationId' | 'userId' | 'priority'>,
  dependencies: Stage6HandoffDependencies = productionDependencies
): Promise<void> {
  const course = await dependencies.loadCourse(input.courseId);

  if (course.organization_id !== input.organizationId) {
    throw new Error('Stage 6 handoff organization does not match course organization');
  }

  const lessons = parseCourseStructureLessons(course.course_structure);
  if (lessons.length === 0) throw new Error('No lessons found in course structure for Stage 6');

  // The worker may finish the aggregate update and lose its BullMQ ACK. A
  // retry of that exact tenant/course command with a valid stored structure is
  // complete already and must not poison the queue or recreate paid work.
  if (
    course.generation_status === 'completed' ||
    course.generation_status === 'stage_6_complete'
  ) {
    return;
  }

  await dependencies.claimGenerating(input.courseId, course.generation_status);

  const language = (course.language || 'ru') as Language;
  const style = course.style && isValidStyle(course.style) ? course.style : DEFAULT_COURSE_STYLE;
  const courseTitle = course.title || 'Untitled Course';

  for (const lesson of lessons) {
    const queued = await dependencies.enqueueLesson({
      jobData: {
        lessonSpec: convertToLessonSpecV2(lesson, courseTitle),
        courseId: input.courseId,
        organizationId: input.organizationId,
        userId: input.userId,
        language,
        style,
        ragChunks: [],
        ragContextId: null,
        executionContext: 'full_generation',
        analysisResult: course.analysis_result as AnalysisResult | undefined,
      },
      jobName: `lesson:${lesson.lesson_id}`,
      source: 'autoApproval',
      priority: input.priority,
      deduplication: {
        kind: 'jobId',
        jobId: `auto-${input.courseId}-stage6-lesson-${lesson.lesson_id}`,
      },
    });

    // BullMQ returns an existing job for a duplicate jobId. Completed jobs are
    // intentional idempotent replay, but a failed job must not masquerade as a
    // successfully recovered fanout. Its scoped recovery policy belongs to the
    // lesson retry path, which can account for provider work already attempted.
    if (queued.getState && (await queued.getState()) === 'failed') {
      throw new Error(`Stage 6 lesson job ${queued.id ?? lesson.lesson_id} is already failed`);
    }
  }

  await dependencies.checkComplete(input.courseId);
}

export const stage6HandoffHandler = {
  async process(job: Job<Stage6HandoffJobData>): Promise<JobResult> {
    await runStage6Handoff(job.data);
    logger.info(
      { courseId: job.data.courseId, jobId: job.id },
      'Durable Stage 6 handoff completed'
    );
    return {
      success: true,
      message: 'Stage 6 handoff completed',
      data: { courseId: job.data.courseId },
    };
  },
};
