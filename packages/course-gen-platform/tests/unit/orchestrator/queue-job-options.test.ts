import { describe, expect, it, vi } from 'vitest';
import { CAREER_PLAYBOOK_MAX_ATTEMPTS, resolveJobOptions } from '@/orchestrator/queue';
import { DEFAULT_JOB_OPTIONS, JobType } from '@megacampus/shared-types';

// resolveJobOptions never logs; this only keeps pino quiet during the run.
vi.mock('@/shared/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('resolveJobOptions — Career Playbook TTL runaway cap (mc2-1maah)', () => {
  it('caps CAREER_PLAYBOOK jobs at 1 attempt so a TTL hard-kill cannot spawn full re-runs', () => {
    const options = resolveJobOptions(JobType.CAREER_PLAYBOOK);

    expect(CAREER_PLAYBOOK_MAX_ATTEMPTS).toBe(1);
    expect(options.attempts).toBe(1);

    // Regression guard: the shared-types default (the source of the ~3x cost
    // incident) is still 3, so the cap really is doing the work.
    expect(DEFAULT_JOB_OPTIONS[JobType.CAREER_PLAYBOOK].attempts).toBe(3);
    expect(options.attempts).not.toBe(DEFAULT_JOB_OPTIONS[JobType.CAREER_PLAYBOOK].attempts);
  });

  it('forces the cap even when a caller passes a higher attempts override', () => {
    const options = resolveJobOptions(JobType.CAREER_PLAYBOOK, { attempts: 5, jobId: 'cp-1' });

    expect(options.attempts).toBe(1);
    // Non-attempts overrides are still honored.
    expect(options.jobId).toBe('cp-1');
  });

  it('preserves the rest of the CAREER_PLAYBOOK defaults (only attempts changes)', () => {
    const options = resolveJobOptions(JobType.CAREER_PLAYBOOK);
    const defaults = DEFAULT_JOB_OPTIONS[JobType.CAREER_PLAYBOOK];

    expect(options).toEqual({ ...defaults, attempts: CAREER_PLAYBOOK_MAX_ATTEMPTS });
    // timeout / backoff / priority etc. must be untouched.
    expect(options.timeout).toBe(defaults.timeout);
    expect(options.priority).toBe(defaults.priority);
  });

  it('leaves every non-CAREER_PLAYBOOK default byte-for-byte unchanged', () => {
    for (const jobType of Object.values(JobType)) {
      if (jobType === JobType.CAREER_PLAYBOOK) continue;
      expect(resolveJobOptions(jobType)).toEqual(DEFAULT_JOB_OPTIONS[jobType]);
    }

    // Spot-check that ordinary jobs keep their retry counts (regression proof
    // that the cost fix is scoped to Career Playbook only).
    expect(resolveJobOptions(JobType.DOCUMENT_PROCESSING).attempts).toBe(5);
    expect(resolveJobOptions(JobType.STRUCTURE_GENERATION).attempts).toBe(3);
  });

  it('merges caller overrides for non-CAREER_PLAYBOOK jobs exactly as the previous inline merge', () => {
    const custom = { jobId: 'job-42', priority: 9 };

    expect(resolveJobOptions(JobType.STRUCTURE_ANALYSIS, custom)).toEqual({
      ...DEFAULT_JOB_OPTIONS[JobType.STRUCTURE_ANALYSIS],
      ...custom,
    });
  });
});
