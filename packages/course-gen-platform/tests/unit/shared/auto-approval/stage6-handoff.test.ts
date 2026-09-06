import { describe, expect, it, vi } from 'vitest';

vi.mock('@/orchestrator/queue', () => ({ addJob: vi.fn() }));

import {
  claimStage6Generating,
  runStage6Handoff,
  type Stage6HandoffDependencies,
} from '@/orchestrator/handlers/stage6-handoff-handler';
import { queueStage6Jobs } from '@/shared/auto-approval/helpers';
import { addJob } from '@/orchestrator/queue';
import { DEFAULT_JOB_OPTIONS, JobDataSchema, JobType } from '@megacampus/shared-types';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const BASE_JOB_DATA = {
  organizationId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
  createdAt: '2026-09-06T00:00:00.000Z',
  locale: 'en' as const,
};

const course = (status: 'stage_6_init' | 'stage_6_generating' = 'stage_6_init') => ({
  generation_status: status,
  course_structure: {
    sections: [
      {
        section_title: 'Section',
        section_number: 1,
        lessons: [
          { lesson_title: 'One', lesson_number: 1 },
          { lesson_title: 'Two', lesson_number: 2 },
        ],
      },
    ],
  },
  language: 'en',
  style: 'professional',
  title: 'Course',
  analysis_result: null,
});

function dependencies(
  overrides: Partial<Stage6HandoffDependencies> = {}
): Stage6HandoffDependencies {
  return {
    loadCourse: vi.fn().mockResolvedValue(course()),
    claimGenerating: vi.fn().mockResolvedValue(undefined),
    enqueueLesson: vi.fn().mockResolvedValue({ id: 'lesson-job' }),
    checkComplete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('Stage 6 durable handoff', () => {
  it('queues one retryable course handoff instead of lesson jobs in the Stage 5 worker', async () => {
    vi.mocked(addJob).mockResolvedValue({ id: 'handoff' } as never);

    await queueStage6Jobs(COURSE_ID, 5, BASE_JOB_DATA);

    expect(addJob).toHaveBeenCalledWith(
      JobType.STAGE6_HANDOFF,
      {
        ...BASE_JOB_DATA,
        jobType: JobType.STAGE6_HANDOFF,
        courseId: COURSE_ID,
        priority: 5,
      },
      { priority: 5, jobId: `auto-${COURSE_ID}-stage6-handoff` }
    );
    expect(DEFAULT_JOB_OPTIONS[JobType.STAGE6_HANDOFF].attempts).toBe(3);
    expect(
      JobDataSchema.parse({
        ...BASE_JOB_DATA,
        jobType: JobType.STAGE6_HANDOFF,
        courseId: COURSE_ID,
        priority: 5,
      })
    ).toEqual({
      ...BASE_JOB_DATA,
      jobType: JobType.STAGE6_HANDOFF,
      courseId: COURSE_ID,
      priority: 5,
    });
  });

  it('claims generating before a fast lesson can hit course_inactive_unrecoverable', async () => {
    const events: string[] = [];
    let courseIsGenerating = false;
    const oneLesson = course();
    oneLesson.course_structure.sections[0].lessons.splice(1);
    const deps = dependencies({
      loadCourse: vi.fn().mockResolvedValue(oneLesson),
      claimGenerating: vi.fn(() => {
        courseIsGenerating = true;
        events.push('claimed');
        return Promise.resolve();
      }),
      enqueueLesson: vi.fn(() => {
        if (!courseIsGenerating) throw new Error('course_inactive_unrecoverable');
        events.push('lesson-completed');
        return Promise.resolve({ id: 'lesson-job' } as never);
      }),
      checkComplete: vi.fn(() => {
        events.push('completion-rechecked');
        return Promise.resolve();
      }),
    });

    await runStage6Handoff({ courseId: COURSE_ID, priority: 5 }, deps);

    expect(events).toEqual(['claimed', 'lesson-completed', 'completion-rechecked']);
  });

  it('fails closed when the stage_6_init claim updates zero rows', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const statusEq = vi.fn().mockReturnValue({ select });
    const idEq = vi.fn().mockReturnValue({ eq: statusEq });
    const update = vi.fn().mockReturnValue({ eq: idEq });
    const supabase = { from: vi.fn().mockReturnValue({ update }) };

    await expect(
      claimStage6Generating(supabase as never, COURSE_ID, 'stage_6_init')
    ).rejects.toThrow('updated 0 rows');

    const deps = dependencies({
      claimGenerating: vi.fn().mockRejectedValue(new Error('updated 0 rows')),
    });
    await expect(runStage6Handoff({ courseId: COURSE_ID, priority: 5 }, deps)).rejects.toThrow(
      'updated 0 rows'
    );
    expect(vi.mocked(deps.enqueueLesson)).not.toHaveBeenCalled();
    expect(vi.mocked(deps.checkComplete)).not.toHaveBeenCalled();
  });

  it('retries a partial fanout with stable lesson job IDs and rechecks completion once', async () => {
    const firstEnqueue = vi
      .fn()
      .mockResolvedValueOnce({ id: 'first' })
      .mockRejectedValueOnce(new Error('Redis unavailable'));
    const first = dependencies({ enqueueLesson: firstEnqueue });

    await expect(runStage6Handoff({ courseId: COURSE_ID, priority: 5 }, first)).rejects.toThrow(
      'Redis unavailable'
    );
    expect(vi.mocked(first.checkComplete)).not.toHaveBeenCalled();

    const secondEnqueue = vi.fn().mockResolvedValue({ id: 'deduplicated-or-new' });
    const retry = dependencies({
      loadCourse: vi.fn().mockResolvedValue(course('stage_6_generating')),
      enqueueLesson: secondEnqueue,
    });

    await runStage6Handoff({ courseId: COURSE_ID, priority: 5 }, retry);

    const firstAttemptIds = firstEnqueue.mock.calls.map(call => call[0].deduplication.jobId);
    const retryIds = secondEnqueue.mock.calls.map(call => call[0].deduplication.jobId);
    expect(firstAttemptIds).toEqual([
      `auto-${COURSE_ID}-stage6-lesson-1.1`,
      `auto-${COURSE_ID}-stage6-lesson-1.2`,
    ]);
    expect(retryIds).toEqual(firstAttemptIds);
    expect(vi.mocked(retry.claimGenerating)).toHaveBeenCalledWith(
      COURSE_ID,
      'stage_6_generating'
    );
    expect(vi.mocked(retry.checkComplete)).toHaveBeenCalledTimes(1);
  });

  it('does not report an existing failed lesson job as recovered', async () => {
    const deps = dependencies({
      enqueueLesson: vi.fn().mockResolvedValue({
        id: 'failed-lesson',
        getState: () => Promise.resolve('failed'),
      }),
    });

    await expect(runStage6Handoff({ courseId: COURSE_ID, priority: 5 }, deps)).rejects.toThrow(
      'lesson job failed-lesson is already failed'
    );
    expect(vi.mocked(deps.checkComplete)).not.toHaveBeenCalled();
  });
});
