/**
 * Unit Tests: Cost Calculator Service
 *
 * Comprehensive test coverage for token-based cost calculation.
 *
 * Test Cases:
 * 1. Accurate cost calculation for all supported models
 * 2. Edge cases (zero tokens, large numbers, fractional costs)
 * 3. Error handling (unknown models, negative tokens)
 * 4. Helper functions (isModelSupported, getSupportedModels)
 */

import { describe, it, expect } from 'vitest';
import {
  estimateCost,
  calculateCostBreakdown,
  MODEL_PRICING,
  getSupportedModels,
  isModelSupported,
  UnknownModelError,
  InvalidTokenCountError,
  CostOverflowError,
} from '../../src/orchestrator/services/cost-calculator';

describe('Cost Calculator Service', () => {
  describe('estimateCost()', () => {
    describe('Model-specific cost calculations', () => {
      it('should calculate cost for GPT OSS 20B correctly', () => {
        // 50K input + 5K output
        // Expected: (50000/1M * 0.03) + (5000/1M * 0.14) = 0.0015 + 0.0007 = 0.0022
        const cost = estimateCost('openai/gpt-oss-20b', 50000, 5000);
        expect(cost).toBeCloseTo(0.0022, 6);
      });

      it('should calculate cost for GPT OSS 120B correctly', () => {
        // 50K input + 5K output
        // Expected: (50000/1M * 0.04) + (5000/1M * 0.40) = 0.002 + 0.002 = 0.004
        const cost = estimateCost('openai/gpt-oss-120b', 50000, 5000);
        expect(cost).toBeCloseTo(0.004, 6);
      });

      it('should calculate cost for Gemini 2.5 Flash Preview correctly', () => {
        // 50K input + 5K output
        // Expected: (50000/1M * 0.10) + (5000/1M * 0.40) = 0.005 + 0.002 = 0.007
        const cost = estimateCost('google/gemini-2.5-flash-preview', 50000, 5000);
        expect(cost).toBeCloseTo(0.007, 6);
      });

      it('should calculate cost for Claude 3.5 Sonnet correctly', () => {
        // 50K input + 5K output
        // Expected: (50000/1M * 3.00) + (5000/1M * 15.00) = 0.15 + 0.075 = 0.225
        const cost = estimateCost('anthropic/claude-3.5-sonnet', 50000, 5000);
        expect(cost).toBeCloseTo(0.225, 6);
      });

      it('should calculate cost for GPT-4 Turbo correctly', () => {
        // 50K input + 5K output
        // Expected: (50000/1M * 10.00) + (5000/1M * 30.00) = 0.5 + 0.15 = 0.65
        const cost = estimateCost('openai/gpt-4-turbo', 50000, 5000);
        expect(cost).toBeCloseTo(0.65, 6);
      });
    });

    describe('Edge cases', () => {
      it('should return 0 for zero tokens', () => {
        const cost = estimateCost('openai/gpt-oss-20b', 0, 0);
        expect(cost).toBe(0.0);
      });

      it('should handle large token counts correctly', () => {
        // 1M input + 100K output for GPT OSS 20B
        // Expected: (1000000/1M * 0.03) + (100000/1M * 0.14) = 0.03 + 0.014 = 0.044
        const cost = estimateCost('openai/gpt-oss-20b', 1_000_000, 100_000);
        expect(cost).toBeCloseTo(0.044, 6);
      });

      it('should handle fractional token costs correctly', () => {
        // Very small token counts (1 input + 1 output)
        // Expected: (1/1M * 0.03) + (1/1M * 0.14) = 0.00000003 + 0.00000014 = 0.00000017
        const cost = estimateCost('openai/gpt-oss-20b', 1, 1);
        expect(cost).toBeCloseTo(0.00000017, 8);
      });

      it('should handle input-only tokens', () => {
        // 10K input + 0 output
        // Expected: (10000/1M * 0.03) + 0 = 0.0003
        const cost = estimateCost('openai/gpt-oss-20b', 10000, 0);
        expect(cost).toBeCloseTo(0.0003, 6);
      });

      it('should handle output-only tokens', () => {
        // 0 input + 10K output
        // Expected: 0 + (10000/1M * 0.14) = 0.0014
        const cost = estimateCost('openai/gpt-oss-20b', 0, 10000);
        expect(cost).toBeCloseTo(0.0014, 6);
      });
    });

    describe('Error handling', () => {
      it('should throw UnknownModelError for unknown model', () => {
        expect(() => {
          estimateCost('unknown/model', 1000, 1000);
        }).toThrow(UnknownModelError);
      });

      it('should include available models in UnknownModelError message', () => {
        try {
          estimateCost('unknown/model', 1000, 1000);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(UnknownModelError);
          expect((error as UnknownModelError).model).toBe('unknown/model');
          expect((error as Error).message).toContain('Available models:');
          expect((error as Error).message).toContain('openai/gpt-oss-20b');
        }
      });

      it('should throw InvalidTokenCountError for negative input tokens', () => {
        try {
          estimateCost('openai/gpt-oss-20b', -1000, 1000);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidTokenCountError);
          expect((error as InvalidTokenCountError).tokens).toBe(-1000);
          expect((error as InvalidTokenCountError).type).toBe('input');
          expect((error as Error).message).toContain('Invalid input token count');
        }
      });

      it('should throw InvalidTokenCountError for negative output tokens', () => {
        try {
          estimateCost('openai/gpt-oss-20b', 1000, -1000);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidTokenCountError);
          expect((error as InvalidTokenCountError).tokens).toBe(-1000);
          expect((error as InvalidTokenCountError).type).toBe('output');
          expect((error as Error).message).toContain('Invalid output token count');
        }
      });

      it('should throw InvalidTokenCountError for NaN input tokens', () => {
        try {
          estimateCost('openai/gpt-oss-20b', NaN, 1000);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidTokenCountError);
          expect((error as InvalidTokenCountError).type).toBe('input');
        }
      });

      it('should throw InvalidTokenCountError for NaN output tokens', () => {
        try {
          estimateCost('openai/gpt-oss-20b', 1000, NaN);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidTokenCountError);
          expect((error as InvalidTokenCountError).type).toBe('output');
        }
      });

      it('should throw InvalidTokenCountError for Infinity input tokens', () => {
        try {
          estimateCost('openai/gpt-oss-20b', Infinity, 1000);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidTokenCountError);
          expect((error as InvalidTokenCountError).type).toBe('input');
        }
      });

      it('should throw CostOverflowError when cost exceeds $1000', () => {
        // 100M input tokens + 10M output tokens with GPT-4 Turbo
        // Expected: (100M/1M * 10.0) + (10M/1M * 30.0) = 1000 + 300 = $1300
        try {
          estimateCost('openai/gpt-4-turbo', 100_000_000, 10_000_000);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(CostOverflowError);
          expect((error as CostOverflowError).cost).toBeGreaterThan(1000);
          expect((error as CostOverflowError).threshold).toBe(1000);
          expect((error as Error).message).toContain('Cost calculation overflow');
          expect((error as Error).message).toContain('exceeds threshold $1000');
        }
      });

      it('should NOT throw CostOverflowError when cost is exactly $1000', () => {
        // Edge case: exactly $1000 should pass
        // 100M input tokens for GPT-4 Turbo = (100M/1M * 10.0) = $1000
        const cost = estimateCost('openai/gpt-4-turbo', 100_000_000, 0);
        expect(cost).toBe(1000);
      });

      it('should NOT throw CostOverflowError when cost is below $1000', () => {
        // 50M input tokens for GPT-4 Turbo = (50M/1M * 10.0) = $500
        const cost = estimateCost('openai/gpt-4-turbo', 50_000_000, 0);
        expect(cost).toBe(500);
      });
    });

    describe('Real-world scenarios', () => {
      it('should calculate typical document summarization cost', () => {
        // Typical: 100K input (document) + 10K output (summary)
        const cost = estimateCost('openai/gpt-oss-20b', 100000, 10000);
        // Expected: (100000/1M * 0.03) + (10000/1M * 0.14) = 0.003 + 0.0014 = 0.0044
        expect(cost).toBeCloseTo(0.0044, 6);
      });

      it('should calculate batch processing cost', () => {
        // Process 10 documents (50K input each + 5K output each)
        const singleCost = estimateCost('openai/gpt-oss-20b', 50000, 5000);
        const batchCost = singleCost * 10;
        // Expected: 0.0022 * 10 = 0.022
        expect(batchCost).toBeCloseTo(0.022, 6);
      });
    });
  });

  describe('calculateCostBreakdown()', () => {
    it('should return detailed cost breakdown', () => {
      const result = calculateCostBreakdown('openai/gpt-oss-20b', 50000, 5000);

      expect(result.model).toBe('openai/gpt-oss-20b');
      expect(result.inputTokens).toBe(50000);
      expect(result.outputTokens).toBe(5000);
      expect(result.totalTokens).toBe(55000);
      expect(result.inputCost).toBeCloseTo(0.0015, 6);
      expect(result.outputCost).toBeCloseTo(0.0007, 6);
      expect(result.totalCost).toBeCloseTo(0.0022, 6);
    });

    it('should include timestamp', () => {
      const result = calculateCostBreakdown('openai/gpt-oss-20b', 50000, 5000);

      expect(result.calculatedAt).toBeDefined();
      expect(new Date(result.calculatedAt).getTime()).toBeLessThanOrEqual(
        Date.now()
      );
    });

    it('should match estimateCost() total', () => {
      const inputTokens = 75000;
      const outputTokens = 12000;
      const model = 'google/gemini-2.5-flash-preview';

      const simpleCost = estimateCost(model, inputTokens, outputTokens);
      const breakdown = calculateCostBreakdown(model, inputTokens, outputTokens);

      expect(breakdown.totalCost).toBeCloseTo(simpleCost, 10);
    });

    it('should throw UnknownModelError for unknown model', () => {
      expect(() => {
        calculateCostBreakdown('unknown/model', 1000, 1000);
      }).toThrow(UnknownModelError);
    });

    it('should throw InvalidTokenCountError for negative tokens', () => {
      expect(() => {
        calculateCostBreakdown('openai/gpt-oss-20b', -1000, 1000);
      }).toThrow(InvalidTokenCountError);
    });

    it('should throw CostOverflowError when cost exceeds $1000', () => {
      expect(() => {
        calculateCostBreakdown('openai/gpt-4-turbo', 100_000_000, 10_000_000);
      }).toThrow(CostOverflowError);
    });
  });

  describe('getSupportedModels()', () => {
    it('should return all supported models', () => {
      const models = getSupportedModels();

      expect(models).toContain('openai/gpt-oss-20b');
      expect(models).toContain('openai/gpt-oss-120b');
      expect(models).toContain('google/gemini-2.5-flash-preview');
      expect(models).toContain('anthropic/claude-3.5-sonnet');
      expect(models).toContain('openai/gpt-4-turbo');
    });

    it('should match MODEL_PRICING keys', () => {
      const models = getSupportedModels();
      const pricingKeys = Object.keys(MODEL_PRICING);

      expect(models.sort()).toEqual(pricingKeys.sort());
    });

    it('should return at least 5 models', () => {
      const models = getSupportedModels();
      expect(models.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('isModelSupported()', () => {
    it('should return true for supported models', () => {
      expect(isModelSupported('openai/gpt-oss-20b')).toBe(true);
      expect(isModelSupported('openai/gpt-oss-120b')).toBe(true);
      expect(isModelSupported('google/gemini-2.5-flash-preview')).toBe(true);
      expect(isModelSupported('anthropic/claude-3.5-sonnet')).toBe(true);
      expect(isModelSupported('openai/gpt-4-turbo')).toBe(true);
    });

    it('should return false for unsupported models', () => {
      expect(isModelSupported('unknown/model')).toBe(false);
      expect(isModelSupported('gpt-3.5-turbo')).toBe(false);
      expect(isModelSupported('')).toBe(false);
    });
  });

  describe('MODEL_PRICING consistency', () => {
    it('should have all required pricing fields', () => {
      const models = Object.keys(MODEL_PRICING);

      models.forEach((model) => {
        expect(MODEL_PRICING[model]).toHaveProperty('inputPer1M');
        expect(MODEL_PRICING[model]).toHaveProperty('outputPer1M');
      });
    });

    it('should have positive pricing values', () => {
      const models = Object.keys(MODEL_PRICING);

      models.forEach((model) => {
        expect(MODEL_PRICING[model].inputPer1M).toBeGreaterThan(0);
        expect(MODEL_PRICING[model].outputPer1M).toBeGreaterThan(0);
      });
    });

    it('should have output pricing >= input pricing (OpenRouter pattern)', () => {
      const models = Object.keys(MODEL_PRICING);

      models.forEach((model) => {
        // Output tokens typically cost more or equal to input tokens
        expect(MODEL_PRICING[model].outputPer1M).toBeGreaterThanOrEqual(
          MODEL_PRICING[model].inputPer1M
        );
      });
    });
  });
});
