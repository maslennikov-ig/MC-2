import { describe, it, expect } from 'vitest';
import { calculateDynamicContextWindow } from '@/stages/stage6-lesson-content/nodes/generator';

/**
 * Unit tests for calculateDynamicContextWindow
 *
 * Function calculates dynamic context window size based on lesson duration and language.
 *
 * Formula:
 * - Base: 3000 chars (for 15-min lesson)
 * - Extra: 150 chars per minute over 15
 * - Language multiplier: applied to total
 * - Cap: 8000 chars max
 * - Minimum duration: 5 minutes
 *
 * Examples:
 * - 15-min English: 3000 chars
 * - 30-min English: 3000 + (30-15) * 150 = 5250 chars
 * - 60-min Russian: (3000 + 45 * 150) * 1.33 = 12675 → capped to 8000
 */
describe('calculateDynamicContextWindow', () => {
  describe('English (multiplier 1.0)', () => {
    it('should return base 3000 chars for 15-min lesson', () => {
      expect(calculateDynamicContextWindow(15, 'en')).toBe(3000);
    });

    it('should return 3000 chars for lessons shorter than 15 min (minimum 5)', () => {
      expect(calculateDynamicContextWindow(10, 'en')).toBe(3000);
      expect(calculateDynamicContextWindow(5, 'en')).toBe(3000);
    });

    it('should handle very short lessons (< 5 min) with minimum duration', () => {
      // Duration < 5 should be treated as 5 (minimum)
      expect(calculateDynamicContextWindow(0, 'en')).toBe(3000);
      expect(calculateDynamicContextWindow(3, 'en')).toBe(3000);
    });

    it('should scale for 30-min lesson: 3000 + 15*150 = 5250', () => {
      // 30 min: extraMinutes = 30 - 15 = 15
      // calculated = 3000 + 15 * 150 = 3000 + 2250 = 5250
      expect(calculateDynamicContextWindow(30, 'en')).toBe(5250);
    });

    it('should scale for 45-min lesson: 3000 + 30*150 = 7500', () => {
      // 45 min: extraMinutes = 45 - 15 = 30
      // calculated = 3000 + 30 * 150 = 3000 + 4500 = 7500
      expect(calculateDynamicContextWindow(45, 'en')).toBe(7500);
    });

    it('should cap at 8000 for very long lessons', () => {
      // 60 min: 3000 + 45 * 150 = 9750 → capped to 8000
      expect(calculateDynamicContextWindow(60, 'en')).toBe(8000);
      expect(calculateDynamicContextWindow(120, 'en')).toBe(8000);
    });
  });

  describe('Russian (multiplier ~1.33)', () => {
    it('should apply language multiplier for Russian', () => {
      // 15 min: 3000 * 1.33 = 3990 → ceil = 3990
      const result = calculateDynamicContextWindow(15, 'ru');
      expect(result).toBeGreaterThan(3000);
      expect(result).toBeLessThanOrEqual(4000);
    });

    it('should scale with multiplier for 30-min lesson', () => {
      // 30 min: (3000 + 15 * 150) * 1.33 = 5250 * 1.33 = 6982.5 → ceil = 6983
      const result = calculateDynamicContextWindow(30, 'ru');
      expect(result).toBeGreaterThan(6900);
      expect(result).toBeLessThan(7100);
    });

    it('should cap at 8000 even with multiplier for long lessons', () => {
      // 60 min: (3000 + 45 * 150) * 1.33 = 9750 * 1.33 = 12967.5 → capped to 8000
      expect(calculateDynamicContextWindow(60, 'ru')).toBe(8000);
    });
  });

  describe('Chinese (multiplier 2.67)', () => {
    it('should apply language multiplier for Chinese', () => {
      // 15 min: 3000 * 2.67 = 8010 → capped to 8000
      const result = calculateDynamicContextWindow(15, 'zh');
      expect(result).toBe(8000);
    });

    it('should cap at 8000 for any Chinese lesson (multiplier causes immediate capping)', () => {
      // Even short lessons will hit the cap due to high multiplier
      // 10 min: 3000 * 2.67 = 8010 → capped to 8000
      const result = calculateDynamicContextWindow(10, 'zh');
      expect(result).toBe(8000);
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined duration with default 15', () => {
      // @ts-expect-error testing invalid input
      const result = calculateDynamicContextWindow(undefined, 'en');
      expect(result).toBe(3000);
    });

    it('should handle NaN duration with default 15', () => {
      // @ts-expect-error testing invalid input
      const result = calculateDynamicContextWindow(NaN, 'en');
      expect(result).toBe(3000);
    });

    it('should handle negative duration with minimum 5', () => {
      // Negative values should be clamped to MIN_DURATION (5)
      expect(calculateDynamicContextWindow(-10, 'en')).toBe(3000);
    });

    it('should handle unknown language with multiplier 1.0', () => {
      // Unknown languages should default to multiplier 1.0
      expect(calculateDynamicContextWindow(15, 'xx')).toBe(3000);
    });

    it('should handle empty string language with multiplier 1.0', () => {
      expect(calculateDynamicContextWindow(15, '')).toBe(3000);
    });
  });

  describe('Boundary testing', () => {
    it('should test exact cap boundary (53.33 min for English)', () => {
      // To reach exactly 8000: 3000 + extraMinutes * 150 = 8000
      // extraMinutes = 5000 / 150 = 33.33
      // durationMinutes = 15 + 33.33 = 48.33
      const nearCap = calculateDynamicContextWindow(48, 'en');
      const atCap = calculateDynamicContextWindow(49, 'en');

      expect(nearCap).toBeLessThan(8000);
      expect(atCap).toBe(8000);
    });

    it('should test minimum duration boundary', () => {
      // Exactly at minimum (5 min)
      expect(calculateDynamicContextWindow(5, 'en')).toBe(3000);

      // Just below minimum (4 min → clamped to 5)
      expect(calculateDynamicContextWindow(4, 'en')).toBe(3000);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical short lesson (10 min, English)', () => {
      expect(calculateDynamicContextWindow(10, 'en')).toBe(3000);
    });

    it('should handle typical medium lesson (25 min, English)', () => {
      // 25 min: 3000 + 10 * 150 = 4500
      expect(calculateDynamicContextWindow(25, 'en')).toBe(4500);
    });

    it('should handle typical long lesson (40 min, Spanish)', () => {
      // 40 min: (3000 + 25 * 150) * multiplier
      // Spanish multiplier should be ~1.18
      const result = calculateDynamicContextWindow(40, 'es');
      expect(result).toBeGreaterThan(6700);
      expect(result).toBeLessThan(8000);
    });

    it('should handle very long lesson (90 min, German)', () => {
      // Should be capped at 8000 regardless of language
      expect(calculateDynamicContextWindow(90, 'de')).toBe(8000);
    });
  });
});
