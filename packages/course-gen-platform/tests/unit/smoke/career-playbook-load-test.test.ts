import { describe, expect, it, vi } from 'vitest';

import {
  buildCareerPlaybookLoadTestPlan,
  runCareerPlaybookLoadTest,
  type CareerPlaybookLoadRunObservation,
  type CareerPlaybookLoadTestOptions,
} from '@/smoke/career-playbook-load-test';
import {
  extractCareerPlaybookLoadCostUsd,
  parseCareerPlaybookLoadArgs,
} from '../../../scripts/career-playbook-load-test';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ORGANIZATION_ID = '22222222-2222-2222-2222-222222222222';
const QUEUE_NAME = 'career-playbook-load-20260810';

function mutationOptions(overrides: Partial<CareerPlaybookLoadTestOptions> = {}) {
  return {
    mode: 'mutation-load' as const,
    targetEnvironment: 'dev' as const,
    count: 10,
    trpcUrl: 'http://127.0.0.1:3310/trpc',
    token: 'secret-token',
    expectedUserId: USER_ID,
    expectedOrganizationId: ORGANIZATION_ID,
    queueName: QUEUE_NAME,
    cleanupScope: 'playbook-only' as const,
    maxCostUsdPerRun: 1,
    maxTotalCostUsd: 10,
    confirmLiveMutation: true,
    env: {
      CAREER_PLAYBOOK_SMOKE_REFRESH_TOKEN: 'refresh-secret',
      SUPABASE_URL: 'https://supabase.example.test',
      SUPABASE_ANON_KEY: 'anon-key',
    },
    ...overrides,
  };
}

function passedRun(runId: string, index: number): CareerPlaybookLoadRunObservation {
  return {
    runId,
    index,
    status: 'pass',
    playbookId: `playbook-${index}`,
    durationMs: 1_000 + index,
    costUsd: 0.1,
    costSource: 'runtime-artifact',
    artifactPaths: [`/tmp/${runId}.json`],
    cleanupManifest: {
      runId,
      targetEnvironment: 'dev',
      queueName: QUEUE_NAME,
      mutates: false,
      items: [
        {
          type: 'career_playbook',
          id: `playbook-${index}`,
          note: 'Delete by exact id.',
        },
      ],
    },
  };
}

describe('Career Playbook load-test plan', () => {
  it('keeps plan mode non-mutating and names every missing live gate', () => {
    const plan = buildCareerPlaybookLoadTestPlan({
      mode: 'plan',
      targetEnvironment: 'dev',
      count: 10,
      queueName: QUEUE_NAME,
      env: {},
    });

    expect(plan.mutates).toBe(false);
    expect(plan.status).toBe('blocked');
    expect(plan.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'run-count', status: 'pass' }),
        expect.objectContaining({ id: 'auth-token', status: 'blocked' }),
        expect.objectContaining({ id: 'auth-refresh-token', status: 'blocked' }),
        expect.objectContaining({ id: 'auth-refresh-config', status: 'blocked' }),
        expect.objectContaining({ id: 'expected-user-id', status: 'blocked' }),
        expect.objectContaining({ id: 'expected-organization-id', status: 'blocked' }),
        expect.objectContaining({ id: 'cleanup-scope', status: 'blocked' }),
        expect.objectContaining({ id: 'max-cost-usd-per-run', status: 'blocked' }),
        expect.objectContaining({ id: 'max-total-cost-usd', status: 'blocked' }),
        expect.objectContaining({ id: 'confirm-live-mutation', status: 'blocked' }),
      ])
    );
  });

  it('blocks a long load without refresh credentials for the disposable user', () => {
    const plan = buildCareerPlaybookLoadTestPlan(
      mutationOptions({
        env: {
          SUPABASE_URL: 'https://supabase.example.test',
          SUPABASE_ANON_KEY: 'anon-key',
        },
      })
    );

    expect(plan.status).toBe('blocked');
    expect(plan.checks).toContainEqual(
      expect.objectContaining({ id: 'auth-refresh-token', status: 'blocked' })
    );
  });

  it('blocks any live batch that is not exactly ten or understates the total budget', () => {
    const plan = buildCareerPlaybookLoadTestPlan(
      mutationOptions({ count: 9, maxCostUsdPerRun: 1, maxTotalCostUsd: 8 })
    );

    expect(plan.status).toBe('blocked');
    expect(plan.mutates).toBe(false);
    expect(plan.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'run-count', status: 'blocked' }),
        expect.objectContaining({ id: 'max-total-cost-usd', status: 'blocked' }),
      ])
    );
  });
});

