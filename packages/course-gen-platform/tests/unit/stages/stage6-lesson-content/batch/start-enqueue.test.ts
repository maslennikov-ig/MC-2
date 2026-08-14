import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

const { enqueueLessonMock, enqueueCourseBatchMock } = vi.hoisted(() => ({
  enqueueLessonMock: vi.fn(),
  enqueueCourseBatchMock: vi.fn(),
}));

vi.mock('@/stages/stage6-lesson-content/enqueue', () => ({
  enqueueStage6Lesson: enqueueLessonMock,
  enqueueStage6CourseBatch: enqueueCourseBatchMock,
}));

import { enqueueStage6StartLessons } from '@/stages/stage6-lesson-content/batch/start-enqueue';

const lessons = Array.from({ length: 10 }, (_, index) => ({
  lesson_id: `2.${index + 1}`,
  title: `Lesson ${index + 1}`,
  sections: [],
})) as LessonSpecificationV2[];

describe('enqueueStage6StartLessons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueLessonMock.mockImplementation(async options => ({ id: options.jobName }));
    enqueueCourseBatchMock.mockResolvedValue({
      lessonJobs: lessons.map(lesson => ({ id: `lesson:${lesson.lesson_id}` })),
      coordinatorJob: { id: 'coordinator' },
    });
  });

  it('preserves the existing ten-job path when the flag is disabled', async () => {
    const jobs = await enqueueStage6StartLessons({
      courseId: 'course-id',
      lessonSpecs: lessons,
      language: 'en',
      style: 'professional',
      priority: 5,
      batchEnabled: false,
      batchMaxWaitMs: 7_200_000,
    });

    expect(jobs).toHaveLength(10);
    expect(enqueueLessonMock).toHaveBeenCalledTimes(10);
    expect(enqueueCourseBatchMock).not.toHaveBeenCalled();
  });

  it('uses one course coordinator when the flag is enabled while returning ten lesson jobs', async () => {
    const jobs = await enqueueStage6StartLessons({
      courseId: 'course-id',
      lessonSpecs: lessons,
      language: 'en',
      style: 'professional',
      priority: 5,
      batchEnabled: true,
      batchMaxWaitMs: 7_200_000,
    });

    expect(jobs).toHaveLength(10);
    expect(enqueueLessonMock).not.toHaveBeenCalled();
    expect(enqueueCourseBatchMock).toHaveBeenCalledTimes(1);
    const options = enqueueCourseBatchMock.mock.calls[0][0];
    expect(options).toHaveLength(10);
    expect(enqueueCourseBatchMock).toHaveBeenCalledWith(options, { maxWaitMs: 7_200_000 });
  });
});
