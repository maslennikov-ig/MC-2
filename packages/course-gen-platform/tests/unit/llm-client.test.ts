/**
 * LLMClient Unit Tests
 * @module shared/llm/__tests__/client.test
 *
 * Comprehensive unit tests for LLM Client with OpenRouter integration.
 * Tests initialization, race condition prevention, API key management, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LLMClientOptions } from '@/shared/llm/client';

// Mock dependencies before imports
vi.mock('@/shared/services/api-key-service', () => ({
  getOpenRouterApiKey: vi.fn(),
  getApiKeySync: vi.fn(),
}));

vi.mock('openai', () => {
  // Mock APIError class inside the factory
  class MockAPIError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  }

  const MockOpenAI = vi.fn(function (this: any, config: any) {
    this.config = config;
    this.chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: { content: 'test response' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
          model: 'test-model',
        }),
      },
    };
  });

  (MockOpenAI as any).APIError = MockAPIError;

  return {
    default: MockOpenAI,
  };
});

vi.mock('@/shared/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@megacampus/shared-utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@megacampus/shared-utils')>();
  return {
    ...actual,
    retryWithBackoff: vi.fn(fn => fn()),
  };
});

// Import after mocks are defined
import { LLMClient, createLLMClient, DEFAULT_LLM_TIMEOUT_MS } from '@/shared/llm/client';
import { getOpenRouterApiKey, getApiKeySync } from '@/shared/services/api-key-service';
import OpenAI from 'openai';
import logger from '@/shared/logger';
import { retryWithBackoff } from '@megacampus/shared-utils';

describe('LLMClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize immediately when env var available', () => {
      vi.mocked(getApiKeySync).mockReturnValue('test-key');

      const client = new LLMClient();

      expect(getApiKeySync).toHaveBeenCalledWith('openrouter');
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'test-key',
          baseURL: 'https://openrouter.ai/api/v1',
        })
      );
      expect(logger.info).toHaveBeenCalledWith('LLMClient initialized with OpenRouter backend');
    });

    it('should defers initialization when env var not available', () => {
      vi.mocked(getApiKeySync).mockReturnValue(undefined);

      const client = new LLMClient();

      expect(getApiKeySync).toHaveBeenCalledWith('openrouter');
      expect(OpenAI).not.toHaveBeenCalled();
    });

    it('should include custom headers in initialization', () => {
      vi.mocked(getApiKeySync).mockReturnValue('test-key');
      process.env.APP_URL = 'https://test.ai.megacampus.ru';

      const client = new LLMClient();

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultHeaders: {
            'HTTP-Referer': 'https://test.ai.megacampus.ru',
            'X-Title': 'MegaCampus Course Generator',
          },
        })
      );
    });

    it('should use default APP_URL when not set', () => {
      vi.mocked(getApiKeySync).mockReturnValue('test-key');
      delete process.env.APP_URL;

      const client = new LLMClient();

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultHeaders: {
            'HTTP-Referer': 'https://ai.megacampus.ru',
            'X-Title': 'MegaCampus Course Generator',
          },
        })
      );
    });
  });

  describe('ensureInitialized (via generateCompletion)', () => {
    it('should initialize with API key from database on first call', async () => {
      vi.mocked(getApiKeySync).mockReturnValue(undefined);
      vi.mocked(getOpenRouterApiKey).mockResolvedValue('async-key');

      const client = new LLMClient();
      await client.generateCompletion('test prompt', { model: 'test-model' });

      expect(getOpenRouterApiKey).toHaveBeenCalledTimes(1);
      expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'async-key' }));
    });

    it('should skip initialization when already initialized', async () => {
      vi.mocked(getApiKeySync).mockReturnValue('sync-key');

      const client = new LLMClient();
      await client.generateCompletion('test prompt 1', { model: 'test-model' });
      await client.generateCompletion('test prompt 2', { model: 'test-model' });

      // getOpenRouterApiKey should not be called (already initialized via sync)
      expect(getOpenRouterApiKey).not.toHaveBeenCalled();
      expect(OpenAI).toHaveBeenCalledTimes(1); // Only once during constructor
    });

    it('should throw error when no API key configured', async () => {
      vi.mocked(getApiKeySync).mockReturnValue(undefined);
      vi.mocked(getOpenRouterApiKey).mockResolvedValue(null);

      const client = new LLMClient();

      await expect(
        client.generateCompletion('test prompt', { model: 'test-model' })
      ).rejects.toThrow('OpenRouter API key not configured');
    });

    it('should allow retry on failed initialization', async () => {
      vi.mocked(getApiKeySync).mockReturnValue(undefined);
      vi.mocked(getOpenRouterApiKey)
        .mockRejectedValueOnce(new Error('Database connection failed'))
        .mockResolvedValueOnce('async-key');

      const client = new LLMClient();

      // First call should fail
      await expect(
        client.generateCompletion('test prompt', { model: 'test-model' })
      ).rejects.toThrow('Database connection failed');

      // Second call should succeed
      await client.generateCompletion('test prompt', { model: 'test-model' });

      expect(getOpenRouterApiKey).toHaveBeenCalledTimes(2);
      expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'async-key' }));
    });
  });

  describe('race condition prevention', () => {
    it('should initialize once for concurrent calls', async () => {
      vi.mocked(getApiKeySync).mockReturnValue(undefined);
      vi.mocked(getOpenRouterApiKey).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('async-key'), 50))
      );

      const client = new LLMClient();

      // Make multiple concurrent calls
      const promises = [
        client.generateCompletion('prompt1', { model: 'test-model' }),
        client.generateCompletion('prompt2', { model: 'test-model' }),
        client.generateCompletion('prompt3', { model: 'test-model' }),
      ];

      await Promise.all(promises);

      // getOpenRouterApiKey should be called only once
      expect(getOpenRouterApiKey).toHaveBeenCalledTimes(1);
      expect(OpenAI).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent calls during failed initialization', async () => {
      vi.mocked(getApiKeySync).mockReturnValue(undefined);
      let callCount = 0;
      vi.mocked(getOpenRouterApiKey).mockImplementation(() => {
        callCount++;
        return new Promise((resolve, reject) =>
          setTimeout(() => reject(new Error(`DB error ${callCount}`)), 50)
        );
      });

      const client = new LLMClient();

      // Make multiple concurrent calls that will fail
      const promises = [
        client.generateCompletion('prompt1', { model: 'test-model' }),
        client.generateCompletion('prompt2', { model: 'test-model' }),
        client.generateCompletion('prompt3', { model: 'test-model' }),
      ];

      const results = await Promise.allSettled(promises);

      // All should fail with the same error (single initialization attempt)
      expect(results.every(r => r.status === 'rejected')).toBe(true);
      expect(getOpenRouterApiKey).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshApiKey', () => {
    it('should reinitialize client with new key', async () => {
      vi.mocked(getApiKeySync).mockReturnValue('old-key');
      vi.mocked(getOpenRouterApiKey).mockResolvedValue('new-key');

      const client = new LLMClient();

      // Initial call count
      expect(OpenAI).toHaveBeenCalledTimes(1);
      expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'old-key' }));

      await client.refreshApiKey();

      // Should be called twice now (constructor + refreshApiKey)
      expect(OpenAI).toHaveBeenCalledTimes(2);
      expect(OpenAI).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: 'new-key' }));
      expect(logger.info).toHaveBeenCalledWith('LLMClient API key refreshed');
    });

    it('should throw when no API key available', async () => {
      vi.mocked(getApiKeySync).mockReturnValue(undefined);
      vi.mocked(getOpenRouterApiKey).mockResolvedValue(null);

      const client = new LLMClient();

      await expect(client.refreshApiKey()).rejects.toThrow('OpenRouter API key not configured');
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for openai/gpt-oss-20b', () => {
      const client = new LLMClient();
      const response = {
        content: 'test',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
        model: 'openai/gpt-oss-20b',
        finishReason: 'stop',
      };

      const cost = client.estimateCost(response);

      // $0.03/1M input + $0.14/1M output = $0.17
      expect(cost).toBeCloseTo(0.17, 4);
    });

    it('should estimate cost for deepseek/deepseek-v4-flash', () => {
      const client = new LLMClient();
      const response = {
        content: 'test',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
        model: 'deepseek/deepseek-v4-flash',
        finishReason: 'stop',
      };

      const cost = client.estimateCost(response);

      // $0.10/1M input + $0.20/1M output = $0.30
      expect(cost).toBeCloseTo(0.3, 4);
    });

    it('should estimate cost for google/gemini-3.7-flash', () => {
      const client = new LLMClient();
      const response = {
        content: 'test',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
        model: 'google/gemini-3.7-flash',
        finishReason: 'stop',
      };

      const cost = client.estimateCost(response);

      // $0.375/1M input + $1.875/1M output = $2.25
      expect(cost).toBeCloseTo(2.25, 4);
    });

    it('should use fallback pricing for unknown models', () => {
      const client = new LLMClient();
      const response = {
        content: 'test',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
        model: 'unknown/model',
        finishReason: 'stop',
      };

      const cost = client.estimateCost(response);

      // Fallback: $0.05/1M input + $0.15/1M output = $0.20
      expect(cost).toBeCloseTo(0.2, 4);
    });

    it('should calculate cost for realistic token counts', () => {
      const client = new LLMClient();
      const response = {
        content: 'test',
        inputTokens: 5_000,
        outputTokens: 2_000,
        totalTokens: 7_000,
        model: 'openai/gpt-oss-20b',
        finishReason: 'stop',
      };

      const cost = client.estimateCost(response);

      // (5000/1M * 0.03) + (2000/1M * 0.14) = 0.00015 + 0.00028 = 0.00043
      expect(cost).toBeCloseTo(0.00043, 6);
    });
  });

  describe('createLLMClient factory', () => {
    it('should create and initialize client with database key', async () => {
      vi.mocked(getApiKeySync).mockReturnValue(undefined);
      vi.mocked(getOpenRouterApiKey).mockResolvedValue('factory-key');

      const client = await createLLMClient();

      expect(getOpenRouterApiKey).toHaveBeenCalled();
      expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'factory-key' }));
    });

    it('should throw when no API key available', async () => {
      vi.mocked(getApiKeySync).mockReturnValue(undefined);
      vi.mocked(getOpenRouterApiKey).mockResolvedValue(null);

      await expect(createLLMClient()).rejects.toThrow('OpenRouter API key not configured');
    });
  });

  describe('call budget', () => {
    /**
     * Longest real answer measured through this SDK on dev 2026-08-14: the
     * actual shape of a Stage 4 call took 119.0s. A budget at or below this
     * aborts the model mid-answer, which is what stalled Stage 2 and Stage 4
     * (mc2-wg60c).
     */
    const MEASURED_SLOWEST_ANSWER_MS = 119_000;

    function lastRequestOptions() {
      const instance = vi.mocked(OpenAI).mock.instances.at(-1) as unknown as {
        chat: { completions: { create: ReturnType<typeof vi.fn> } };
      };
      return instance.chat.completions.create.mock.calls.at(-1)?.[1];
    }

    it('gives a call more time than the slowest answer actually measured', async () => {
      vi.mocked(getApiKeySync).mockReturnValue('test-key');

      const client = new LLMClient();
      await client.generateCompletion('test prompt', { model: 'test-model' });

      const options = lastRequestOptions();
      expect(options?.timeout).toBe(DEFAULT_LLM_TIMEOUT_MS);
      expect(options?.timeout).toBeGreaterThan(MEASURED_SLOWEST_ANSWER_MS);
    });

    it('bounds a chat call by the same budget', async () => {
      vi.mocked(getApiKeySync).mockReturnValue('test-key');

      const client = new LLMClient();
      await client.generateChatCompletion([{ role: 'user', content: 'test prompt' }], {
        model: 'test-model',
      });

      const options = lastRequestOptions();
      expect(options?.timeout).toBe(DEFAULT_LLM_TIMEOUT_MS);
      expect(options?.timeout).toBeGreaterThan(MEASURED_SLOWEST_ANSWER_MS);
    });

    it('still lets a caller set its own budget', async () => {
      vi.mocked(getApiKeySync).mockReturnValue('test-key');

      const client = new LLMClient();
      await client.generateCompletion('test prompt', { model: 'test-model', timeout: 5_000 });

      expect(lastRequestOptions()?.timeout).toBe(5_000);
    });
  });
});
