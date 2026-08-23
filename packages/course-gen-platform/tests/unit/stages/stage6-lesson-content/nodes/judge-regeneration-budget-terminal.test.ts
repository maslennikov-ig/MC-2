/**
 * The judge ends the lesson itself when its regeneration budget runs out.
 * @module stages/stage6-lesson-content/nodes/judge-regeneration-budget-terminal.test
 *
 * Before 2026-08-23 it asked for a regeneration the routing function then
 * refused, and the graph ended with needsHumanReview false, no reviewInfo and no
 * content — leaving `executeStage6`'s safety net to reconstruct all three while
 * calling itself rare. mc2-51epl warnings 3 and 6 are the two log lines that
 * pair produced on an ordinary run.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JudgeContext } from '@/stages/stage6-lesson-content/nodes/judge-node-helpers';
import { HANDLER_CONFIG } from '@/stages/stage6-lesson-content/config';

vi.mock('@/shared/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/shared/trace-logger', () => ({ logTrace: vi.fn() }));

vi.mock('@/stages/stage6-lesson-content/judge/judge-output-builder', () => ({
  buildEnrichedJudgeOutput: vi.fn(() => ({ judge: [] })),
  extractJudgeModels: vi.fn(() => []),
}));

vi.mock('@/stages/stage6-lesson-content/judge/judge-progress', () => ({
  buildJudgeProgressSummary: vi.fn(() => ({ attempts: [] })),
}));

vi.mock('@/stages/stage6-lesson-content/nodes/judge-refinement-helpers', () => ({
  executeTargetedRefinementFlow: vi.fn(),
  buildReviewInfo: vi.fn(() => null),
  buildFactualWarnings: vi.fn(() => null),
}));

import { finalizeJudgeResult } from '@/stages/stage6-lesson-content/nodes/judge-node-helpers';
import { shouldRetryAfterJudge } from '@/stages/stage6-lesson-content/routing/conditional-edges';

/**
 * A context in the shape `processJudgeDecision` returns after it decided
 * REGENERATE: no content, a score, and the regeneration flag set.
 */
function regenerateContext(retryCount: number): JudgeContext {
  return {
    state: {
      lessonSpec: { lesson_id: '1.3', title: 'Test Lesson' },
      courseId: 'course-1',
      language: 'ru',
      retryCount,
      regenerateCount: retryCount,
      progressSummary: null,
    } as JudgeContext['state'],
    startTime: Date.now(),
    finalContent: null,
    finalScore: 0.62,
    finalRecommendation: 'REGENERATE',
    needsRegeneration: true,
    needsHumanReview: false,
    refinementTokensUsed: 0,
    arbiterOutput: null,
    mermaidRenderValidation: null,
    tableFixMetrics: null,
    sourceGroundingRemediation: null,
    qaSignals: null,
    cascadeResult: {
      stage: 'heuristic',
      totalTokensUsed: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      finalScore: 0.62,
      finalRecommendation: 'REGENERATE',
    } as unknown as JudgeContext['cascadeResult'],
    decision: null,
  } as unknown as JudgeContext;
}

describe('judge regeneration budget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for another attempt while the budget allows one', async () => {
    const update = await finalizeJudgeResult(regenerateContext(0));

    expect(update.needsRegeneration).toBe(true);
    expect(update.needsHumanReview).toBe(false);
    expect(update.retryCount).toBe(1);
    expect(update.regenerationMode).toBe('full_regenerate');
    // The routing function sends it back to the generator, as before.
    expect(
      shouldRetryAfterJudge({
        ...regenerateContext(0).state,
        needsRegeneration: true,
        retryCount: 1,
      } as never)
    ).toBe('generator');
  });

  it('ends as review_required on the attempt that reaches the cap', async () => {
    const lastAllowed = HANDLER_CONFIG.MAX_REGENERATION_RETRIES - 1;
    const update = await finalizeJudgeResult(regenerateContext(lastAllowed));

    expect(update.retryCount).toBe(HANDLER_CONFIG.MAX_REGENERATION_RETRIES);
    expect(update.needsRegeneration).toBe(false);
    expect(update.needsHumanReview).toBe(true);
    expect(update.lessonContent).toBeNull();
    expect(update.regenerationMode).toBeNull();
  });

  it('names the cap and the score in the reason the reader will see', async () => {
    const update = await finalizeJudgeResult(
      regenerateContext(HANDLER_CONFIG.MAX_REGENERATION_RETRIES - 1)
    );

    expect(update.reviewInfo).toEqual({
      needsReview: true,
      reasons: [
        `Judge regeneration retries exceeded (${HANDLER_CONFIG.MAX_REGENERATION_RETRIES}). ` +
          `Latest quality score: 62.0%.`,
      ],
    });
    // `errors` is what executeStage6 copies into reviewInfo when a node leaves
    // one behind, so the same sentence has to be in both.
    expect(update.errors).toEqual(update.reviewInfo?.reasons);
  });

  it('leaves the graph by the ordinary end, not by the cap branch', async () => {
    const update = await finalizeJudgeResult(
      regenerateContext(HANDLER_CONFIG.MAX_REGENERATION_RETRIES - 1)
    );

    // The state the router sees carries the node's own decision, so the
    // `Max regeneration retries exceeded` warning does not fire.
    const route = shouldRetryAfterJudge({
      lessonSpec: { lesson_id: '1.3' },
      needsRegeneration: update.needsRegeneration,
      retryCount: update.retryCount,
      lessonContent: null,
      needsHumanReview: update.needsHumanReview,
      qualityScore: update.qualityScore,
    } as never);

    expect(route).toBe('__end__');
  });

  it('does not touch a lesson the judge accepted', async () => {
    const accepted = {
      ...regenerateContext(0),
      finalRecommendation: 'ACCEPT' as const,
      needsRegeneration: false,
      finalScore: 0.93,
      finalContent: { content: {} } as JudgeContext['finalContent'],
    };

    const update = await finalizeJudgeResult(accepted as JudgeContext);

    expect(update.needsHumanReview).toBe(false);
    expect(update.retryCount).toBe(0);
    expect(update.lessonContent).not.toBeNull();
  });
});
