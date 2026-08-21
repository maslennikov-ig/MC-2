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
vi.mock('@/shared/services/api-key-service', () => ({
  getApiKey: async () => 'test-key',
  getOpenRouterApiKey: async () => 'test-key',
}));
vi.mock('openai', () => ({
  // The constructor options are kept so a test can drive the very `fetch` the
  // factory wrapped, which is where the generation id is deposited.
  default: class {
    constructor(readonly options: { fetch?: typeof globalThis.fetch }) {}
    chat = {
      completions: {
        create: (...args: unknown[]) => createCompletionMock(this.options, ...args),
      },
    };
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
  vi.unstubAllGlobals();
  createCompletionMock.mockResolvedValue({
    choices: [{ message: { images: [`data:image/png;base64,${ONE_PIXEL}`] } }],
    // An image call's completion tokens are image tokens, and they are what the
    // estimate is built from. Before 2026-08-21 nothing read them: the price came
    // from a private table inside the service, which had drifted to 6.4x low
    // (mc2-5mhlb).
    usage: { prompt_tokens: 420, completion_tokens: 5_000 },
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

  it('prices the card from the catalogue image rate, not from a private table', async () => {
    const result = await generateCardImage('a card', {
      courseId: COURSE_ID,
      stage: 'stage_7',
      phase: 'stage_7_card',
    });

    // $2.50/1M prompt + $8.00/1M image output, against the $0.007 the old
    // private table quoted for the same picture.
    const expected = (420 * 2.5) / 1_000_000 + (5_000 * 8) / 1_000_000;
    expect(result.costUsd).toBeCloseTo(expected, 8);
    expect(result.costUsd).toBeGreaterThan(0.007);
  });

  it('leaves the row unpriced when the response reported no tokens', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { images: [`data:image/png;base64,${ONE_PIXEL}`] } }],
    });

    const result = await generateCardImage('a card', {
      courseId: COURSE_ID,
      stage: 'stage_7',
      phase: 'stage_7_card',
    });

    // An absence, deliberately not a number. The old code answered a missing
    // price with a flat $0.04 default, which reads as a measurement and is not
    // one; the provider's own charge arrives on the row seconds later anyway.
    expect(result.costUsd).toBeUndefined();
    const row = logTraceMock.mock.calls.map(call => call[0])[0];
    expect(row.costUsd).toBeUndefined();
  });

  it('writes down what an aborted generation spent, instead of nothing', async () => {
    // The provider answered with headers — so it started work, so it was paid —
    // and then the call failed. Before this, the money existed and the row did
    // not (mc2-ietzn).
    const GENERATION_ID = 'gen-1787317000-AbortedCard';
    // Stubbed before the client is built: the wrapper closes over the global
    // `fetch` it finds at construction time, so a stub installed later would
    // send a real request.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { headers: { 'x-generation-id': GENERATION_ID } }))
    );
    createCompletionMock.mockImplementation(
      async (options: { fetch?: typeof globalThis.fetch }) => {
        await options.fetch!('https://openrouter.ai/api/v1/chat/completions');
        throw new Error('connection reset while reading the image');
      }
    );

    await expect(
      generateCardImage('a card', {
        courseId: COURSE_ID,
        stage: 'stage_7',
        phase: 'stage_7_card',
      })
    ).rejects.toThrow(/connection reset/);

    const row = logTraceMock.mock.calls.map(call => call[0])[0];
    expect(row).toMatchObject({
      courseId: COURSE_ID,
      stage: 'stage_7',
      phase: 'stage_7_card',
      stepName: 'image_call_failed',
    });
    // No tokens came back, so there is nothing to estimate from. The row says
    // "unknown", never a guess, and the provider's own charge lands on it once
    // the generation record is readable.
    expect(row.costUsd).toBeUndefined();
    expect(row.inputData).toMatchObject({ billedCall: true, generationId: GENERATION_ID });
  });

  it('records nothing when the call never reached the provider', async () => {
    // No generation id means no headers means no work started: writing a row
    // here would be inventing spend.
    createCompletionMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(
      generateCardImage('a card', {
        courseId: COURSE_ID,
        stage: 'stage_7',
        phase: 'stage_7_card',
      })
    ).rejects.toThrow(/ENOTFOUND/);

    expect(logTraceMock).not.toHaveBeenCalled();
  });
});
