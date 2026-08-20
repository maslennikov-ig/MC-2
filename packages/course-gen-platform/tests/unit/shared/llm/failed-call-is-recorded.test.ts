/**
 * Contract: a call that was paid for and produced nothing leaves a trace.
 *
 * A request that times out has already made the provider generate tokens, and
 * the provider bills them. The price was recorded only after a successful
 * response, so those attempts left no row at all: on 2026-08-17 three quiz
 * attempts died on a four-minute timeout, the enrichment failed, and the money
 * was invisible in a course total that was already 0.04 short of the invoice
 * (mc2-b7olk.7).
 *
 * The row carries no price on purpose. What the provider generated before the
 * connection dropped cannot be known from here, and an invented number would be
 * worse than an honest gap.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logTraceMock, createMock } = vi.hoisted(() => ({
  logTraceMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: { ...noop, child: () => noop }, default: { ...noop, child: () => noop } };
});
vi.mock('@/shared/trace-logger', () => ({ logTrace: logTraceMock }));
vi.mock('@/shared/services/api-key-service', () => ({
  getApiKey: async () => 'test-key',
  getOpenRouterApiKey: async () => 'test-key',
  getApiKeySync: () => 'test-key',
}));
vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: createMock } };
    // The client narrows failures with `error instanceof OpenAI.APIError`, so the
    // stub has to carry the class or the narrowing itself throws.
    static APIError = class extends Error {};
  }
  return { default: MockOpenAI };
});

import { LLMClient } from '@/shared/llm/client';

const COURSE_ID = '944e6795-580c-45b7-8eee-75a67c123965';
const COST_CONTEXT = {
  courseId: COURSE_ID,
  stage: 'stage_7' as const,
  phase: 'stage_7_quiz',
};

class AbortError extends Error {
  override name = 'AbortError';
}

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockRejectedValue(new AbortError('This operation was aborted'));
});

describe('a call that never came back', () => {
  it('is recorded against the course, with no price and the reason', async () => {
    const client = new LLMClient({ maxRetries: 0 });

    await expect(
      client.generateCompletion('write a quiz about planning', {
        model: 'deepseek/deepseek-v4-flash',
        costContext: COST_CONTEXT,
      })
    ).rejects.toThrow(/aborted/);

    const row = logTraceMock.mock.calls
      .map(call => call[0])
      .find(arg => arg.stepName === 'llm_call_failed');
    expect(row).toMatchObject({
      courseId: COURSE_ID,
      stage: 'stage_7',
      phase: 'stage_7_quiz',
      modelUsed: 'deepseek/deepseek-v4-flash',
    });
    expect(row.costUsd).toBeUndefined();
    expect(row.errorData.spentButUnpriced).toBe(true);
    // The retry wrapper rebuilds the error, so only the text carries the cause;
    // this is the row a reconciliation reads to explain a gap in the invoice.
    expect(row.errorData.error).toMatch(/aborted/);
    expect(row.errorData.estimatedInputTokens).toBeGreaterThan(0);
  });

  it('stays quiet when there is no course to charge the loss to', async () => {
    const client = new LLMClient({ maxRetries: 0 });

    await expect(
      client.generateCompletion('a maintenance call', { model: 'deepseek/deepseek-v4-flash' })
    ).rejects.toThrow(/aborted/);

    expect(logTraceMock).not.toHaveBeenCalled();
  });
});
