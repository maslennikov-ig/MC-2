import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS,
  DEFAULT_PROCESSOR_MAX_TTL_MS,
  getCareerPlaybookProcessorMaxTtlMs,
  getDefaultProcessorMaxTtlMs,
  getProcessorMaxTtlMsForJobType,
  getWorkerLockDurationMs,
} from '@/orchestrator/processor-ttl';
import { JobType } from '@megacampus/shared-types';

describe('processor TTL configuration', () => {
  const originalProcessorTtl = process.env.PROCESSOR_MAX_TTL_MS;
  const originalCareerPlaybookTtl = process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS;

  afterEach(() => {
    if (originalProcessorTtl === undefined) {
      delete process.env.PROCESSOR_MAX_TTL_MS;
    } else {
      process.env.PROCESSOR_MAX_TTL_MS = originalProcessorTtl;
    }

    if (originalCareerPlaybookTtl === undefined) {
      delete process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS;
    } else {
      process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS = originalCareerPlaybookTtl;
    }
  });

  it('keeps ordinary jobs on the standard processor TTL', () => {
    delete process.env.PROCESSOR_MAX_TTL_MS;
    delete process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS;

    expect(getDefaultProcessorMaxTtlMs()).toBe(DEFAULT_PROCESSOR_MAX_TTL_MS);
    expect(getProcessorMaxTtlMsForJobType(JobType.STRUCTURE_GENERATION)).toBe(
      DEFAULT_PROCESSOR_MAX_TTL_MS
    );
  });

  it('uses the longer default TTL for Career Playbook generation jobs', () => {
    delete process.env.PROCESSOR_MAX_TTL_MS;
    delete process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS;

    expect(getCareerPlaybookProcessorMaxTtlMs()).toBe(DEFAULT_CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS);
    expect(getProcessorMaxTtlMsForJobType(JobType.CAREER_PLAYBOOK)).toBe(
      DEFAULT_CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS
    );
  });

  it('uses the maximum configured job TTL for worker lock duration', () => {
    process.env.PROCESSOR_MAX_TTL_MS = '3000000';
    process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS = '9000000';

    expect(getWorkerLockDurationMs()).toBe(9_000_000);
  });

  it('ignores invalid TTL environment values', () => {
    process.env.PROCESSOR_MAX_TTL_MS = '-1';
    process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS = 'not-a-number';

    expect(getDefaultProcessorMaxTtlMs()).toBe(DEFAULT_PROCESSOR_MAX_TTL_MS);
    expect(getCareerPlaybookProcessorMaxTtlMs()).toBe(DEFAULT_CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS);
  });
});
