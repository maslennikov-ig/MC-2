import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import {
  STAGE6_TIER_FALLBACKS,
  STAGE6_TIER_MODELS,
} from '@/stages/stage6-lesson-content/nodes/generator/generator-constants';

const { mockGetModelForPhase } = vi.hoisted(() => ({
  mockGetModelForPhase: vi.fn(),
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: () => ({
    getModelForPhase: mockGetModelForPhase,
  }),
}));

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

import { selectStage6ModelTier } from '@/stages/stage6-lesson-content/nodes/generator/model-selector';

function buildLessonSpec(
  lessonId: string,
  difficulty: 'beginner' | 'intermediate' | 'advanced'
): LessonSpecificationV2 {
  return {
    lesson_id: lessonId,
    difficulty_level: difficulty,
  } as LessonSpecificationV2;
}

describe('selectStage6ModelTier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forces complex tier for module 1 lessons', async () => {
    mockGetModelForPhase.mockResolvedValue({
      modelId: 'qwen/qwen3.5-plus-02-15',
      fallbackModelId: 'moonshotai/kimi-k2-thinking',
      source: 'database',
    });

    const result = await selectStage6ModelTier(buildLessonSpec('1.2', 'beginner'));

    expect(mockGetModelForPhase).toHaveBeenCalledWith('stage_6_complex');
    expect(result.tier).toBe('complex');
    expect(result.model).toBe('qwen/qwen3.5-plus-02-15');
  });

  it('selects simple tier for beginner non-module-1 lessons', async () => {
    mockGetModelForPhase.mockResolvedValue({
      modelId: 'xiaomi/mimo-v2-flash',
      fallbackModelId: 'moonshotai/kimi-k2-thinking',
      source: 'database',
    });

    const result = await selectStage6ModelTier(buildLessonSpec('3.1', 'beginner'));

    expect(mockGetModelForPhase).toHaveBeenCalledWith('stage_6_simple');
    expect(result.tier).toBe('simple');
    expect(result.model).toBe('xiaomi/mimo-v2-flash');
  });

  it('selects normal tier for intermediate lessons', async () => {
    mockGetModelForPhase.mockResolvedValue({
      modelId: 'moonshotai/kimi-k2-thinking',
      fallbackModelId: 'google/gemini-3-flash-preview',
      source: 'database',
    });

    const result = await selectStage6ModelTier(buildLessonSpec('3.2', 'intermediate'));

    expect(mockGetModelForPhase).toHaveBeenCalledWith('stage_6_normal');
    expect(result.tier).toBe('normal');
    expect(result.model).toBe('moonshotai/kimi-k2-thinking');
  });

  it('selects complex tier for advanced lessons', async () => {
    mockGetModelForPhase.mockResolvedValue({
      modelId: 'qwen/qwen3.5-plus-02-15',
      fallbackModelId: 'moonshotai/kimi-k2-thinking',
      source: 'database',
    });

    const result = await selectStage6ModelTier(buildLessonSpec('5.3', 'advanced'));

    expect(mockGetModelForPhase).toHaveBeenCalledWith('stage_6_complex');
    expect(result.tier).toBe('complex');
    expect(result.model).toBe('qwen/qwen3.5-plus-02-15');
  });

  it('uses hardcoded tier defaults when model config lookup fails', async () => {
    mockGetModelForPhase.mockRejectedValue(new Error('db unavailable'));

    const result = await selectStage6ModelTier(buildLessonSpec('4.2', 'beginner'));

    expect(result.tier).toBe('simple');
    expect(result.model).toBe(STAGE6_TIER_MODELS.simple);
    expect(result.fallback).toBe(STAGE6_TIER_FALLBACKS.simple);
  });
});
