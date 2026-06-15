import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerateCompletion = vi.fn();
const mockGetModelForPhase = vi.fn();

vi.mock('@/shared/llm', () => ({
  LLMClient: class MockLLMClient {
    generateCompletion = mockGenerateCompletion;
  },
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: () => ({
    getModelForPhase: mockGetModelForPhase,
  }),
}));

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock('@/stages/stage6-lesson-content/judge/patcher', () => ({
  buildPatcherSystemPrompt: () => 'system prompt',
}));

vi.mock('@/stages/stage6-lesson-content/judge/fix-templates', () => ({
  buildCoherencePreservingPrompt: () => 'coherence prompt',
}));

vi.mock('@/stages/stage6-lesson-content/judge/strip-metadata', () => ({
  stripLLMMetadataWithLogging: (content: string) => content,
  stripLOCodesWithLogging: (content: string) => content,
}));

vi.mock('@/stages/stage6-lesson-content/judge/targeted-refinement/events', () => ({
  emitEvent: vi.fn(),
}));

vi.mock('@/stages/stage6-lesson-content/nodes/generator/generator-content', () => ({
  validateGeneratedContent: () => ({ isValid: true, detectedMarkers: [] }),
}));

import { executeLlmCall } from '@/stages/stage6-lesson-content/judge/targeted-refinement/task-executor-helpers';

describe('executeLlmCall config failures', () => {
  beforeEach(() => {
    mockGenerateCompletion.mockReset();
    mockGetModelForPhase.mockReset();
    mockGetModelForPhase.mockResolvedValue({
      modelId: 'patcher-model',
      source: 'test',
    });
  });

  it('should use canonical fallback when targeted-refinement model config lookup fails', async () => {
    mockGetModelForPhase.mockRejectedValue(new Error('targeted refinement config missing'));
    mockGenerateCompletion.mockResolvedValue({
      content: 'patched content',
      totalTokens: 321,
    });

    const result = await executeLlmCall('prompt', 'system prompt', {
      maxTokens: 1200,
      temperature: 0.1,
    });

    expect(result).toEqual({
      content: 'patched content',
      tokensUsed: 321,
    });
    expect(mockGenerateCompletion).toHaveBeenCalledWith('prompt', {
      model: 'deepseek/deepseek-v4-flash',
      temperature: 0.1,
      maxTokens: 1200,
      systemPrompt: 'system prompt',
    });
  });
});
