import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { CourseStyle } from '@megacampus/shared-types';
import {
  enqueueStage6CourseBatch,
  enqueueStage6Lesson,
  type EnqueueStage6LessonOptions,
} from '../enqueue';

export interface EnqueueStage6StartLessonsInput {
  courseId: string;
  lessonSpecs: LessonSpecificationV2[];
  language: string;
  style?: CourseStyle;
  priority: number;
  batchEnabled: boolean;
  batchMaxWaitMs: number;
}

export async function enqueueStage6StartLessons(input: EnqueueStage6StartLessonsInput) {
  const options: EnqueueStage6LessonOptions[] = input.lessonSpecs.map(spec => ({
    jobData: {
      lessonSpec: spec,
      courseId: input.courseId,
      language: input.language,
      style: input.style,
      ragChunks: [],
      ragContextId: null,
      executionContext: 'full_generation',
    },
    jobName: `lesson:${spec.lesson_id}`,
    source: 'startStage6',
    priority: input.priority,
    deduplication: {
      kind: 'jobId',
      jobId: `stage6:${input.courseId}:${spec.lesson_id}`,
    },
  }));

  if (input.batchEnabled) {
    return (
      await enqueueStage6CourseBatch(options, {
        maxWaitMs: input.batchMaxWaitMs,
      })
    ).lessonJobs;
  }

  return Promise.all(options.map(enqueueStage6Lesson));
}
