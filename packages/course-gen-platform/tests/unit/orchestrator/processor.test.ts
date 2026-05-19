import { describe, expect, it } from 'vitest';
import { JobType } from '@megacampus/shared-types';
import { isJobTypeRegistered } from '@/orchestrator/processor';

describe('sandbox processor registry', () => {
  it('registers Career Playbook jobs with the sandbox processor', () => {
    expect(isJobTypeRegistered(JobType.CAREER_PLAYBOOK)).toBe(true);
  });
});