describe('Career Playbook load-test CLI contract', () => {
  it('parses the explicit paid-run and budget gates without accepting positional input', () => {
    expect(
      parseCareerPlaybookLoadArgs([
        '--mode',
        'mutation-load',
        '--target',
        'dev',
        '--count',
        '10',
        '--max-cost-usd-per-run',
        '0.5',
        '--max-total-cost-usd',
        '5',
        '--cleanup-scope',
        'playbook-only',
        '--confirm-live-mutation',
        '--json',
      ])
    ).toMatchObject({
      mode: 'mutation-load',
      targetEnvironment: 'dev',
      count: 10,
      maxCostUsdPerRun: 0.5,
      maxTotalCostUsd: 5,
      cleanupScope: 'playbook-only',
      confirmLiveMutation: true,
      json: true,
    });

    expect(() => parseCareerPlaybookLoadArgs(['unexpected'])).toThrow(
      'Unknown argument: unexpected'
    );
  });

  it('reads total USD cost from either persisted runtime shape and rejects invalid values', () => {
    expect(extractCareerPlaybookLoadCostUsd({ total_cost_usd: 0.2404 })).toBe(0.2404);
    expect(extractCareerPlaybookLoadCostUsd({ totalCostUsd: 0.1278 })).toBe(0.1278);
    expect(extractCareerPlaybookLoadCostUsd({ total_cost_usd: 'unknown' })).toBeNull();
    expect(extractCareerPlaybookLoadCostUsd(null)).toBeNull();
  });
});

describe('Career Playbook 10-concurrent execution', () => {
  it('starts ten uniquely identified runs before awaiting their completion', async () => {
    let releaseRuns!: () => void;
    const release = new Promise<void>(resolve => {
      releaseRuns = resolve;
    });
    const started: Array<{ runId: string; index: number }> = [];

    const reportPromise = runCareerPlaybookLoadTest(mutationOptions(), {
      captureQueueState: phase =>
        Promise.resolve({
          phase,
          queueName: QUEUE_NAME,
          waiting: 0,
          active: 0,
          completed: phase === 'after' ? 10 : 0,
          failed: 0,
        }),
      runSingle: async input => {
        started.push(input);
        await release;
        return passedRun(input.runId, input.index);
      },
    });

    await vi.waitFor(() => expect(started).toHaveLength(10));
    expect(new Set(started.map(run => run.runId))).toHaveLength(10);

    releaseRuns();
    const report = await reportPromise;

    expect(report.status).toBe('pass');
    expect(report.runs).toHaveLength(10);
    expect(report.summary).toMatchObject({
      requested: 10,
      passed: 10,
      failed: 0,
      totalCostUsd: 1,
    });
    expect(report.queue.before.queueName).toBe(QUEUE_NAME);
    expect(report.queue.after.active).toBe(0);
    expect(report.queue.after.waiting).toBe(0);
  });

  it('fails the batch but preserves cleanup evidence when one run or the queue is unhealthy', async () => {
    const report = await runCareerPlaybookLoadTest(mutationOptions(), {
      captureQueueState: phase =>
        Promise.resolve({
          phase,
          queueName: QUEUE_NAME,
          waiting: phase === 'after' ? 1 : 0,
          active: 0,
          completed: phase === 'after' ? 9 : 0,
          failed: phase === 'after' ? 1 : 0,
        }),
      runSingle: input => {
        const result = passedRun(input.runId, input.index);
        return Promise.resolve(
          input.index === 4 ? { ...result, status: 'fail', error: 'generation failed' } : result
        );
      },
    });

    expect(report.status).toBe('fail');
    expect(report.summary).toMatchObject({ requested: 10, passed: 9, failed: 1 });
    expect(report.runs).toHaveLength(10);
    expect(report.runs.every(run => run.cleanupManifest?.items.length === 1)).toBe(true);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'terminal-runs', status: 'fail' }),
        expect.objectContaining({ id: 'post-run-queue', status: 'fail' }),
      ])
    );
  });

  it('fails the batch when any completed run lacks measured cost evidence', async () => {
    const report = await runCareerPlaybookLoadTest(mutationOptions(), {
      captureQueueState: phase =>
        Promise.resolve({
          phase,
          queueName: QUEUE_NAME,
          waiting: 0,
          active: 0,
          completed: phase === 'after' ? 10 : 0,
          failed: 0,
        }),
      runSingle: input => {
        const result = passedRun(input.runId, input.index);
        return Promise.resolve(input.index === 6 ? { ...result, costUsd: null } : result);
      },
    });

    expect(report.status).toBe('fail');
    expect(report.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'cost-evidence', status: 'fail' })])
    );
  });

  it('fails the batch when a measured run exceeds its approved USD ceiling', async () => {
    const report = await runCareerPlaybookLoadTest(
      mutationOptions({ maxCostUsdPerRun: 0.5, maxTotalCostUsd: 5 }),
      {
        captureQueueState: phase =>
          Promise.resolve({
            phase,
            queueName: QUEUE_NAME,
            waiting: 0,
            active: 0,
            completed: phase === 'after' ? 10 : 0,
            failed: 0,
          }),
        runSingle: input => {
          const result = passedRun(input.runId, input.index);
          return Promise.resolve(input.index === 2 ? { ...result, costUsd: 0.51 } : result);
        },
      }
    );

    expect(report.status).toBe('fail');
    expect(report.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'cost-ceilings', status: 'fail' })])
    );
  });
});
