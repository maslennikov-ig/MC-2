/**
 * Tests for handleNoVerdict in judge-refinement-helpers
 * @module stages/stage6-lesson-content/nodes/judge-refinement-handleNoVerdict.test
 *
 * Covers the P1 bug fix: handleNoVerdict must set regenerationMode to 'full_regenerate'
 * and increment regenerateCount when cascadeResult.finalRecommendation === 'REGENERATE'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LessonGraphStateType } from '@/stages/stage6-lesson-content/state';
import type { JudgeContext } from '@/stages/stage6-lesson-content/nodes/judge-node-helpers';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@/shared/logger', () => {
  const logger = {
    child: vi.fn().mockReturnThis(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { logger, default: logger };
});

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/stages/stage6-lesson-content/judge/judge-output-builder', () => ({
  buildEnrichedJudgeOutput: vi.fn().mockReturnValue({ singleJudge: null, votes: [] }),
  extractJudgeModels: vi.fn().mockReturnValue([]),
}));

vi.mock('@/stages/stage6-lesson-content/judge/judge-progress', () => ({
  buildJudgeProgressSummary: vi.fn().mockReturnValue('progress-summary-string'),
}));

// Import after mocks are registered
import { handleNoVerdict } from '@/stages/stage6-lesson-content/nodes/judge-refinement-helpers';

// ============================================================================
// FIXTURES
// ============================================================================

function buildState(overrides: Partial<LessonGraphStateType> = {}): LessonGraphStateType {
  return {
    lessonSpec: {
      lesson_id: '1.1',
      title: 'Test Lesson',
      sections: [],
      learning_objectives: [],
      metadata: {},
    } as LessonGraphStateType['lessonSpec'],
    courseId: 'course-1',
    lessonUuid: 'lesson-uuid',
    language: 'ru',
    retryCount: 0,
    regenerateCount: 0,
    lessonContent: { content: { sections: [] } } as LessonGraphStateType['lessonContent'],
    progressSummary: null,
    ragChunks: [],
    ragContextId: null,
    userRefinementPrompt: null,
    modelOverride: null,
    style: null,
    analysisResult: null,
    generatedContent: null,
    lessonDigest: null,
    sectionProgress: 0,
    selfReviewResult: null,
    sectionRegenerationResult: null,
    currentNode: 'judge',
    errors: [],
    modelUsed: null,
    selectedModel: null,
    fallbackModel: null,
    selectedModelTier: null,
    selectedModelTierReason: null,
    tokensUsed: 0,
    lastGenerationTokens: 0,
    truncationCount: 0,
    rejectedTokens: 0,
    regenerationMode: null,
    durationMs: 0,
    totalCostUsd: 0,
    nodeCosts: [],
    temperature: 0.7,
    qualityScore: null,
    judgeVerdict: null,
    judgeRecommendation: null,
    needsRegeneration: false,
    needsHumanReview: false,
    reviewInfo: null,
    previousScores: [],
    refinementIterationCount: 0,
    targetedRefinementMode: 'full-auto',
    arbiterOutput: null,
    targetedRefinementStatus: null,
    lockedSections: [],
    sectionEditCount: {},
    targetedRefinementTokensUsed: 0,
    ...overrides,
  } as LessonGraphStateType;
}

function buildCascadeResult(
  finalRecommendation: CascadeResult['finalRecommendation'],
  overrides: Partial<CascadeResult> = {}
): CascadeResult {
  return {
    stage: 'heuristic' as const,
    passed: false,
    finalScore: 0.3,
    finalRecommendation,
    totalTokensUsed: 100,
    totalDurationMs: 50,
    costSavingsRatio: 0,
    ...overrides,
  };
}

function buildContext(
  state: LessonGraphStateType,
  cascadeResult: JudgeContext['cascadeResult']
): JudgeContext {
  return {
    state,
    contentBody: { sections: [] } as JudgeContext['contentBody'],
    startTime: Date.now(),
    cascadeResult,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('handleNoVerdict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REGENERATE recommendation', () => {
    it('sets regenerationMode to full_regenerate when recommendation is REGENERATE', async () => {
      const state = buildState({ regenerateCount: 0 });
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.regenerationMode).toBe('full_regenerate');
    });

    it('increments regenerateCount by 1 when recommendation is REGENERATE', async () => {
      const state = buildState({ regenerateCount: 2 });
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.regenerateCount).toBe(3);
    });

    it('sets needsRegeneration to true when recommendation is REGENERATE', async () => {
      const state = buildState();
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.needsRegeneration).toBe(true);
    });

    it('sets lessonContent to null when recommendation is REGENERATE', async () => {
      const state = buildState({
        lessonContent: { content: { sections: [] } } as LessonGraphStateType['lessonContent'],
      });
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.lessonContent).toBeNull();
    });

    it('increments retryCount by 1 when recommendation is REGENERATE', async () => {
      const state = buildState({ retryCount: 1 });
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.retryCount).toBe(2);
    });

    it('sets judgeRecommendation to REGENERATE', async () => {
      const state = buildState();
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.judgeRecommendation).toBe('REGENERATE');
    });

    it('handles regenerateCount starting at zero', async () => {
      const state = buildState({ regenerateCount: 0, retryCount: 0 });
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.regenerateCount).toBe(1);
      expect(result.retryCount).toBe(1);
    });
  });

  describe('ACCEPT recommendation', () => {
    it('does not set regenerationMode to full_regenerate when recommendation is ACCEPT', async () => {
      const state = buildState();
      const cascadeResult = buildCascadeResult('ACCEPT', { passed: true, finalScore: 0.9 });
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.regenerationMode).toBeNull();
    });

    it('sets needsRegeneration to false when recommendation is ACCEPT', async () => {
      const state = buildState();
      const cascadeResult = buildCascadeResult('ACCEPT', { passed: true, finalScore: 0.9 });
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.needsRegeneration).toBe(false);
    });

    it('preserves lessonContent when recommendation is ACCEPT', async () => {
      const existingContent = {
        content: { sections: [{ title: 'Existing' }] },
      } as LessonGraphStateType['lessonContent'];
      const state = buildState({ lessonContent: existingContent });
      const cascadeResult = buildCascadeResult('ACCEPT', { passed: true, finalScore: 0.9 });
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.lessonContent).toBe(existingContent);
    });

    it('does not increment regenerateCount when recommendation is ACCEPT', async () => {
      const state = buildState({ regenerateCount: 1 });
      const cascadeResult = buildCascadeResult('ACCEPT', { passed: true, finalScore: 0.9 });
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.regenerateCount).toBe(1);
    });

    it('does not increment retryCount when recommendation is ACCEPT', async () => {
      const state = buildState({ retryCount: 2 });
      const cascadeResult = buildCascadeResult('ACCEPT', { passed: true, finalScore: 0.9 });
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.retryCount).toBe(2);
    });
  });

  describe('retryCount increment on REGENERATE', () => {
    it('increments retryCount from 1 to 2', async () => {
      const state = buildState({ retryCount: 1 });
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.retryCount).toBe(2);
    });

    it('increments retryCount from 0 to 1', async () => {
      const state = buildState({ retryCount: 0 });
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.retryCount).toBe(1);
    });

    it('increments retryCount from 5 to 6', async () => {
      const state = buildState({ retryCount: 5 });
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.retryCount).toBe(6);
    });
  });

  describe('null cascadeResult fallback', () => {
    it('defaults to REGENERATE when cascadeResult is null', async () => {
      const state = buildState({ regenerateCount: 0 });
      const context = buildContext(state, null);

      const result = await handleNoVerdict(context);

      // Null cascadeResult defaults to 'REGENERATE' via ?? operator in implementation
      expect(result.regenerationMode).toBe('full_regenerate');
      expect(result.needsRegeneration).toBe(true);
    });
  });

  describe('return shape', () => {
    it('sets currentNode to judge', async () => {
      const state = buildState();
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.currentNode).toBe('judge');
    });

    it('includes qualityScore from cascadeResult.finalScore', async () => {
      const state = buildState();
      const cascadeResult = buildCascadeResult('REGENERATE', { finalScore: 0.42 });
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.qualityScore).toBe(0.42);
    });

    it('includes tokensUsed from cascadeResult.totalTokensUsed', async () => {
      const state = buildState();
      const cascadeResult = buildCascadeResult('REGENERATE', { totalTokensUsed: 250 });
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.tokensUsed).toBe(250);
    });

    it('sets needsHumanReview to false for REGENERATE', async () => {
      const state = buildState();
      const cascadeResult = buildCascadeResult('REGENERATE');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.needsHumanReview).toBe(false);
    });

    it('sets needsHumanReview to true for ESCALATE_TO_HUMAN', async () => {
      const state = buildState();
      const cascadeResult = buildCascadeResult('ESCALATE_TO_HUMAN');
      const context = buildContext(state, cascadeResult);

      const result = await handleNoVerdict(context);

      expect(result.needsHumanReview).toBe(true);
      expect(result.needsRegeneration).toBe(false);
    });
  });
});
