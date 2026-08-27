/**
 * What actually goes out on the wire for a picture.
 *
 * Three things were wrong here at once and none of them failed loudly.
 *
 * The banner never read its own routing row: the live path called `generateImage`
 * with no model, so `stage_7_cover` in `llm_model_config` decided nothing while
 * pipeline-admin displayed it as though it did. The wrapper that *did* resolve it
 * was reachable only from a test — a green assertion about a function production
 * did not call (mc2-emxdq).
 *
 * The flex endpoint was never asked for. `google/gemini-2.5-flash-image` serves
 * the same picture at half price from `google-ai-studio/flex`, and OpenRouter
 * does not choose it unprompted: measured 2026-08-27, $0.038553 unpinned against
 * $0.019247 pinned (mc2-6qwia).
 *
 * And the prompt and the request disagreed about the frame — both cover
 * templates say "16:9 hero banner", the code asked for 21:9.
 *
 * These assertions read the request, not the result, because every one of those
 * produced a perfectly good picture.
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
const ONE_PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const REFERENCE = `data:image/webp;base64,${ONE_PIXEL}`;

let imagesFetch: ReturnType<typeof vi.fn>;

/**
 * The body `POST /api/v1/images` was called with, parsed.
 *
 * By URL rather than by position: `resolveImageModel` reads the routing row
 * first, and on a cold cache that lookup is `fetch` call zero. Indexing into the
 * calls made this pass or fail depending on which test ran first.
 */
function imagesRequestBody(): Record<string, unknown> {
  const call = imagesFetch.mock.calls.find(([url]) => String(url).endsWith('/images')) as
    | [string, { body: string }]
    | undefined;
  if (!call) throw new Error('the Images API was never called');
  return JSON.parse(call[1].body) as Record<string, unknown>;
}

/** The options object the chat completion was created with. */
function chatRequest(): Record<string, unknown> {
  return createCompletionMock.mock.calls[0][1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  imagesFetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: [{ b64_json: ONE_PIXEL }], usage: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', imagesFetch);
  createCompletionMock.mockResolvedValue({
    choices: [{ message: { images: [`data:image/png;base64,${ONE_PIXEL}`] } }],
    usage: {},
  });
});

describe('what a picture request carries', () => {
  it('asks the banner model for the frame its own prompt describes', async () => {
    await generateCoverImage('a banner', { courseId: COURSE_ID, stage: 'stage_7' });

    expect(chatRequest().image_config).toMatchObject({ aspect_ratio: '16:9' });
  });

  it('names the flex endpoint first, and lets the call fall back off it', async () => {
    await generateCoverImage('a banner', { courseId: COURSE_ID, stage: 'stage_7' });

    const provider = chatRequest().provider as { order: string[]; allow_fallbacks: boolean };
    expect(provider.order[0]).toBe('google-ai-studio/flex');
    // Flex refuses rather than queues when it is busy. Pinned hard, a busy tier
    // becomes a failed banner instead of a dearer one, so the base tiers stay in
    // the list behind it and fallbacks stay on.
    expect(provider.order).toContain('google-ai-studio');
    expect(provider.allow_fallbacks).toBe(true);
  });

  it('does not invent an endpoint for a model that publishes only one', async () => {
    await generateCardImage('a card', { courseId: COURSE_ID, stage: 'stage_7' });

    // Every OpenAI image model has a single endpoint. A `provider` block here
    // would be a preference over nothing, and the first thing to go stale.
    expect(imagesRequestBody()).not.toHaveProperty('provider');
  });

  it('passes a reference picture in the shape the Images API validates for', async () => {
    await generateCardImage('a card', { courseId: COURSE_ID, stage: 'stage_7' }, [REFERENCE]);

    // Not guessed: `/images` answers a bare array of data-URL strings with
    // "expected object", and `{url}` without `type` with "invalid value".
    expect(imagesRequestBody().input_references).toEqual([
      { type: 'image_url', image_url: { url: REFERENCE } },
    ]);
  });

  it('sends no reference field at all when there is nothing to match', async () => {
    await generateCardImage('a card', { courseId: COURSE_ID, stage: 'stage_7' });

    expect(imagesRequestBody()).not.toHaveProperty('input_references');
  });

  it('carries a reference through chat completions as a content part', async () => {
    await generateCoverImage('a banner', { courseId: COURSE_ID, stage: 'stage_7' }, [REFERENCE]);

    const messages = chatRequest().messages as Array<{ content: unknown }>;
    // Chat completions has no `input_references`. The prompt has to survive
    // beside the picture, which is why `content` becomes an array only here.
    expect(messages[0].content).toEqual([
      { type: 'text', text: expect.stringContaining('a banner') },
      { type: 'image_url', image_url: { url: REFERENCE } },
    ]);
  });

  it('leaves the prompt a plain string when no reference is given', async () => {
    await generateCoverImage('a banner', { courseId: COURSE_ID, stage: 'stage_7' });

    const messages = chatRequest().messages as Array<{ content: unknown }>;
    expect(typeof messages[0].content).toBe('string');
  });
});
