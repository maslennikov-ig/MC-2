import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  create: vi.fn(),
  getApiKey: vi.fn(),
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
}));

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { generateImage } = await import(
  '@/stages/stage7-enrichments/services/image-generation-service'
);

describe('image generation OpenAI transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApiKey.mockResolvedValue('openrouter-test-key');
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
});
