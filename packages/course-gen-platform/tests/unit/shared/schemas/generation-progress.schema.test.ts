import { describe, it, expect } from 'vitest';
import {
  GenerationProgressSchema,
  parseGenerationProgress,
} from '@/shared/schemas/generation-progress.schema';

describe('GenerationProgressSchema', () => {
  describe('valid data', () => {
    it('should parse minimal valid data', () => {
      const data = {
        percentage: 50,
        message: 'Generating lessons',
        lessons_completed: 5,
      };

      const result = GenerationProgressSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.percentage).toBe(50);
        expect(result.data.message).toBe('Generating lessons');
        expect(result.data.lessons_completed).toBe(5);
      }
    });

    it('should parse data with lessons_total', () => {
      const data = {
        percentage: 75,
        message: 'Almost done',
        lessons_completed: 9,
        lessons_total: 12,
      };

      const result = GenerationProgressSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lessons_total).toBe(12);
      }
    });

    it('should allow additional fields (passthrough)', () => {
      const data = {
        percentage: 100,
        message: 'Completed',
        lessons_completed: 12,
        lessons_total: 12,
        // Additional fields from other stages
        current_stage: 'stage_6_complete',
        modules_total: 3,
        started_at: new Date('2025-01-01'),
      };

      const result = GenerationProgressSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('current_stage', 'stage_6_complete');
        expect(result.data).toHaveProperty('modules_total', 3);
        expect(result.data).toHaveProperty('started_at');
      }
    });
  });

  describe('invalid data', () => {
    it('should reject percentage > 100', () => {
      const data = {
        percentage: 150,
        message: 'Invalid',
        lessons_completed: 5,
      };

      const result = GenerationProgressSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject percentage < 0', () => {
      const data = {
        percentage: -10,
        message: 'Invalid',
        lessons_completed: 5,
      };

      const result = GenerationProgressSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer lessons_completed', () => {
      const data = {
        percentage: 50,
        message: 'Invalid',
        lessons_completed: 5.5,
      };

      const result = GenerationProgressSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject negative lessons_completed', () => {
      const data = {
        percentage: 50,
        message: 'Invalid',
        lessons_completed: -5,
      };

      const result = GenerationProgressSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const data = {
        percentage: 50,
        message: 'Incomplete',
        // Missing lessons_completed
      };

      const result = GenerationProgressSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject non-string message', () => {
      const data = {
        percentage: 50,
        message: 123, // Should be string
        lessons_completed: 5,
      };

      const result = GenerationProgressSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('parseGenerationProgress helper', () => {
    it('should return parsed data for valid input', () => {
      const data = {
        percentage: 50,
        message: 'Processing',
        lessons_completed: 5,
      };

      const result = parseGenerationProgress(data);
      expect(result).not.toBeNull();
      expect(result?.percentage).toBe(50);
    });

    it('should return null for invalid input', () => {
      const data = {
        percentage: 150, // Invalid
        message: 'Invalid',
        lessons_completed: 5,
      };

      const result = parseGenerationProgress(data);
      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = parseGenerationProgress(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = parseGenerationProgress(undefined);
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle percentage at boundaries', () => {
      const dataMin = {
        percentage: 0,
        message: 'Starting',
        lessons_completed: 0,
      };
      const dataMax = {
        percentage: 100,
        message: 'Complete',
        lessons_completed: 12,
      };

      expect(GenerationProgressSchema.safeParse(dataMin).success).toBe(true);
      expect(GenerationProgressSchema.safeParse(dataMax).success).toBe(true);
    });

    it('should handle empty message', () => {
      const data = {
        percentage: 50,
        message: '',
        lessons_completed: 5,
      };

      const result = GenerationProgressSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});
