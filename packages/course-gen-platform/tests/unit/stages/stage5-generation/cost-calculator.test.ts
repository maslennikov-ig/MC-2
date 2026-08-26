/**
 * Unit Tests: Stage 5 Cost Calculator Service
 *
 * Comprehensive test coverage for OpenRouter-based cost calculation.
 *
 * Test Coverage:
 * 1. Cost calculation accuracy for all supported models
 * 2. Edge cases (zero tokens, large numbers, fractional costs)
 * 3. Cost status assessment (thresholds)
 * 4. Helper functions (formatCost, getModelPricing, estimateCost)
 * 5. Integration with GenerationMetadata schema
 *
 * @see packages/course-gen-platform/src/services/stage5/cost-calculator.ts
 */

import { describe, it, expect } from 'vitest';
import {
  calculateGenerationCost,
  assessCostStatus,
  OPENROUTER_PRICING,
  COST_THRESHOLDS,
  formatCost,
  getModelPricing,
  hasUnifiedPricing,
  estimateCost,
  validateQwen3MaxContext,
} from '@/shared/llm/cost-calculator';
import { MODEL_CATALOG } from '@megacampus/shared-types';
import type { GenerationMetadata } from '@megacampus/shared-types/generation-result';

describe('Stage 5 Cost Calculator Service', () => {
  // ============================================================================
  // OPENROUTER_PRICING VALIDATION
  // ============================================================================

  // `OPENROUTER_PRICING` is a projection of `MODEL_CATALOG`, not a second table,
  // so what is worth holding here is the projection — that each model arrives
  // with the rates the catalogue has and with split-vs-combined preserved.
  //
  // These cases used to retype the rates. That made this the THIRD copy of the
  // same numbers, after the catalogue itself and the snapshot in
  // `model-catalog-coverage.test.ts`, and on 2026-08-23 a single re-read of
  // three DeepSeek entries turned eight tests in five files red without any of
  // them having found a defect (mc2-ts9i2). The rates have one owner: the
  // catalogue, its deliberate offline snapshot, and the nightly drift check
  // against the published list.
  describe('OPENROUTER_PRICING configuration', () => {
    it.each([
      'qwen/qwen3-max',
      'openai/gpt-oss-20b',
      'deepseek/deepseek-v4-flash',
      'google/gemini-3.7-flash',
    ])('projects %s straight from the catalogue', modelId => {
      const pricing = OPENROUTER_PRICING[modelId];
      const catalogued = MODEL_CATALOG[modelId];

      expect(pricing).toBeDefined();
      expect(pricing.inputPricePerMillion).toBe(catalogued.inputPricePerMillion);
      expect(pricing.outputPricePerMillion).toBe(catalogued.outputPricePerMillion);
      // Split pricing, not a single blended rate: a combined figure here would
      // silently double-count whichever leg is dearer.
      expect(pricing.combinedPricePerMillion).toBeUndefined();
    });

    it('carries every catalogued model, so a new one cannot be priced at zero', () => {
      expect(Object.keys(OPENROUTER_PRICING).sort()).toEqual(Object.keys(MODEL_CATALOG).sort());
    });

    it('should have positive pricing values for all models', () => {
      Object.entries(OPENROUTER_PRICING).forEach(([, pricing]) => {
        expect(pricing.inputPricePerMillion).toBeGreaterThan(0);
        expect(pricing.outputPricePerMillion).toBeGreaterThan(0);
      });
    });
  });

  describe('qwen3-max base-rate guard', () => {
    it('allows the base tier and rejects the first token in the higher-price tier', () => {
      expect(() => validateQwen3MaxContext(31_999)).not.toThrow();
      expect(() => validateQwen3MaxContext(32_000)).toThrow(/32,000/u);
    });
  });

  // ============================================================================
  // COST THRESHOLDS VALIDATION
  // ============================================================================

  describe('COST_THRESHOLDS configuration', () => {
    it('should have correct threshold values from RT-001', () => {
      expect(COST_THRESHOLDS.EXPECTED_MIN).toBe(0.53);
      expect(COST_THRESHOLDS.EXPECTED_MAX).toBe(0.63);
      expect(COST_THRESHOLDS.WITH_RETRIES_MAX).toBe(0.76);
      expect(COST_THRESHOLDS.HARD_LIMIT).toBe(0.9);
    });

    it('should have thresholds in ascending order', () => {
      expect(COST_THRESHOLDS.EXPECTED_MIN).toBeLessThan(COST_THRESHOLDS.EXPECTED_MAX);
      expect(COST_THRESHOLDS.EXPECTED_MAX).toBeLessThan(COST_THRESHOLDS.WITH_RETRIES_MAX);
      expect(COST_THRESHOLDS.WITH_RETRIES_MAX).toBeLessThan(COST_THRESHOLDS.HARD_LIMIT);
    });
  });

  // ============================================================================
  // CALCULATE GENERATION COST
  // ============================================================================

  describe('calculateGenerationCost()', () => {
    it('should calculate cost for typical generation with qwen3-max metadata + deepseek-v4-flash sections', () => {
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'qwen/qwen3-max',
          sections: 'deepseek/deepseek-v4-flash',
        },
        total_tokens: {
          metadata: 5000,
          sections: 45000,
          validation: 0,
          total: 50000,
        },
        cost_usd: 0, // Will be calculated
        duration_ms: { metadata: 1000, sections: 5000, validation: 0, total: 6000 },
        quality_scores: { metadata_similarity: 0.95, sections_similarity: [0.92], overall: 0.93 },
        batch_count: 1,
        retry_count: { metadata: 0, sections: [0] },
        created_at: new Date().toISOString(),
      };

      const cost = calculateGenerationCost(metadata);

      // What this case holds is the 50/50 token split and the summing, not the
      // rates — those belong to the catalogue (see the projection cases above).
      const half = (modelId: string, tokens: number): number =>
        ((tokens / 2) * MODEL_CATALOG[modelId].inputPricePerMillion) / 1e6 +
        ((tokens / 2) * MODEL_CATALOG[modelId].outputPricePerMillion) / 1e6;

      const expectedMetadata = half('qwen/qwen3-max', 5000);
      const expectedSections = half('deepseek/deepseek-v4-flash', 45000);

      expect(cost.metadata_cost_usd).toBeCloseTo(expectedMetadata, 6);
      expect(cost.sections_cost_usd).toBeCloseTo(expectedSections, 6);

      // Validation cost: 0
      expect(cost.validation_cost_usd).toBe(0);

      expect(cost.total_cost_usd).toBeCloseTo(expectedMetadata + expectedSections, 6);

      // Token breakdown
      expect(cost.token_breakdown.metadata_tokens).toBe(5000);
      expect(cost.token_breakdown.sections_tokens).toBe(45000);
      expect(cost.token_breakdown.validation_tokens).toBe(0);
      expect(cost.token_breakdown.total_tokens).toBe(50000);

      // Model breakdown
      expect(cost.model_breakdown.metadata_model).toBe('qwen/qwen3-max');
      expect(cost.model_breakdown.sections_model).toBe('deepseek/deepseek-v4-flash');
      expect(cost.model_breakdown.validation_model).toBe('none');
    });

    it('should calculate cost with all phases (metadata + sections + validation)', () => {
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'qwen/qwen3-max',
          sections: 'openai/gpt-oss-20b',
          validation: 'google/gemini-3.7-flash',
        },
        total_tokens: {
          metadata: 10000,
          sections: 50000,
          validation: 5000,
          total: 65000,
        },
        cost_usd: 0,
        duration_ms: { metadata: 2000, sections: 10000, validation: 1000, total: 13000 },
        quality_scores: {
          metadata_similarity: 0.94,
          sections_similarity: [0.91, 0.93],
          overall: 0.92,
        },
        batch_count: 2,
        retry_count: { metadata: 1, sections: [0, 1] },
        created_at: new Date().toISOString(),
      };

      const cost = calculateGenerationCost(metadata);

      // Metadata cost (qwen3-max, 50/50): (5000/1M * 0.78) + (5000/1M * 3.90) = 0.0234
      expect(cost.metadata_cost_usd).toBeCloseTo(0.0234, 6);

      // Sections cost (gpt-oss-20b, 50/50): (25000/1M * 0.03) + (25000/1M * 0.13) = 0.004
      expect(cost.sections_cost_usd).toBeCloseTo(0.004, 6);

      // Validation cost (gemini-3.7-flash, split, 50/50): (2500/1M * 0.375) + (2500/1M * 1.875) = 0.0009375 + 0.0046875 = 0.005625
      expect(cost.validation_cost_usd).toBeCloseTo(0.005625, 6);

      // Total cost: 0.0234 + 0.004 + 0.005625 = 0.033025
      expect(cost.total_cost_usd).toBeCloseTo(0.033025, 6);

      // Model breakdown
      expect(cost.model_breakdown.validation_model).toBe('google/gemini-3.7-flash');
    });

    it('should handle zero tokens gracefully', () => {
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'qwen/qwen3-max',
          sections: 'openai/gpt-oss-20b',
        },
        total_tokens: {
          metadata: 0,
          sections: 0,
          validation: 0,
          total: 0,
        },
        cost_usd: 0,
        duration_ms: { metadata: 0, sections: 0, validation: 0, total: 0 },
        quality_scores: { metadata_similarity: 0, sections_similarity: [], overall: 0 },
        batch_count: 0,
        retry_count: { metadata: 0, sections: [] },
        created_at: new Date().toISOString(),
      };

      const cost = calculateGenerationCost(metadata);

      expect(cost.metadata_cost_usd).toBe(0);
      expect(cost.sections_cost_usd).toBe(0);
      expect(cost.validation_cost_usd).toBe(0);
      expect(cost.total_cost_usd).toBe(0);
    });

    it('should handle unknown models by returning $0 and logging warning', () => {
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'unknown/model',
          sections: 'openai/gpt-oss-20b',
        },
        total_tokens: {
          metadata: 10000,
          sections: 50000,
          validation: 0,
          total: 60000,
        },
        cost_usd: 0,
        duration_ms: { metadata: 1000, sections: 5000, validation: 0, total: 6000 },
        quality_scores: { metadata_similarity: 0.95, sections_similarity: [0.92], overall: 0.93 },
        batch_count: 1,
        retry_count: { metadata: 0, sections: [0] },
        created_at: new Date().toISOString(),
      };

      const cost = calculateGenerationCost(metadata);

      // Unknown model should return $0 cost
      expect(cost.metadata_cost_usd).toBe(0);

      // Known model should calculate normally
      expect(cost.sections_cost_usd).toBeCloseTo(0.004, 6);

      // And the total says so. Ten thousand tokens contributed nothing to it,
      // which without this field is indistinguishable from a course that really
      // cost that much (mc2-heljn).
      expect(cost.unpriced_models).toEqual(['unknown/model']);
    });

    it('leaves the marker off when every phase model had a rate', () => {
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'qwen/qwen3-max',
          sections: 'openai/gpt-oss-20b',
        },
        total_tokens: { metadata: 10000, sections: 50000, validation: 0, total: 60000 },
        cost_usd: 0,
        duration_ms: { metadata: 1000, sections: 5000, validation: 0, total: 6000 },
        quality_scores: { metadata_similarity: 0.95, sections_similarity: [0.92], overall: 0.93 },
        batch_count: 1,
        retry_count: { metadata: 0, sections: [0] },
        created_at: new Date().toISOString(),
      };

      expect(calculateGenerationCost(metadata).unpriced_models).toBeUndefined();
    });
  });

  // ============================================================================
  // ASSESS COST STATUS
  // ============================================================================

  describe('assessCostStatus()', () => {
    it('should return WITHIN_TARGET for cost <= $0.63', () => {
      const status = assessCostStatus(0.55);

      expect(status.status).toBe('WITHIN_TARGET');
      expect(status.threshold).toBe(COST_THRESHOLDS.EXPECTED_MAX);
      expect(status.message).toContain('$0.5500');
      expect(status.message).toContain('within expected range');
    });

    it('should return ACCEPTABLE_WITH_RETRIES for cost $0.64-$0.76', () => {
      const status = assessCostStatus(0.7);

      expect(status.status).toBe('ACCEPTABLE_WITH_RETRIES');
      expect(status.threshold).toBe(COST_THRESHOLDS.WITH_RETRIES_MAX);
      expect(status.message).toContain('$0.7000');
      expect(status.message).toContain('acceptable with retry overhead');
    });

    it('should return HIGH_COST_WARNING for cost $0.77-$0.90', () => {
      const status = assessCostStatus(0.85);

      expect(status.status).toBe('HIGH_COST_WARNING');
      expect(status.threshold).toBe(COST_THRESHOLDS.HARD_LIMIT);
      expect(status.message).toContain('$0.8500');
      expect(status.message).toContain('approaching hard limit');
      expect(status.message).toContain('Investigation recommended');
    });

    it('should return EXCEEDS_LIMIT for cost > $0.90', () => {
      const status = assessCostStatus(1.05);

      expect(status.status).toBe('EXCEEDS_LIMIT');
      expect(status.threshold).toBe(COST_THRESHOLDS.HARD_LIMIT);
      expect(status.message).toContain('$1.0500');
      expect(status.message).toContain('exceeds hard limit');
      expect(status.message).toContain('Immediate optimization required');
    });

    it('should handle boundary values correctly', () => {
      // Exactly at EXPECTED_MAX (0.63)
      expect(assessCostStatus(0.63).status).toBe('WITHIN_TARGET');

      // Just above EXPECTED_MAX (0.64)
      expect(assessCostStatus(0.64).status).toBe('ACCEPTABLE_WITH_RETRIES');

      // Exactly at WITH_RETRIES_MAX (0.76)
      expect(assessCostStatus(0.76).status).toBe('ACCEPTABLE_WITH_RETRIES');

      // Just above WITH_RETRIES_MAX (0.77)
      expect(assessCostStatus(0.77).status).toBe('HIGH_COST_WARNING');

      // Exactly at HARD_LIMIT (0.90)
      expect(assessCostStatus(0.9).status).toBe('HIGH_COST_WARNING');

      // Just above HARD_LIMIT (0.91)
      expect(assessCostStatus(0.91).status).toBe('EXCEEDS_LIMIT');
    });

    it('should handle $0 cost', () => {
      const status = assessCostStatus(0);

      expect(status.status).toBe('WITHIN_TARGET');
      expect(status.message).toContain('$0.0000');
    });
  });

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  describe('formatCost()', () => {
    it('should format cost with 4 decimal places', () => {
      expect(formatCost(0.3567)).toBe('$0.3567');
      expect(formatCost(0.1)).toBe('$0.1000');
      expect(formatCost(1.2345678)).toBe('$1.2346'); // Rounding
    });

    it('should handle zero cost', () => {
      expect(formatCost(0)).toBe('$0.0000');
    });

    it('should handle very small costs', () => {
      expect(formatCost(0.0001)).toBe('$0.0001');
      expect(formatCost(0.00001)).toBe('$0.0000');
    });

    it('should handle large costs', () => {
      expect(formatCost(100.5678)).toBe('$100.5678');
    });
  });

  describe('getModelPricing()', () => {
    it('should return pricing for known models', () => {
      const pricing = getModelPricing('qwen/qwen3-max');

      expect(pricing).not.toBeNull();
      expect(pricing?.inputPricePerMillion).toBe(0.78);
      expect(pricing?.outputPricePerMillion).toBe(3.9);
    });

    it('should return null for unknown models', () => {
      const pricing = getModelPricing('unknown/model');

      expect(pricing).toBeNull();
    });
  });

  describe('hasUnifiedPricing()', () => {
    it('should return false for models with split pricing', () => {
      expect(hasUnifiedPricing('openai/gpt-oss-20b')).toBe(false);
      expect(hasUnifiedPricing('qwen/qwen3-max')).toBe(false);
      expect(hasUnifiedPricing('deepseek/deepseek-v4-flash')).toBe(false);
    });

    it('should return false for unknown models', () => {
      expect(hasUnifiedPricing('unknown/model')).toBe(false);
    });
  });

  describe('estimateCost()', () => {
    it('should estimate cost for gpt-oss-20b split pricing', () => {
      const cost = estimateCost('openai/gpt-oss-20b', 10000, 0);

      // 50/50 split: (5000/1M * 0.03) + (5000/1M * 0.13) = 0.0008
      expect(cost).toBeCloseTo(0.0008, 6);
    });

    it('should estimate cost for split pricing model with 50/50 assumption', () => {
      const cost = estimateCost('qwen/qwen3-max', 10000, 0);

      // 50/50 split: (5000/1M * 0.78) + (5000/1M * 3.90) = 0.0234
      expect(cost).toBeCloseTo(0.0234, 6);
    });

    it('answers "not measured" for an unknown model rather than "free"', () => {
      // It used to answer $0, and a caller that reaches for an estimate has
      // already failed to find a stated charge and an endpoint rate — so the
      // zero was spent as if the call had been free. Same falsy-zero that once
      // corrupted the query used to find unpriced calls (mc2-y452l, mc2-heljn).
      expect(estimateCost('unknown/model', 10000, 0)).toBeUndefined();
    });

    it('prices the dated snapshot the provider actually served', () => {
      // A request naming `openai/gpt-5.6-luna` came back
      // `openai/gpt-5.6-luna-20260709` on 2026-08-25. Looked up by exact key
      // that is an unknown model; `normalizeModelId` prices it from its base.
      expect(estimateCost('openai/gpt-5.6-luna-20260709', 10000, 0)).toBe(
        estimateCost('openai/gpt-5.6-luna', 10000, 0)
      );
      expect(estimateCost('openai/gpt-5.6-luna-20260709', 10000, 0)).toBeGreaterThan(0);
    });

    it('still reports a genuine zero for zero tokens', () => {
      // The distinction the return type now carries: nothing to charge for is a
      // measurement, no rate to charge by is not.
      expect(estimateCost('openai/gpt-oss-20b', 0, 0)).toBe(0);
    });
  });

  // ============================================================================
  // REAL-WORLD SCENARIOS (RT-001 COST TARGETS)
  // ============================================================================

  describe('Real-world cost scenarios (RT-001)', () => {
    it('should achieve expected cost range for typical course generation', () => {
      // RT-001 expected: $0.53-0.63 per course
      // Metadata: 5K tokens (qwen3-max)
      // Sections: 45K tokens (deepseek-v4-flash)
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'qwen/qwen3-max',
          sections: 'deepseek/deepseek-v4-flash',
        },
        total_tokens: {
          metadata: 5000,
          sections: 45000,
          validation: 0,
          total: 50000,
        },
        cost_usd: 0,
        duration_ms: { metadata: 1000, sections: 5000, validation: 0, total: 6000 },
        quality_scores: { metadata_similarity: 0.95, sections_similarity: [0.92], overall: 0.93 },
        batch_count: 1,
        retry_count: { metadata: 0, sections: [0] },
        created_at: new Date().toISOString(),
      };

      const cost = calculateGenerationCost(metadata);
      const status = assessCostStatus(cost.total_cost_usd);

      // Cost should be well below expected range (this is a minimal example)
      expect(cost.total_cost_usd).toBeLessThan(COST_THRESHOLDS.EXPECTED_MIN);
    });

    it('should handle cost with retries (RT-004)', () => {
      // RT-004 with retries: $0.63-0.76
      // Simulate higher token usage due to retries
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'qwen/qwen3-max',
          sections: 'deepseek/deepseek-v4-flash',
          validation: 'google/gemini-3.7-flash',
        },
        total_tokens: {
          metadata: 8000, // +60% due to retries
          sections: 72000, // +60% due to retries
          validation: 5000,
          total: 85000,
        },
        cost_usd: 0,
        duration_ms: { metadata: 3000, sections: 12000, validation: 1000, total: 16000 },
        quality_scores: {
          metadata_similarity: 0.93,
          sections_similarity: [0.89, 0.91],
          overall: 0.9,
        },
        batch_count: 2,
        retry_count: { metadata: 2, sections: [1, 2] },
        created_at: new Date().toISOString(),
      };

      const cost = calculateGenerationCost(metadata);
      const status = assessCostStatus(cost.total_cost_usd);

      // Even with retries, cost should be manageable
      expect(cost.total_cost_usd).toBeLessThan(COST_THRESHOLDS.WITH_RETRIES_MAX);
    });
  });
});
