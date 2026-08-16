/**
 * Contract: when a quiz is rejected, the error says what was wrong with it.
 *
 * The handler threw 'Failed to parse quiz output - invalid JSON structure' for
 * output that was valid JSON failing exactly one field. The real reason went to
 * a warn log and was dropped from the error, so the failure that cost two paid
 * attempts on 2026-08-16 looked like a broken model rather than one strict
 * field (mc2-d3726).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateCompletionMock } = vi.hoisted(() => ({ generateCompletionMock: vi.fn() }));

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: { ...noop, child: () => noop }, default: { ...noop, child: () => noop } };
});
vi.mock('@/shared/llm/client', () => ({
  llmClient: { generateCompletion: generateCompletionMock },
}));
vi.mock('@/shared/llm/model-config-service', () => ({
  resolveModelWithFallback: async () => 'deepseek/deepseek-v4-flash',
}));
vi.mock('@/stages/stage7-enrichments/services/database-service', () => ({
  getLessonContent: async () => '## Body\n\nSome lesson content about planning.',
}));

import { quizHandler } from '@/stages/stage7-enrichments/handlers/quiz-handler';

const input = {
  enrichmentContext: {
    enrichment: { id: '27dc4241-3b41-4b14-a306-0334a6812ce1' },
    lesson: { id: '0f2f6b3f-6f9a-4a52-9a24-2b1a4a9b8f10', title: 'Planning' },
    course: { id: '944e6795-580c-45b7-8eee-75a67c123965', language: 'ru', style: null },
  },
  settings: {},
} as never;

beforeEach(() => vi.clearAllMocks());

describe('a rejected quiz explains itself', () => {
  it('names the field and what it wanted', async () => {
    generateCompletionMock.mockResolvedValue({
      content: JSON.stringify({ quiz_title: 'Too short', questions: [] }),
      model: 'deepseek/deepseek-v4-flash',
      totalTokens: 9788,
      inputTokens: 8000,
      outputTokens: 1788,
    });

    await expect(quizHandler.generate!(input)).rejects.toThrow(/instructions|questions/);
  });

  it('says the output was not JSON only when it was not JSON', async () => {
    generateCompletionMock.mockResolvedValue({
      content: 'I would be happy to help you build a quiz!',
      model: 'deepseek/deepseek-v4-flash',
      totalTokens: 40,
      inputTokens: 30,
      outputTokens: 10,
    });

    await expect(quizHandler.generate!(input)).rejects.toThrow(/not valid JSON/);
  });
});
