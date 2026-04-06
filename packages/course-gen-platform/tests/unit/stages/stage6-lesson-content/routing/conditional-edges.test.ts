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
  it('routes to truncation continuation when mode is set and cap not exceeded', () => {
    const state = buildState({
      // retry cap is ignored for truncation continuation; dedicated cap is used.
      retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES + 1,
      truncationCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS,
      regenerationMode: 'truncation_continuation',
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
    expect(state.needsHumanReview).toBeFalsy();
  });

  it('ends as review_required when truncation continuation cap is exceeded', () => {
    const state = buildState({
      retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES + 1,
      truncationCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS + 1,
      regenerationMode: 'truncation_continuation',
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
    expect(state.needsHumanReview).toBe(true);
    expect(state.reviewInfo?.needsReview).toBe(true);
    expect(state.errors[0]).toContain('Truncation continuation attempts exceeded');
  });

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

  it('routes to sectionRegenerator when section count is within cap', () => {
    const state = buildState({
      selfReviewResult: {
        status: 'PASS_WITH_FLAGS',
        reasoning: 'Only a few sections need regeneration',
        issues: [],
        patchedContent: null,
        tokensUsed: 0,
        durationMs: 10,
        heuristicsPassed: true,
        sectionsToRegenerate: Array.from(
          { length: HANDLER_CONFIG.MAX_SECTIONS_TO_REGENERATE },
          (_, index) => `section_${index + 1}`
        ),
      },
    });

    expect(shouldProceedToJudge(state)).toBe('sectionRegenerator');
    expect(state.needsHumanReview).toBeFalsy();
  });

  it('marks review_required when section regeneration request exceeds cap', () => {
    const state = buildState({
      selfReviewResult: {
        status: 'PASS_WITH_FLAGS',
        reasoning: 'Too many sections need regeneration',
        issues: [],
        patchedContent: null,
        tokensUsed: 0,
        durationMs: 10,
        heuristicsPassed: true,
        sectionsToRegenerate: Array.from(
          { length: HANDLER_CONFIG.MAX_SECTIONS_TO_REGENERATE + 1 },
          (_, index) => `section_${index + 1}`
        ),
      },
    });

    expect(shouldProceedToJudge(state)).toBe('__end__');
    expect(state.needsHumanReview).toBe(true);
    expect(state.reviewInfo?.needsReview).toBe(true);
    expect(state.errors[0]).toContain('Section regeneration request exceeds cap');
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
