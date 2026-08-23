import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  create: vi.fn(),
  getApiKey: vi.fn(),
  getOpenRouterApiKey: vi.fn(),
}));

vi.mock('openai', () => ({
  default: function MockOpenAI(options: unknown) {
    mocks.constructor(options);
    return {
      chat: {
        completions: {
          create: mocks.create,
        },
      },
    };
  },
}));

vi.mock('@/shared/services/api-key-service', () => ({
  getApiKey: mocks.getApiKey,
  getOpenRouterApiKey: mocks.getOpenRouterApiKey,
}));

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  // Cost recording reaches for the default export; without it an unattributed
  // image throws inside accounting, which must never fail a generation.
  return { logger: noop, default: noop };
});

const { generateImage } = await import(
  '@/stages/stage7-enrichments/services/image-generation-service'
);

const COVER_MODEL = 'google/gemini-2.5-flash-image';
const CARD_MODEL = 'openai/gpt-5-image-mini';

describe('image generation transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.getApiKey.mockResolvedValue('openrouter-test-key');
    mocks.getOpenRouterApiKey.mockResolvedValue('openrouter-test-key');
    mocks.create.mockResolvedValue({
      choices: [
        {
          message: {
            images: ['data:image/png;base64,aW1hZ2U='],
            content: null,
          },
        },
      ],
    });
  });

  it('allows the Node worker to operate after Mermaid installs a JSDOM window', async () => {
    // The cover is the path that still builds an SDK client, so it is the one
    // that has to survive a JSDOM window in the worker.
    await generateImage('A cinematic course cover', {
      model: COVER_MODEL,
      aspectRatio: '21:9',
      imageSize: '1K',
    });

    expect(mocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        dangerouslyAllowBrowser: true,
      })
    );
  });

  it('builds the cover client against the instrumented shared transport', async () => {
    await generateImage('A cinematic course cover', { model: COVER_MODEL });

    // The wrapped `fetch` is the whole difference between a call that can be
    // priced from `GET /api/v1/generation` and one whose price is a guess
    // forever. This service built its own client and had no wrapper, which is
    // why its picture was the entire residual of the 2026-08-21 run (mc2-l17v5).
    expect(mocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://openrouter.ai/api/v1',
        fetch: expect.any(Function),
      })
    );
    // ...and the key comes from the resolver that reads the database first, not
    // from `process.env`.
    expect(mocks.getOpenRouterApiKey).toHaveBeenCalled();
  });

  it('sends a card to the Images API and still catches its generation id', async () => {
    // A different endpoint and a different transport — a raw `fetch`, because
    // `/images` is not OpenAI-compatible — so the thing worth asserting is that
    // the id still arrives. Without it the card keeps an estimate forever, which
    // is the defect this whole path was rebuilt to avoid.
    const GENERATION_ID = 'gen-img-1787382893-Card';
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ b64_json: 'aW1hZ2U=' }],
            usage: { prompt_tokens: 66, completion_tokens: 1056 },
          }),
          { headers: { 'content-type': 'application/json', 'x-generation-id': GENERATION_ID } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateImage('A text-free professional role guide card', {
      model: CARD_MODEL,
      aspectRatio: '1:1',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/images');
    expect(result.generationId).toBe(GENERATION_ID);
    expect(result.outputTokens).toBe(1056);
    expect(mocks.getOpenRouterApiKey).toHaveBeenCalled();
    // No SDK client is built for this path at all.
    expect(mocks.constructor).not.toHaveBeenCalled();
  });
});
