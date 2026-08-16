/**
 * Contract: a generated picture leaves a priced trace row.
 *
 * The course card is billed per image, not per token, so it never went through
 * the token-priced path — and nobody noticed, because the number was written to
 * `lesson_enrichments.metadata.estimated_cost_usd` and looked recorded. The
 * course total is a sum over `generation_trace`, which never saw it. On the paid
 * run of 2026-08-16 the card was USD 0.007 against a recorded course total of
 * 0.0310: 18% of the course, on the one enrichment every course gets
 * automatically (mc2-acjgd).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logTraceMock, createCompletionMock } = vi.hoisted(() => ({
  logTraceMock: vi.fn(),
  createCompletionMock: vi.fn(),
}));

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: { ...noop, child: () => noop }, default: { ...noop, child: () => noop } };
});
vi.mock('@/shared/trace-logger', () => ({ logTrace: logTraceMock }));
vi.mock('@/shared/services/api-key-service', () => ({ getApiKey: async () => 'test-key' }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createCompletionMock } };
  },
}));

import {
  generateCardImage,
  generateCoverImage,
} from '@/stages/stage7-enrichments/services/image-generation-service';

const COURSE_ID = '944e6795-580c-45b7-8eee-75a67c123965';
const LESSON_ID = '0f2f6b3f-6f9a-4a52-9a24-2b1a4a9b8f10';
const ONE_PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeEach(() => {
  vi.clearAllMocks();
  createCompletionMock.mockResolvedValue({
    choices: [{ message: { images: [`data:image/png;base64,${ONE_PIXEL}`] } }],
  });
});

describe('Stage 7 image generation', () => {
  it('charges the card to the course and the lesson it belongs to', async () => {
    const result = await generateCardImage('a card', {
      courseId: COURSE_ID,
      stage: 'stage_7',
      phase: 'stage_7_card',
      lessonId: LESSON_ID,
    });

    const row = logTraceMock.mock.calls.map(call => call[0])[0];
    expect(row).toMatchObject({
      courseId: COURSE_ID,
      lessonId: LESSON_ID,
      stage: 'stage_7',
      phase: 'stage_7_card',
      stepName: 'image_call',
      modelUsed: 'openai/gpt-5-image-mini',
    });
    expect(row.costUsd).toBe(result.costUsd);
    expect(row.costUsd).toBeGreaterThan(0);
  });

  it('charges the cover the same way, at its own tariff', async () => {
    await generateCoverImage('a cover', {
      courseId: COURSE_ID,
      stage: 'stage_7',
      phase: 'stage_7_cover',
    });

    const row = logTraceMock.mock.calls.map(call => call[0])[0];
    expect(row).toMatchObject({ courseId: COURSE_ID, phase: 'stage_7_cover' });
    expect(row.costUsd).toBeGreaterThan(0);
  });

  it('generates without a course rather than charging a guessed one', async () => {
    await generateCardImage('a card');

    expect(logTraceMock).not.toHaveBeenCalled();
  });
});
