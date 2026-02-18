import { describe, it, expect } from 'vitest';
import { shouldSkipCompletionCheckForPartialGeneration } from '@/server/routers/lesson-content/helpers';

describe('shouldSkipCompletionCheckForPartialGeneration', () => {
  it('returns true when status is stage_6_complete', () => {
    expect(shouldSkipCompletionCheckForPartialGeneration('stage_6_complete')).toBe(true);
  });

  it('returns false when status is stage_6_generating', () => {
    expect(shouldSkipCompletionCheckForPartialGeneration('stage_6_generating')).toBe(false);
  });

  it('returns false for earlier pipeline statuses', () => {
    expect(shouldSkipCompletionCheckForPartialGeneration('stage_5_complete')).toBe(false);
    expect(shouldSkipCompletionCheckForPartialGeneration('stage_5_awaiting_approval')).toBe(false);
  });

  it('returns false for nullish/unknown status', () => {
    expect(shouldSkipCompletionCheckForPartialGeneration(null)).toBe(false);
    expect(shouldSkipCompletionCheckForPartialGeneration(undefined)).toBe(false);
    expect(shouldSkipCompletionCheckForPartialGeneration('completed')).toBe(false);
  });
});
