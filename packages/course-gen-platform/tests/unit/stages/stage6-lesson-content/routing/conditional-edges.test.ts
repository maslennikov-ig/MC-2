import { describe, expect, it } from 'vitest';
import {
  shouldProceedToJudge,
  shouldRetryAfterJudge,
} from '@/stages/stage6-lesson-content/routing/conditional-edges';
import { HANDLER_CONFIG } from '@/stages/stage6-lesson-content/config';
import type { LessonGraphStateType } from '@/stages/stage6-lesson-content/state';

function buildState(overrides: Partial<LessonGraphStateType> = {}): LessonGraphStateType {
  return {
    lessonSpec: { lesson_id: '1.1', title: 'Test lesson' } as LessonGraphStateType['lessonSpec'],
    retryCount: 0,
    selfReviewResult: null,
    errors: [],
    ...overrides,
  } as LessonGraphStateType;
}

describe('shouldProceedToJudge', () => {
  it('routes to generator for REGENERATE while retries are below cap', () => {
    const state = buildState({
      retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES - 1,
      selfReviewResult: {
        status: 'REGENERATE',
        reasoning: 'Critical truncation',
        issues: [
          {
            type: 'TRUNCATION',
            severity: 'CRITICAL',
            location: 'global',
            description: 'Cut off',
          },
        ],
        patchedContent: null,
        tokensUsed: 0,
        durationMs: 10,
        heuristicsPassed: false,
      },
    });

    expect(shouldProceedToJudge(state)).toBe('generator');
    expect(state.errors).toEqual([]);
  });

  it('ends and records explicit error when REGENERATE retries exceed cap', () => {
    const state = buildState({
      retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES,
      selfReviewResult: {
        status: 'REGENERATE',
        reasoning: 'Critical truncation',
        issues: [
          {
            type: 'TRUNCATION',
            severity: 'CRITICAL',
            location: 'global',
            description: 'Cut off',
          },
        ],
        patchedContent: null,
        tokensUsed: 0,
        durationMs: 10,
        heuristicsPassed: false,
      },
    });

    expect(shouldProceedToJudge(state)).toBe('__end__');
    expect(state.errors[0]).toContain('Self-review regeneration retries exceeded');
    expect(state.needsHumanReview).toBe(true);
    expect(state.reviewInfo?.needsReview).toBe(true);
  });
});

describe('shouldRetryAfterJudge', () => {
  it('marks review_required instead of hard failing when judge retries exceed cap', () => {
    const state = buildState({
      retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES,
      needsRegeneration: true,
      qualityScore: 0.61,
    });

    expect(shouldRetryAfterJudge(state)).toBe('__end__');
    expect(state.needsHumanReview).toBe(true);
    expect(state.reviewInfo?.needsReview).toBe(true);
    expect(state.errors[0]).toContain('Max regeneration retries');
  });
});
