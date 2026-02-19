import { describe, expect, it, vi } from 'vitest';
import type { LessonGraphStateType } from '@/stages/stage6-lesson-content/state';
import { MODEL_FALLBACK } from '@/stages/stage6-lesson-content/config';

vi.mock('@/shared/logger', () => {
  const logger = {
    child: vi.fn().mockReturnThis(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return {
    logger,
    default: logger,
  };
});

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/llm', () => ({
  LLMClient: class {
    generateCompletion = vi.fn();
  },
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn().mockReturnValue({
    getModelForPhase: vi.fn().mockResolvedValue({
      modelId: 'moonshotai/kimi-k2-thinking',
      maxTokens: 8000,
      temperature: 0.7,
    }),
  }),
}));

vi.mock('@/stages/stage6-lesson-content/services/database-service', () => ({
  saveRejectedContent: vi.fn().mockResolvedValue(undefined),
}));

import { selfReviewerNode } from '@/stages/stage6-lesson-content/nodes/self-reviewer-node';

const severeTruncationContent = `
## Введение

Короткий обрыв and
\`\`\`ts
const value = 1
and`;

function buildState(
  retryCount: number,
  generatedContent: string = severeTruncationContent
): LessonGraphStateType {
  return {
    lessonSpec: {
      lesson_id: '1.1',
      title: 'Тестовый урок',
      sections: [],
      learning_objectives: [],
      metadata: {},
    } as LessonGraphStateType['lessonSpec'],
    courseId: 'course-1',
    language: 'ru',
    generatedContent,
    retryCount,
    progressSummary: null,
    lessonUuid: 'lesson-uuid',
    ragChunks: [],
    ragContextId: null,
    userRefinementPrompt: null,
    modelOverride: null,
    style: null,
    analysisResult: null,
    sectionProgress: 0,
    selfReviewResult: null,
    sectionRegenerationResult: null,
    lessonContent: null,
    currentNode: 'selfReviewer',
    errors: [],
    modelUsed: null,
    selectedModel: null,
    fallbackModel: null,
    selectedModelTier: null,
    selectedModelTierReason: null,
    tokensUsed: 0,
    lastGenerationTokens: 1500,
    regenerateCount: 0,
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
  } as LessonGraphStateType;
}

describe('selfReviewerNode truncation escalation', () => {
  it('increments retryCount on REGENERATE for critical truncation', async () => {
    const result = await selfReviewerNode(buildState(0));

    expect(result.selfReviewResult?.status).toBe('REGENERATE');
    expect(result.retryCount).toBe(1);
    expect(result.regenerationMode).toBe('truncation_continuation');
    expect(result.truncationCount).toBe(1);
    expect(result.rejectedTokens).toBe(1500);
    expect(result.modelOverride).toBeUndefined();
  });

  it('switches to fallback model for repeated truncation regenerate', async () => {
    const result = await selfReviewerNode(buildState(1));

    expect(result.selfReviewResult?.status).toBe('REGENERATE');
    expect(result.retryCount).toBe(2);
    expect(result.regenerationMode).toBe('truncation_continuation');
    expect(result.truncationCount).toBe(1);
    expect(result.rejectedTokens).toBe(1500);
    expect(result.modelOverride).toBe(MODEL_FALLBACK.fallback);
  });
});
