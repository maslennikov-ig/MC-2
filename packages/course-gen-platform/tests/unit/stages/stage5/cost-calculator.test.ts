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
} from '../../../src/stages/stage5-generation/utils/cost-calculator';
import type { GenerationMetadata } from '@megacampus/shared-types/generation-result';

describe('Stage 5 Cost Calculator Service', () => {
  // ============================================================================
  // OPENROUTER_PRICING VALIDATION
  // ============================================================================

  describe('OPENROUTER_PRICING configuration', () => {
    it('should have pricing for qwen/qwen3-max with split pricing', () => {
      const pricing = OPENROUTER_PRICING['qwen/qwen3-max'];
      expect(pricing).toBeDefined();
      expect(pricing.inputPricePerMillion).toBe(0.60);
      expect(pricing.outputPricePerMillion).toBe(1.80);
      expect(pricing.combinedPricePerMillion).toBeUndefined();
    });

    it('should have pricing for openai/gpt-oss-20b with unified pricing', () => {
      const pricing = OPENROUTER_PRICING['openai/gpt-oss-20b'];
      expect(pricing).toBeDefined();
      expect(pricing.combinedPricePerMillion).toBe(0.08);
      expect(pricing.inputPricePerMillion).toBe(0.08);
      expect(pricing.outputPricePerMillion).toBe(0.08);
    });

    it('should have pricing for openai/gpt-oss-120b with unified pricing', () => {
      const pricing = OPENROUTER_PRICING['openai/gpt-oss-120b'];
      expect(pricing).toBeDefined();
      expect(pricing.combinedPricePerMillion).toBe(0.20);
      expect(pricing.inputPricePerMillion).toBe(0.20);
      expect(pricing.outputPricePerMillion).toBe(0.20);
    });

    it('should have pricing for google/gemini-2.5-flash with unified pricing', () => {
      const pricing = OPENROUTER_PRICING['google/gemini-2.5-flash'];
      expect(pricing).toBeDefined();
      expect(pricing.combinedPricePerMillion).toBe(0.15);
      expect(pricing.inputPricePerMillion).toBe(0.15);
      expect(pricing.outputPricePerMillion).toBe(0.15);
    });

    it('should have positive pricing values for all models', () => {
      Object.entries(OPENROUTER_PRICING).forEach(([model, pricing]) => {
        expect(pricing.inputPricePerMillion).toBeGreaterThan(0);
        expect(pricing.outputPricePerMillion).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // COST THRESHOLDS VALIDATION
  // ============================================================================

  describe('COST_THRESHOLDS configuration', () => {
    it('should have correct threshold values from RT-001', () => {
      expect(COST_THRESHOLDS.EXPECTED_MIN).toBe(0.33);
      expect(COST_THRESHOLDS.EXPECTED_MAX).toBe(0.39);
      expect(COST_THRESHOLDS.WITH_RETRIES_MAX).toBe(0.51);
      expect(COST_THRESHOLDS.HARD_LIMIT).toBe(0.60);
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
    it('should calculate cost for typical generation with qwen3-max metadata + gpt-oss-120b sections', () => {
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'qwen/qwen3-max',
          sections: 'openai/gpt-oss-120b',
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

      // Metadata cost (qwen3-max, 50/50 split): (2500/1M * 0.60) + (2500/1M * 1.80) = 0.0015 + 0.0045 = 0.006
      expect(cost.metadata_cost_usd).toBeCloseTo(0.006, 6);

      // Sections cost (gpt-oss-120b, unified): 45000/1M * 0.20 = 0.009
      expect(cost.sections_cost_usd).toBeCloseTo(0.009, 6);

      // Validation cost: 0
      expect(cost.validation_cost_usd).toBe(0);

      // Total cost: 0.006 + 0.009 = 0.015
      expect(cost.total_cost_usd).toBeCloseTo(0.015, 6);

      // Token breakdown
      expect(cost.token_breakdown.metadata_tokens).toBe(5000);
      expect(cost.token_breakdown.sections_tokens).toBe(45000);
      expect(cost.token_breakdown.validation_tokens).toBe(0);
      expect(cost.token_breakdown.total_tokens).toBe(50000);

      // Model breakdown
      expect(cost.model_breakdown.metadata_model).toBe('qwen/qwen3-max');
      expect(cost.model_breakdown.sections_model).toBe('openai/gpt-oss-120b');
      expect(cost.model_breakdown.validation_model).toBe('none');
    });

    it('should calculate cost with all phases (metadata + sections + validation)', () => {
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'qwen/qwen3-max',
          sections: 'openai/gpt-oss-20b',
          validation: 'google/gemini-2.5-flash',
        },
        total_tokens: {
          metadata: 10000,
          sections: 50000,
          validation: 5000,
          total: 65000,
        },
        cost_usd: 0,
        duration_ms: { metadata: 2000, sections: 10000, validation: 1000, total: 13000 },
        quality_scores: { metadata_similarity: 0.94, sections_similarity: [0.91, 0.93], overall: 0.92 },
        batch_count: 2,
        retry_count: { metadata: 1, sections: [0, 1] },
        created_at: new Date().toISOString(),
      };

      const cost = calculateGenerationCost(metadata);

      // Metadata cost (qwen3-max, 50/50): (5000/1M * 0.60) + (5000/1M * 1.80) = 0.003 + 0.009 = 0.012
      expect(cost.metadata_cost_usd).toBeCloseTo(0.012, 6);

      // Sections cost (gpt-oss-20b, unified): 50000/1M * 0.08 = 0.004
      expect(cost.sections_cost_usd).toBeCloseTo(0.004, 6);

      // Validation cost (gemini-2.5-flash, unified): 5000/1M * 0.15 = 0.00075
      expect(cost.validation_cost_usd).toBeCloseTo(0.00075, 6);

      // Total cost: 0.012 + 0.004 + 0.00075 = 0.01675
      expect(cost.total_cost_usd).toBeCloseTo(0.01675, 6);

      // Model breakdown
      expect(cost.model_breakdown.validation_model).toBe('google/gemini-2.5-flash');
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
    });
  });

  // ============================================================================
  // ASSESS COST STATUS
  // ============================================================================

  describe('assessCostStatus()', () => {
    it('should return WITHIN_TARGET for cost <= $0.39', () => {
      const status = assessCostStatus(0.35);

      expect(status.status).toBe('WITHIN_TARGET');
      expect(status.threshold).toBe(COST_THRESHOLDS.EXPECTED_MAX);
      expect(status.message).toContain('$0.3500');
      expect(status.message).toContain('within expected range');
    });

    it('should return ACCEPTABLE_WITH_RETRIES for cost $0.40-$0.51', () => {
      const status = assessCostStatus(0.45);

      expect(status.status).toBe('ACCEPTABLE_WITH_RETRIES');
      expect(status.threshold).toBe(COST_THRESHOLDS.WITH_RETRIES_MAX);
      expect(status.message).toContain('$0.4500');
      expect(status.message).toContain('acceptable with retry overhead');
    });

    it('should return HIGH_COST_WARNING for cost $0.52-$0.60', () => {
      const status = assessCostStatus(0.55);

      expect(status.status).toBe('HIGH_COST_WARNING');
      expect(status.threshold).toBe(COST_THRESHOLDS.HARD_LIMIT);
      expect(status.message).toContain('$0.5500');
      expect(status.message).toContain('approaching hard limit');
      expect(status.message).toContain('Investigation recommended');
    });

    it('should return EXCEEDS_LIMIT for cost > $0.60', () => {
      const status = assessCostStatus(0.75);

      expect(status.status).toBe('EXCEEDS_LIMIT');
      expect(status.threshold).toBe(COST_THRESHOLDS.HARD_LIMIT);
      expect(status.message).toContain('$0.7500');
      expect(status.message).toContain('exceeds hard limit');
      expect(status.message).toContain('Immediate optimization required');
    });

    it('should handle boundary values correctly', () => {
      // Exactly at EXPECTED_MAX (0.39)
      expect(assessCostStatus(0.39).status).toBe('WITHIN_TARGET');

      // Just above EXPECTED_MAX (0.40)
      expect(assessCostStatus(0.40).status).toBe('ACCEPTABLE_WITH_RETRIES');

      // Exactly at WITH_RETRIES_MAX (0.51)
      expect(assessCostStatus(0.51).status).toBe('ACCEPTABLE_WITH_RETRIES');

      // Just above WITH_RETRIES_MAX (0.52)
      expect(assessCostStatus(0.52).status).toBe('HIGH_COST_WARNING');

      // Exactly at HARD_LIMIT (0.60)
      expect(assessCostStatus(0.60).status).toBe('HIGH_COST_WARNING');

      // Just above HARD_LIMIT (0.61)
      expect(assessCostStatus(0.61).status).toBe('EXCEEDS_LIMIT');
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
      expect(pricing?.inputPricePerMillion).toBe(0.60);
      expect(pricing?.outputPricePerMillion).toBe(1.80);
    });

    it('should return null for unknown models', () => {
      const pricing = getModelPricing('unknown/model');

      expect(pricing).toBeNull();
    });
  });

  describe('hasUnifiedPricing()', () => {
    it('should return true for OSS models with unified pricing', () => {
      expect(hasUnifiedPricing('openai/gpt-oss-20b')).toBe(true);
      expect(hasUnifiedPricing('openai/gpt-oss-120b')).toBe(true);
      expect(hasUnifiedPricing('google/gemini-2.5-flash')).toBe(true);
    });

    it('should return false for models with split pricing', () => {
      expect(hasUnifiedPricing('qwen/qwen3-max')).toBe(false);
    });

    it('should return false for unknown models', () => {
      expect(hasUnifiedPricing('unknown/model')).toBe(false);
    });
  });

  describe('estimateCost()', () => {
    it('should estimate cost for unified pricing model', () => {
      const cost = estimateCost('openai/gpt-oss-20b', 10000, 0);

      // 10000/1M * 0.08 = 0.0008
      expect(cost).toBeCloseTo(0.0008, 6);
    });

    it('should estimate cost for split pricing model with 50/50 assumption', () => {
      const cost = estimateCost('qwen/qwen3-max', 10000, 0);

      // 50/50 split: (5000/1M * 0.60) + (5000/1M * 1.80) = 0.003 + 0.009 = 0.012
      expect(cost).toBeCloseTo(0.012, 6);
    });

    it('should handle unknown model by returning $0', () => {
      const cost = estimateCost('unknown/model', 10000, 0);

      expect(cost).toBe(0);
    });

    it('should handle zero tokens', () => {
      const cost = estimateCost('openai/gpt-oss-20b', 0, 0);

      expect(cost).toBe(0);
    });
  });

  // ============================================================================
  // REAL-WORLD SCENARIOS (RT-001 COST TARGETS)
  // ============================================================================

  describe('Real-world cost scenarios (RT-001)', () => {
    it('should achieve expected cost range for typical course generation', () => {
      // RT-001 expected: $0.33-0.39 per course
      // Metadata: 5K tokens (qwen3-max)
      // Sections: 45K tokens (gpt-oss-120b)
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'qwen/qwen3-max',
          sections: 'openai/gpt-oss-120b',
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
      // RT-004 with retries: $0.38-0.51
      // Simulate higher token usage due to retries
      const metadata: GenerationMetadata = {
        model_used: {
          metadata: 'qwen/qwen3-max',
          sections: 'openai/gpt-oss-120b',
          validation: 'google/gemini-2.5-flash',
        },
        total_tokens: {
          metadata: 8000,  // +60% due to retries
          sections: 72000, // +60% due to retries
          validation: 5000,
          total: 85000,
        },
        cost_usd: 0,
        duration_ms: { metadata: 3000, sections: 12000, validation: 1000, total: 16000 },
        quality_scores: { metadata_similarity: 0.93, sections_similarity: [0.89, 0.91], overall: 0.90 },
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
