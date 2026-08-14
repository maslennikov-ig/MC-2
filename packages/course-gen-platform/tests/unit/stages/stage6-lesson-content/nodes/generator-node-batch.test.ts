import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonGraphStateType } from '@/stages/stage6-lesson-content/state';

const { generateLessonSingleCallMock } = vi.hoisted(() => ({
  generateLessonSingleCallMock: vi.fn(),
}));

vi.mock('@/shared/trace-logger', () => ({ logTrace: vi.fn() }));
vi.mock('@/stages/stage6-lesson-content/nodes/generator/generator-single-call', async original => {
  const actual =
    await original<
      typeof import('@/stages/stage6-lesson-content/nodes/generator/generator-single-call')
    >();
  return { ...actual, generateLessonSingleCall: generateLessonSingleCallMock };
});
vi.mock('@/stages/stage6-lesson-content/utils/mermaid-fix-pipeline', () => ({
  runMermaidFixPipeline: vi.fn(async (content: string) => ({
    content,
    modified: false,
    metrics: {},
  })),
}));

import { generatorNode } from '@/stages/stage6-lesson-content/nodes/generator-node';

function state(consumed: boolean): LessonGraphStateType {
  return {
    lessonSpec: {
      lesson_id: '2.1',
      title: 'Batch lesson',
      estimated_duration_minutes: 10,
      sections: [],
    },
    ragChunks: [],
    courseId: 'course-id',
    lessonUuid: 'lesson-uuid',
    language: 'en',
    style: null,
    analysisResult: null,
    regenerationMode: null,
    regenerateCount: 0,
    truncationCount: 0,
    rejectedTokens: 0,
    maxTokensOverride: null,
    modelOverride: 'google/gemini-3.7-flash',
    selectedModel: 'google/gemini-3.7-flash',
    selectedModelTier: 'simple',
    selectedModelTierReason: 'test',
    selectedModelPhase: 'stage_6_simple',
    selectedModelSource: 'test',
    prefetchedGeneratorResponseConsumed: consumed,
    prefetchedGeneratorResponse: {
      content: '## Introduction\n\nBatch response',
      prompt: 'Saved prompt',
      tokensUsed: 123,
      modelUsed: 'google/gemini-3.7-flash:batch',
      baseModelUsed: 'google/gemini-3.7-flash',
    },
  } as unknown as LessonGraphStateType;
}

describe('generatorNode Batch API handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateLessonSingleCallMock.mockResolvedValue({
      content: '## Introduction\n\nBatch response',
      lessonDigest: 'digest',
      tokensUsed: 123,
      modelUsed: 'google/gemini-3.7-flash:batch',
    });
  });

  it('uses a prefetched response exactly once', async () => {
    const first = await generatorNode(state(false));
    expect(generateLessonSingleCallMock.mock.calls[0][8]).toMatchObject({
      modelUsed: 'google/gemini-3.7-flash:batch',
    });
    expect(first.prefetchedGeneratorResponseConsumed).toBe(true);

    await generatorNode(state(true));
    expect(generateLessonSingleCallMock.mock.calls[1][8]).toBeUndefined();
  });
});
