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

describe('shouldProceedToJudge (pure routing — reads state set by node)', () => {
  it('routes to generator when regenerationMode=truncation_continuation (set by node)', () => {
    const state = buildState({
      retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES + 1,
      truncationCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS,
      regenerationMode: 'truncation_continuation',
      selfReviewResult: {
        status: 'REGENERATE',
        reasoning: 'Critical truncation',
        issues: [
          { type: 'TRUNCATION', severity: 'CRITICAL', location: 'global', description: 'Cut off' },
        ],
        patchedContent: null,
        tokensUsed: 0,
        durationMs: 10,
        heuristicsPassed: false,
      },
    });

    expect(shouldProceedToJudge(state)).toBe('generator');
  });

  it('routes to generator when node escalated to full_regenerate (channel-safe)', () => {
    // Node detected truncation cap exceeded, set regenerationMode=full_regenerate
    const state = buildState({
      retryCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS + 1,
      truncationCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS + 1,
      regenerateCount: 1, // node incremented
      regenerationMode: 'full_regenerate', // node escalated from truncation_continuation
      selfReviewResult: {
        status: 'REGENERATE',
        reasoning: 'Critical truncation',
        issues: [
          { type: 'TRUNCATION', severity: 'CRITICAL', location: 'global', description: 'Cut off' },
        ],
        patchedContent: null,
        tokensUsed: 0,
        durationMs: 10,
        heuristicsPassed: false,
      },
    });

    expect(shouldProceedToJudge(state)).toBe('generator');
    // Routing must NOT mutate state — these are already set by node
    expect(state.regenerationMode).toBe('full_regenerate');
    expect(state.regenerateCount).toBe(1);
  });

  it('ends graph when node set needsHumanReview=true (all budgets exhausted)', () => {
    // Node detected both truncation and full_regenerate budgets exhausted
    const state = buildState({
      retryCount:
        HANDLER_CONFIG.MAX_REGENERATION_RETRIES +
        HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS +
        1,
      truncationCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS + 1,
      regenerateCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES,
      regenerationMode: 'truncation_continuation',
      needsHumanReview: true, // set by node via applyChannelSafeEscalation
      reviewInfo: {
        needsReview: true,
        reasons: [
          'Truncation continuation attempts exceeded (2). Marked as review_required (fail-open).',
        ],
      },
      selfReviewResult: {
        status: 'REGENERATE',
        reasoning: 'Critical truncation',
        issues: [
          { type: 'TRUNCATION', severity: 'CRITICAL', location: 'global', description: 'Cut off' },
        ],
        patchedContent: null,
        tokensUsed: 0,
        durationMs: 10,
        heuristicsPassed: false,
      },
    });

    expect(shouldProceedToJudge(state)).toBe('__end__');
  });

  it('ends graph when node set needsHumanReview for full_regenerate retry cap', () => {
    // Node detected retryCount >= MAX_REGENERATION_RETRIES for full_regenerate path
    const state = buildState({
      retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES,
      regenerationMode: 'full_regenerate',
      needsHumanReview: true, // set by node
      reviewInfo: {
        needsReview: true,
        reasons: ['Self-review regeneration retries exceeded (2). Last status: REGENERATE.'],
      },
      selfReviewResult: {
        status: 'REGENERATE',
        reasoning: 'Alignment issues',
        issues: [
          {
            type: 'ALIGNMENT',
            severity: 'CRITICAL',
            location: 'global',
            description: 'Misaligned',
          },
        ],
        patchedContent: null,
        tokensUsed: 0,
        durationMs: 10,
        heuristicsPassed: false,
      },
    });

    expect(shouldProceedToJudge(state)).toBe('__end__');
  });

  it('routes to generator for REGENERATE with full_regenerate mode below cap', () => {
    const state = buildState({
      retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES - 1,
      regenerationMode: 'full_regenerate',
      selfReviewResult: {
        status: 'REGENERATE',
        reasoning: 'Critical truncation',
        issues: [
          { type: 'TRUNCATION', severity: 'CRITICAL', location: 'global', description: 'Cut off' },
        ],
        patchedContent: null,
        tokensUsed: 0,
        durationMs: 10,
        heuristicsPassed: false,
      },
    });

    expect(shouldProceedToJudge(state)).toBe('generator');
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
  });

  it('ends graph when section regeneration cap exceeded (terminal state set by node)', () => {
    // Node already set needsHumanReview + reviewInfo for section-cap exceeded
    const state = buildState({
      needsHumanReview: true,
      reviewInfo: {
        needsReview: true,
        reasons: ['Section regeneration request exceeds cap (3). Requested 4 sections, skipped 1.'],
      },
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

    // The routing function just reads the section count and returns __end__
    expect(shouldProceedToJudge(state)).toBe('__end__');
  });
});

describe('shouldRetryAfterJudge (pure routing)', () => {
  it('ends graph when judge retries exceed cap', () => {
    const state = buildState({
      retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES,
      needsRegeneration: true,
      qualityScore: 0.61,
    });

    expect(shouldRetryAfterJudge(state)).toBe('__end__');
  });

  it('routes to generator when retries below cap and regeneration needed', () => {
    const state = buildState({
      retryCount: 0,
      needsRegeneration: true,
    });

    expect(shouldRetryAfterJudge(state)).toBe('generator');
  });
});
