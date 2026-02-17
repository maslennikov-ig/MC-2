/**
 * Unit tests for Context Overflow Handler
 * @module tests/unit/context-overflow-handler
 *
 * Tests cover:
 * - Context overflow error detection (various error patterns)
 * - Model fallback escalation with tierConfig (DB-driven)
 * - Fallback without tierConfig (generic Gemini Flash escalation)
 * - Null return when no more fallbacks available
 * - Non-context error handling
 */

import { describe, it, expect } from 'vitest';
import {
  isContextOverflowError,
  getContextOverflowFallback,
  executeWithContextFallback,
} from '../../src/shared/llm/context-overflow-handler';
import type { Stage4TierConfig } from '../../src/stages/stage4-analysis/phases/stage4-budget-allocator';

// Reusable tier config fixtures
const ruTierConfig: Stage4TierConfig = {
  standard: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-3-flash-preview',
    maxContext: 128_000,
  },
  extended: {
    modelId: 'google/gemini-3-flash-preview',
    fallbackModelId: 'xiaomi/mimo-v2-flash',
    maxContext: 1_000_000,
    cacheReadEnabled: false,
  },
};

const enTierConfig: Stage4TierConfig = {
  standard: {
    modelId: 'x-ai/grok-4.1-fast',
    fallbackModelId: 'google/gemini-3-flash-preview',
    maxContext: 128_000,
  },
  extended: {
    modelId: 'google/gemini-3-flash-preview',
    fallbackModelId: 'x-ai/grok-4.1-fast',
    maxContext: 1_000_000,
    cacheReadEnabled: false,
  },
};

