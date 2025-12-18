/**
 * Context Overflow Handler Tests
 * @module shared/llm/__tests__/context-overflow-handler.test
 */

import {
  isContextOverflowError,
  getContextOverflowFallback,
  executeWithContextFallback,
} from '../context-overflow-handler';

describe('Context Overflow Handler', () => {
  describe('isContextOverflowError', () => {
    it('should detect context_length_exceeded error', () => {
      const error = new Error('context_length_exceeded: The request exceeds the model context');
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should detect context length error', () => {
      const error = new Error('Error: context length exceeded');
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should detect maximum context error', () => {
      const error = new Error('Maximum context window exceeded');
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should detect token limit error', () => {
      const error = new Error('Token limit exceeded');
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should detect too many tokens error', () => {
      const error = new Error('Too many tokens in request');
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should not detect unrelated errors', () => {
      const error = new Error('Network connection failed');
      expect(isContextOverflowError(error)).toBe(false);
    });

    it('should handle non-Error objects', () => {
      expect(isContextOverflowError('string error')).toBe(false);
      expect(isContextOverflowError(null)).toBe(false);
      expect(isContextOverflowError(undefined)).toBe(false);
    });
  });

  describe('getContextOverflowFallback', () => {
    describe('Russian language', () => {
      it('should escalate from standard primary to extended primary', () => {
        const fallback = getContextOverflowFallback('qwen/qwen3-235b-a22b-2507', 'ru');
        expect(fallback).not.toBeNull();
        expect(fallback?.modelId).toBe('google/gemini-2.5-flash-preview-09-2025');
        expect(fallback?.maxContext).toBe(1_000_000);
      });

      it('should escalate from standard fallback to extended primary', () => {
        const fallback = getContextOverflowFallback('moonshotai/kimi-k2-0905', 'ru');
        expect(fallback).not.toBeNull();
        expect(fallback?.modelId).toBe('google/gemini-2.5-flash-preview-09-2025');
      });

      it('should escalate from extended primary to extended fallback', () => {
        const fallback = getContextOverflowFallback('google/gemini-2.5-flash-preview-09-2025', 'ru');
        expect(fallback).not.toBeNull();
        expect(fallback?.modelId).toBe('qwen/qwen-plus-2025-07-28');
      });

      it('should return null when on extended fallback', () => {
        const fallback = getContextOverflowFallback('qwen/qwen-plus-2025-07-28', 'ru');
        expect(fallback).toBeNull();
      });
    });

    describe('English language', () => {
      it('should escalate from standard primary to extended primary', () => {
        const fallback = getContextOverflowFallback('x-ai/grok-4.1-fast:free', 'en');
        expect(fallback).not.toBeNull();
        expect(fallback?.modelId).toBe('x-ai/grok-4.1-fast:free');
      });

      it('should escalate from standard fallback to extended primary', () => {
        const fallback = getContextOverflowFallback('moonshotai/kimi-k2-0905', 'en');
        expect(fallback).not.toBeNull();
        expect(fallback?.modelId).toBe('x-ai/grok-4.1-fast:free');
      });

      it('should escalate from extended primary to extended fallback', () => {
        const fallback = getContextOverflowFallback('x-ai/grok-4.1-fast:free', 'en');
        expect(fallback).not.toBeNull();
        expect(fallback?.modelId).toBe('moonshotai/kimi-linear-48b-a3b-instruct');
      });

      it('should return null when on extended fallback', () => {
        const fallback = getContextOverflowFallback('moonshotai/kimi-linear-48b-a3b-instruct', 'en');
        expect(fallback).toBeNull();
      });
    });
  });

  describe('executeWithContextFallback', () => {
    it('should return result on success without fallback', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const { result, modelUsed } = await executeWithContextFallback(
        operation,
        'qwen/qwen3-235b-a22b-2507',
        'ru'
      );

      expect(result).toBe('success');
      expect(modelUsed).toBe('qwen/qwen3-235b-a22b-2507');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(operation).toHaveBeenCalledWith('qwen/qwen3-235b-a22b-2507');
    });

    it('should retry with fallback on context overflow', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('context_length_exceeded'))
        .mockResolvedValueOnce('success');

      const { result, modelUsed } = await executeWithContextFallback(
        operation,
        'qwen/qwen3-235b-a22b-2507',
        'ru'
      );

      expect(result).toBe('success');
      expect(modelUsed).toBe('google/gemini-2.5-flash-preview-09-2025');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(operation).toHaveBeenNthCalledWith(1, 'qwen/qwen3-235b-a22b-2507');
      expect(operation).toHaveBeenNthCalledWith(2, 'google/gemini-2.5-flash-preview-09-2025');
    });

    it('should retry multiple times until success', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('context_length_exceeded'))
        .mockRejectedValueOnce(new Error('context_length_exceeded'))
        .mockResolvedValueOnce('success');

      const { result, modelUsed } = await executeWithContextFallback(
        operation,
        'qwen/qwen3-235b-a22b-2507',
        'ru'
      );

      expect(result).toBe('success');
      expect(modelUsed).toBe('qwen/qwen-plus-2025-07-28');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw error when fallbacks exhausted', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new Error('context_length_exceeded'));

      await expect(
        executeWithContextFallback(operation, 'qwen/qwen3-235b-a22b-2507', 'ru')
      ).rejects.toThrow('Context overflow: exhausted all fallback models after 2 retries');

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should throw non-context-overflow errors immediately', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new Error('Network error'));

      await expect(
        executeWithContextFallback(operation, 'qwen/qwen3-235b-a22b-2507', 'ru')
      ).rejects.toThrow('Network error');

      expect(operation).toHaveBeenCalledTimes(1); // No retries
    });

    it('should respect maxRetries parameter', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new Error('context_length_exceeded'));

      await expect(
        executeWithContextFallback(operation, 'qwen/qwen3-235b-a22b-2507', 'ru', 1)
      ).rejects.toThrow('Context overflow: exhausted all fallback models after 1 retries');

      expect(operation).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });
});
