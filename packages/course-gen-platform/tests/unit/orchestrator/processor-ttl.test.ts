import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS,
  DEFAULT_PROCESSOR_MAX_TTL_MS,
  DEFAULT_PROCESSOR_SOFT_BUDGET_RATIO,
  getCareerPlaybookProcessorMaxTtlMs,
  getDefaultProcessorMaxTtlMs,
  getProcessorMaxTtlMsForJobType,
  getProcessorSoftBudgetMs,
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

  it('emits the soft-budget marker strictly before the hard TTL kill for Career Playbook', () => {
    delete process.env.PROCESSOR_MAX_TTL_MS;
    delete process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS;

    const softBudget = getProcessorSoftBudgetMs(JobType.CAREER_PLAYBOOK);
    const hardTtl = getProcessorMaxTtlMsForJobType(JobType.CAREER_PLAYBOOK);

    expect(DEFAULT_PROCESSOR_SOFT_BUDGET_RATIO).toBeGreaterThan(0);
    expect(DEFAULT_PROCESSOR_SOFT_BUDGET_RATIO).toBeLessThan(1);
    expect(softBudget).toBe(
      Math.floor(DEFAULT_CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS * DEFAULT_PROCESSOR_SOFT_BUDGET_RATIO)
    );
    // The whole point of the marker: it fires before the terminal hard kill.
    expect(softBudget).toBeGreaterThan(0);
    expect(softBudget).toBeLessThan(hardTtl);
  });

  it('disables the soft budget for non-Career-Playbook jobs (they keep their exact behavior)', () => {
    delete process.env.PROCESSOR_MAX_TTL_MS;
    delete process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS;

    expect(getProcessorSoftBudgetMs(JobType.STRUCTURE_GENERATION)).toBe(0);
    expect(getProcessorSoftBudgetMs(JobType.DOCUMENT_PROCESSING)).toBe(0);
    expect(getProcessorSoftBudgetMs(undefined)).toBe(0);
  });

  it('tracks env-configured TTL overrides for the soft budget', () => {
    process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS = '6000000';

    expect(getProcessorSoftBudgetMs(JobType.CAREER_PLAYBOOK)).toBe(Math.floor(6_000_000 * 0.9));
  });

  it('disables the soft budget (returns 0) when the ratio is out of the (0,1) range', () => {
    delete process.env.CAREER_PLAYBOOK_PROCESSOR_MAX_TTL_MS;

    expect(getProcessorSoftBudgetMs(JobType.CAREER_PLAYBOOK, 0)).toBe(0);
    expect(getProcessorSoftBudgetMs(JobType.CAREER_PLAYBOOK, 1)).toBe(0);
    expect(getProcessorSoftBudgetMs(JobType.CAREER_PLAYBOOK, 1.5)).toBe(0);
  });
});