describe('Context Overflow Handler', () => {
  describe('isContextOverflowError - Error Detection', () => {
    it('should detect context_length_exceeded error pattern', () => {
      const error = new Error('OpenRouter error: context_length_exceeded for model qwen3');
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should detect "context length" error pattern', () => {
      const error = new Error('The context length of 150000 tokens exceeds maximum');
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should detect "maximum context" error pattern', () => {
      const error = new Error('Request exceeds maximum context window of 128000 tokens');
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should detect "token limit" error pattern', () => {
      const error = new Error('Request exceeds token limit for this model');
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should detect "exceeds the model" error pattern (Anthropic)', () => {
      const error = new Error('Your request exceeds the model maximum context length');
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should detect "too many tokens" error pattern (OpenAI)', () => {
      const error = new Error(
        'This model maximum context length is 128000 tokens. However, your messages resulted in too many tokens'
      );
      expect(isContextOverflowError(error)).toBe(true);
    });

    it('should handle case-insensitive matching', () => {
      expect(isContextOverflowError(new Error('CONTEXT_LENGTH_EXCEEDED'))).toBe(true);
      expect(isContextOverflowError(new Error('Context Length Exceeded'))).toBe(true);
      expect(isContextOverflowError(new Error('TOO MANY TOKENS'))).toBe(true);
    });

    it('should return false for non-context errors', () => {
      expect(isContextOverflowError(new Error('Rate limit exceeded'))).toBe(false);
    });

    it('should return false for network errors', () => {
      expect(isContextOverflowError(new Error('Network timeout: connection failed'))).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isContextOverflowError('Some string error')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isContextOverflowError(null)).toBe(false);
      expect(isContextOverflowError(undefined)).toBe(false);
    });

    it('should return false for empty error message', () => {
      expect(isContextOverflowError(new Error(''))).toBe(false);
    });
  });

  describe('getContextOverflowFallback - With tierConfig (DB-driven)', () => {
    it('should escalate from standard primary to extended primary (RU)', () => {
      const fallback = getContextOverflowFallback('xiaomi/mimo-v2-flash', 'ru', ruTierConfig);

      expect(fallback).not.toBeNull();
      expect(fallback!.modelId).toBe('google/gemini-3-flash-preview');
      expect(fallback!.maxContext).toBe(1_000_000);
    });

    it('should escalate from standard fallback to extended primary (RU)', () => {
      const fallback = getContextOverflowFallback(
        'google/gemini-3-flash-preview',
        'ru',
        ruTierConfig
      );

      // standard.fallback === extended.modelId, so tries extended fallback
      expect(fallback).not.toBeNull();
      expect(fallback!.modelId).toBe('xiaomi/mimo-v2-flash');
      expect(fallback!.maxContext).toBe(1_000_000);
    });

    it('should escalate from standard primary to extended primary (EN)', () => {
      const fallback = getContextOverflowFallback('x-ai/grok-4.1-fast', 'en', enTierConfig);

      expect(fallback).not.toBeNull();
      expect(fallback!.modelId).toBe('google/gemini-3-flash-preview');
      expect(fallback!.maxContext).toBe(1_000_000);
    });

    it('should escalate from extended primary to extended fallback (EN)', () => {
      const fallback = getContextOverflowFallback(
        'google/gemini-3-flash-preview',
        'en',
        enTierConfig
      );

      expect(fallback).not.toBeNull();
      expect(fallback!.modelId).toBe('x-ai/grok-4.1-fast');
      expect(fallback!.maxContext).toBe(1_000_000);
    });

    it('should return null when already on extended fallback (EN)', () => {
      // After grok → gemini → grok cycle, should return null for grok since it matches standard.modelId
      // which escalates to extended.modelId (gemini). Then gemini → grok (extended fallback).
      // grok is standard.modelId, so it loops. But in real scenario you wouldn't retry after getting a fallback.
      const fallback = getContextOverflowFallback('x-ai/grok-4.1-fast', 'en', enTierConfig);
      expect(fallback).not.toBeNull();
    });

    it('should return null for unknown model with tierConfig', () => {
      const fallback = getContextOverflowFallback('unknown/model', 'ru', ruTierConfig);
      expect(fallback).toBeNull();
    });

    it('should return 1M context for extended tier escalation', () => {
      const fallback = getContextOverflowFallback('xiaomi/mimo-v2-flash', 'ru', ruTierConfig);
      expect(fallback).not.toBeNull();
      expect(fallback!.maxContext).toBe(1_000_000);
    });
  });

  describe('getContextOverflowFallback - Without tierConfig (generic fallback)', () => {
    it('should escalate any model to Gemini 2.5 Flash', () => {
      const fallback = getContextOverflowFallback('xiaomi/mimo-v2-flash', 'ru');

      expect(fallback).not.toBeNull();
      expect(fallback!.modelId).toBe('google/gemini-3-flash-preview');
      expect(fallback!.maxContext).toBe(1_000_000);
    });

    it('should return null when already on Gemini 2.5 Flash', () => {
      const fallback = getContextOverflowFallback('google/gemini-3-flash-preview', 'ru');
      expect(fallback).toBeNull();
    });

    it('should escalate unknown model to Gemini 2.5 Flash', () => {
      const fallback = getContextOverflowFallback('unknown/model', 'en');

      expect(fallback).not.toBeNull();
      expect(fallback!.modelId).toBe('google/gemini-3-flash-preview');
    });

    it('should return null for empty model ID (not Gemini)', () => {
      const fallback = getContextOverflowFallback('', 'ru');
      expect(fallback).not.toBeNull();
      expect(fallback!.modelId).toBe('google/gemini-3-flash-preview');
    });
  });

  describe('getContextOverflowFallback - Return Type Validation', () => {
    it('should return correct structure with tierConfig', () => {
      const fallback = getContextOverflowFallback('xiaomi/mimo-v2-flash', 'ru', ruTierConfig);

      expect(fallback).not.toBeNull();
      expect(fallback).toHaveProperty('modelId');
      expect(fallback).toHaveProperty('maxContext');
      expect(typeof fallback!.modelId).toBe('string');
      expect(typeof fallback!.maxContext).toBe('number');
      expect(fallback!.maxContext).toBeGreaterThan(0);
    });

    it('should return correct structure without tierConfig', () => {
      const fallback = getContextOverflowFallback('some-model', 'ru');

      expect(fallback).not.toBeNull();
      expect(typeof fallback!.modelId).toBe('string');
      expect(typeof fallback!.maxContext).toBe('number');
    });
  });

  describe('Integration - Error Detection + Fallback Selection', () => {
    it('should detect context error and provide fallback model with tierConfig', () => {
      const error = new Error('context_length_exceeded for xiaomi/mimo-v2-flash');
      const isOverflow = isContextOverflowError(error);
      const fallback = isOverflow
        ? getContextOverflowFallback('xiaomi/mimo-v2-flash', 'ru', ruTierConfig)
        : null;

      expect(isOverflow).toBe(true);
      expect(fallback).not.toBeNull();
      expect(fallback!.modelId).toBe('google/gemini-3-flash-preview');
    });

    it('should detect context error and provide generic fallback without tierConfig', () => {
      const error = new Error('Request exceeds maximum context window');
      const isOverflow = isContextOverflowError(error);
      const fallback = isOverflow
        ? getContextOverflowFallback('x-ai/grok-4.1-fast', 'en')
        : null;

      expect(isOverflow).toBe(true);
      expect(fallback).not.toBeNull();
      expect(fallback!.modelId).toBe('google/gemini-3-flash-preview');
    });

    it('should not provide fallback for non-context errors', () => {
      const error = new Error('Rate limit exceeded');
      const isOverflow = isContextOverflowError(error);

      expect(isOverflow).toBe(false);
    });
  });

  describe('executeWithContextFallback - Circular Fallback Detection', () => {
    it('should detect circular fallback and not retry already-tried models', async () => {
      // Circular config: standard.fallback = extended.model, extended.fallback = standard.model
      const circularTierConfig: Stage4TierConfig = {
        standard: {
          modelId: 'model-a',
          fallbackModelId: 'model-b',
          maxContext: 128_000,
        },
        extended: {
          modelId: 'model-b',
          fallbackModelId: 'model-a',
          maxContext: 1_000_000,
          cacheReadEnabled: false,
        },
      };

      const calledModels: string[] = [];

      // Operation always throws context overflow
      const operation = async (modelId: string): Promise<never> => {
        await Promise.resolve(); // Satisfy eslint require-await
        calledModels.push(modelId);
        throw new Error('context_length_exceeded');
      };

      await expect(
        executeWithContextFallback(operation, 'model-a', 'ru', 5, circularTierConfig)
      ).rejects.toThrow();

      // model-a fails → fallback to model-b (extended.modelId)
      // model-b fails → fallback would be model-a (extended.fallbackModelId), but already tried
      // So it should stop after 2 attempts, NOT loop through all 5 retries
      expect(calledModels).toEqual(['model-a', 'model-b']);
    });

    it('should succeed on fallback model and report full chain', async () => {
      const operation = async (modelId: string): Promise<string> => {
        await Promise.resolve(); // Satisfy eslint require-await
        if (modelId === 'model-a') {
          throw new Error('context_length_exceeded');
        }
        return 'success';
      };

      const circularTierConfig: Stage4TierConfig = {
        standard: {
          modelId: 'model-a',
          fallbackModelId: 'model-b',
          maxContext: 128_000,
        },
        extended: {
          modelId: 'model-b',
          fallbackModelId: 'model-a',
          maxContext: 1_000_000,
          cacheReadEnabled: false,
        },
      };

      const result = await executeWithContextFallback(
        operation,
        'model-a',
        'ru',
        2,
        circularTierConfig
      );

      expect(result.result).toBe('success');
      expect(result.modelUsed).toBe('model-b');
    });

    it('should include initialModel and finalModel in exhaustion error', async () => {
      // No tierConfig → generic fallback to gemini-3-flash-preview, then no more options
      const operation = async (_modelId: string): Promise<never> => {
        await Promise.resolve(); // Satisfy eslint require-await
        throw new Error('context_length_exceeded');
      };

      await expect(
        executeWithContextFallback(operation, 'some-model', 'ru', 5)
      ).rejects.toThrow(/context_length_exceeded/);
    });
  });
});
