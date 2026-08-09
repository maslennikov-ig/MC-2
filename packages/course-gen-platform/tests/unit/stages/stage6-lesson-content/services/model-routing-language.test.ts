import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getModelForPhase } = vi.hoisted(() => ({
  getModelForPhase: vi.fn(),
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: () => ({ getModelForPhase }),
}));

import { MODEL_FALLBACK } from '@/stages/stage6-lesson-content/config';
import { getStage6PhaseConfig } from '@/stages/stage6-lesson-content/judge/model-resolution';

describe('Stage 6 model routing language contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getModelForPhase.mockResolvedValue({
      modelId: 'test-primary',
      fallbackModelId: 'test-fallback',
      source: 'database',
    });
  });

  it('does not expose a legacy ru/en primary-model map', () => {
    expect(MODEL_FALLBACK).not.toHaveProperty('primary');
  });

  it('passes a non-ru/en language to phase routing unchanged', async () => {
    await getStage6PhaseConfig('stage_6_section_expander', {
      courseId: 'course-123',
      language: 'de',
      tokenCount: 900,
    });

    expect(getModelForPhase).toHaveBeenCalledWith(
      'stage_6_section_expander',
      'course-123',
      900,
      'de'
    );
  });
});
