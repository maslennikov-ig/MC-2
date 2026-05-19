import { describe, expect, it } from 'vitest';
import { JobType } from '@megacampus/shared-types';

import { shouldRemoveJobForCourseCleanup } from '@/orchestrator/queue';

describe('orchestrator queue cleanup classification', () => {
  it('does not treat Career Playbook jobs without courseId as orphaned course jobs', () => {
    expect(
      shouldRemoveJobForCourseCleanup(
        {
          jobType: JobType.CAREER_PLAYBOOK,
          playbookId: '00000000-0000-4000-8000-000000000001',
        },
        '11111111-1111-4111-8111-111111111111'
      )
    ).toEqual({
      remove: false,
      reason: 'non_course_job',
    });
  });

  it('still removes corrupted jobs without data and jobs belonging to the target course', () => {
    expect(
      shouldRemoveJobForCourseCleanup(undefined, '11111111-1111-4111-8111-111111111111')
    ).toEqual({
      remove: true,
      reason: 'orphaned',
    });
    expect(
      shouldRemoveJobForCourseCleanup(
        {
          jobType: JobType.TEXT_GENERATION,
          courseId: '11111111-1111-4111-8111-111111111111',
        },
        '11111111-1111-4111-8111-111111111111'
      )
    ).toEqual({
      remove: true,
      reason: 'course_deletion',
    });
  });
});
