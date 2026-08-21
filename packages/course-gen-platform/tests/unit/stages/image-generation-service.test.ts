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

describe('image generation OpenAI transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    await generateImage('A text-free professional role guide card', {
      model: 'openai/gpt-5-image-mini',
      aspectRatio: '1:1',
      imageSize: '1K',
    });

    expect(mocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        dangerouslyAllowBrowser: true,
      })
    );
  });

  it('goes through the instrumented shared transport rather than a local client', async () => {
    await generateImage('A text-free professional role guide card', {
      model: 'openai/gpt-5-image-mini',
    });

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
});
