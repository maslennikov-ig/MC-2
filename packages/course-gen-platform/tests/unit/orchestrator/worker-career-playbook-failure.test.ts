import type { Job } from 'bullmq';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { JobType, type CareerPlaybookJobData, type JobData } from '@megacampus/shared-types';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mocks.from,
  })),
}));

import { markCareerPlaybookGenerationFailedAfterWorkerFailure } from '@/orchestrator/worker';

const playbookId = '00000000-0000-4000-8000-000000000001';

function createBuilder(results: Array<{ data: unknown; error: unknown }> = []) {
  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() =>
      Promise.resolve(results.shift() ?? { data: null, error: new Error('No mocked result') })
    ),
  };

  return builder;
}

function createJob(overrides: Partial<Job<CareerPlaybookJobData>> = {}) {
  const data: CareerPlaybookJobData = {
    jobType: JobType.CAREER_PLAYBOOK,
    operation: 'GENERATE_PLAYBOOK',
    playbookId,
    userId: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-000000000003',
    language: 'en',
    locale: 'en',
    createdAt: '2026-05-20T00:00:00.000Z',
    qaData: {
      fixed: [{ question_key: 'position', value: 'Product Lead' }],
      followups: [],
      freeform: [],
    },
  };

  return {
    id: 'job-1',
    name: JobType.CAREER_PLAYBOOK,
    data,
    attemptsMade: 3,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<JobData>;
}

describe('Career Playbook worker failure safety net', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a final failed GENERATE_PLAYBOOK worker job as failed without a courseId', async () => {
    const builder = createBuilder([
      {
        data: {
          status: 'generating',
          q_a_data: {
            fixed: [{ question_key: 'position', value: 'Stored Product Lead' }],
            followups: [],
            freeform: [],
          },
        },
        error: null,
      },
      { data: { id: playbookId }, error: null },
    ]);
    mocks.from.mockReturnValue(builder);

    await expect(
      markCareerPlaybookGenerationFailedAfterWorkerFailure(
        createJob(),
        new Error('Processor TTL exceeded')
      )
    ).resolves.toBe(true);

    expect(mocks.from).toHaveBeenCalledWith('career_playbooks');
    expect(builder.update).toHaveBeenCalledWith({
      status: 'failed',
      q_a_data: {
        fixed: [{ question_key: 'position', value: 'Stored Product Lead' }],
        followups: [],
        freeform: [],
        generation_error: 'Processor TTL exceeded',
      },
    });
    expect(builder.eq).toHaveBeenCalledWith('id', playbookId);
    expect(builder.eq).toHaveBeenCalledWith('status', 'generating');
  });

  it('does not mark a retryable GENERATE_PLAYBOOK worker failure as failed before final attempt', async () => {
    await expect(
      markCareerPlaybookGenerationFailedAfterWorkerFailure(
        createJob({ attemptsMade: 1, opts: { attempts: 3 } }),
        new Error('temporary provider outage')
      )
    ).resolves.toBe(false);

    expect(mocks.from).not.toHaveBeenCalled();
  });
});
