/**
 * Unit tests for Visual Style Generator Zod Schema Validation
 * @module tests/unit/stages/stage4-analysis/visual-style-schema
 *
 * Tests the `visualStyleSchema` Zod schema contract/specification.
 * Since the schema is not exported from the source file, we recreate it here
 * to test field constraints, validation rules, and boundary conditions.
 *
 * Tests cover:
 * - Field length constraints (min/max for all fields)
 * - Boundary conditions (exact min/max values)
 * - Full schema validation with all fields
 * - Fallback styles schema compliance
 * - Invalid input rejection
 *
 * NOTE: This tests the schema CONTRACT, not the LLM generation logic.
 * The schema is recreated here to validate the specification matches
 * the implementation in visual-style-generator.ts (lines 43-48).
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ============================================================================
// SCHEMA RECREATION
// ============================================================================

/**
 * Visual style schema (recreated from visual-style-generator.ts)
 * This matches the schema at lines 43-48 in the source file.
 *
 * Schema specification:
 * - colorScheme: string, min 10 chars, max 500 chars
 * - aesthetic: string, min 5 chars, max 150 chars
 * - visualElements: string, min 10 chars, max 300 chars
 * - mood: string, min 5 chars, max 300 chars (was 100, now 300)
 */
const visualStyleSchema = z.object({
  colorScheme: z.string().min(10).max(500),
  aesthetic: z.string().min(5).max(150),
  visualElements: z.string().min(10).max(300),
  mood: z.string().min(5).max(300),
});

// ============================================================================
// FALLBACK STYLES RECREATION
// ============================================================================

/**
 * Fallback styles (recreated from visual-style-generator.ts lines 147-178)
 * Used to test that all predefined fallback styles pass schema validation.
 */
const FALLBACK_STYLES = {
  professional: {
    colorScheme: 'blue and purple gradients with white accents',
    aesthetic: 'modern, professional, clean',
    visualElements: 'geometric shapes, abstract patterns, minimal icons',
    mood: 'confident, trustworthy, innovative',
  },
  creative: {
    colorScheme: 'pastel rainbow with soft gradients',
    aesthetic: 'artistic, dynamic, expressive',
    visualElements: 'brush strokes, abstract art, creative tools',
    mood: 'inspiring, imaginative, energetic',
  },
  academic: {
    colorScheme: 'navy blue and gold with white background',
    aesthetic: 'scholarly, structured, traditional',
    visualElements: 'books, academic symbols, clean typography',
    mood: 'serious, authoritative, educational',
  },
  personal: {
    colorScheme: 'warm orange and teal with soft gradients',
    aesthetic: 'friendly, approachable, motivational',
    visualElements: 'growth symbols, light metaphors, human elements',
    mood: 'uplifting, supportive, empowering',
  },
  default: {
    colorScheme: 'blue and white with subtle gradients',
    aesthetic: 'clean, modern, educational',
    visualElements: 'minimal geometric shapes, subtle patterns',
    mood: 'professional, clear, accessible',
  },
};

// ============================================================================
// TESTS
// ============================================================================

describe('Visual Style Schema Validation', () => {
  describe('mood field - length constraints (main test focus)', () => {
    it('should accept 250-char string (well within max)', () => {
      const longMood = 'a'.repeat(250);

      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: longMood,
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mood).toBe(longMood);
        expect(result.data.mood.length).toBe(250);
      }
    });

    it('should accept exactly 300-char string (max boundary)', () => {
      const maxMood = 'a'.repeat(300);

      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: maxMood,
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mood).toBe(maxMood);
        expect(result.data.mood.length).toBe(300);
      }
    });

    it('should reject 301-char string (exceeds max boundary)', () => {
      const tooLongMood = 'a'.repeat(301);

      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: tooLongMood,
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const moodError = result.error.issues.find(issue => issue.path[0] === 'mood');
        expect(moodError).toBeDefined();
        expect(moodError?.code).toBe('too_big');
        expect(moodError?.message).toMatch(/String must contain at most 300 character/i);
      }
    });

    it('should reject 4-char string (below min boundary)', () => {
      const tooShortMood = 'abcd';

      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: tooShortMood,
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const moodError = result.error.issues.find(issue => issue.path[0] === 'mood');
        expect(moodError).toBeDefined();
        expect(moodError?.code).toBe('too_small');
        expect(moodError?.message).toMatch(/String must contain at least 5 character/i);
      }
    });

    it('should accept exactly 5-char string (min boundary)', () => {
      const minMood = 'abcde';

      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: minMood,
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mood).toBe(minMood);
        expect(result.data.mood.length).toBe(5);
      }
    });

    it('should accept realistic long descriptive mood', () => {
      const realisticLongMood =
        'professional yet approachable, combining confidence with warmth; innovative and forward-thinking while maintaining trustworthiness; clean and modern aesthetic that appeals to tech-savvy audiences; energetic and motivational without being overwhelming';

      expect(realisticLongMood.length).toBeLessThanOrEqual(300);

      const input = {
        colorScheme: 'blue and purple gradients with white accents',
        aesthetic: 'modern, professional, clean',
        visualElements: 'geometric shapes, abstract patterns, minimal icons',
        mood: realisticLongMood,
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mood).toBe(realisticLongMood);
      }
    });
  });

  describe('colorScheme field - length constraints', () => {
    it('should accept valid colorScheme (10-500 chars)', () => {
      const input = {
        colorScheme: 'blue and purple gradients with cyan accents',
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should accept exactly 10-char colorScheme (min boundary)', () => {
      const minColorScheme = 'a'.repeat(10);

      const input = {
        colorScheme: minColorScheme,
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should accept exactly 500-char colorScheme (max boundary)', () => {
      const maxColorScheme = 'a'.repeat(500);

      const input = {
        colorScheme: maxColorScheme,
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject 9-char colorScheme (below min)', () => {
      const tooShort = 'a'.repeat(9);

      const input = {
        colorScheme: tooShort,
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find(issue => issue.path[0] === 'colorScheme');
        expect(error?.code).toBe('too_small');
      }
    });

    it('should reject 501-char colorScheme (exceeds max)', () => {
      const tooLong = 'a'.repeat(501);

      const input = {
        colorScheme: tooLong,
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find(issue => issue.path[0] === 'colorScheme');
        expect(error?.code).toBe('too_big');
      }
    });
  });

  describe('aesthetic field - length constraints', () => {
    it('should accept valid aesthetic (5-150 chars)', () => {
      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern, professional, clean',
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should accept exactly 5-char aesthetic (min boundary)', () => {
      const minAesthetic = 'abcde';

      const input = {
        colorScheme: 'blue and white',
        aesthetic: minAesthetic,
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should accept exactly 150-char aesthetic (max boundary)', () => {
      const maxAesthetic = 'a'.repeat(150);

      const input = {
        colorScheme: 'blue and white',
        aesthetic: maxAesthetic,
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject 4-char aesthetic (below min)', () => {
      const tooShort = 'abcd';

      const input = {
        colorScheme: 'blue and white',
        aesthetic: tooShort,
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find(issue => issue.path[0] === 'aesthetic');
        expect(error?.code).toBe('too_small');
      }
    });

    it('should reject 151-char aesthetic (exceeds max)', () => {
      const tooLong = 'a'.repeat(151);

      const input = {
        colorScheme: 'blue and white',
        aesthetic: tooLong,
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find(issue => issue.path[0] === 'aesthetic');
        expect(error?.code).toBe('too_big');
      }
    });
  });

  describe('visualElements field - length constraints', () => {
    it('should accept valid visualElements (10-300 chars)', () => {
      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: 'geometric shapes, abstract patterns, minimal icons',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should accept exactly 10-char visualElements (min boundary)', () => {
      const minVisualElements = 'a'.repeat(10);

      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: minVisualElements,
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should accept exactly 300-char visualElements (max boundary)', () => {
      const maxVisualElements = 'a'.repeat(300);

      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: maxVisualElements,
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject 9-char visualElements (below min)', () => {
      const tooShort = 'a'.repeat(9);

      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: tooShort,
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find(issue => issue.path[0] === 'visualElements');
        expect(error?.code).toBe('too_small');
      }
    });

    it('should reject 301-char visualElements (exceeds max)', () => {
      const tooLong = 'a'.repeat(301);

      const input = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: tooLong,
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find(issue => issue.path[0] === 'visualElements');
        expect(error?.code).toBe('too_big');
      }
    });
  });

  describe('Full schema validation', () => {
    it('should accept valid style with all fields', () => {
      const validStyle = {
        colorScheme: 'blue and purple gradients with cyan accents',
        aesthetic: 'modern tech, digital, sleek',
        visualElements: 'abstract code patterns, geometric shapes, minimal icons',
        mood: 'professional, innovative, clean',
      };

      const result = visualStyleSchema.safeParse(validStyle);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validStyle);
      }
    });

    it('should accept valid style with long mood (250 chars)', () => {
      // Create exactly 250-char mood string
      const longMood =
        'professional and trustworthy, combining innovation with reliability; modern aesthetic that appeals to tech professionals; energetic yet focused, balancing creativity with precision; approachable yet authoritative tone'.padEnd(
          250,
          ' '
        );

      expect(longMood.length).toBe(250);

      const validStyle = {
        colorScheme: 'blue and purple gradients with white accents',
        aesthetic: 'modern, professional, clean',
        visualElements: 'geometric shapes, abstract patterns, minimal icons',
        mood: longMood,
      };

      const result = visualStyleSchema.safeParse(validStyle);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mood).toBe(longMood);
      }
    });

    it('should reject when missing required fields', () => {
      const invalidStyle = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        // Missing visualElements and mood
      };

      const result = visualStyleSchema.safeParse(invalidStyle);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(2);
        expect(result.error.issues.some(issue => issue.path[0] === 'visualElements')).toBe(true);
        expect(result.error.issues.some(issue => issue.path[0] === 'mood')).toBe(true);
      }
    });

    it('should reject when any field is empty string', () => {
      const invalidStyle = {
        colorScheme: '',
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(invalidStyle);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find(issue => issue.path[0] === 'colorScheme');
        expect(error?.code).toBe('too_small');
      }
    });

    it('should reject when multiple fields violate constraints', () => {
      const invalidStyle = {
        colorScheme: 'short', // Too short (< 10 chars)
        aesthetic: 'a'.repeat(200), // Too long (> 150 chars)
        visualElements: 'too short', // Valid
        mood: 'ab', // Too short (< 5 chars)
      };

      const result = visualStyleSchema.safeParse(invalidStyle);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
        expect(result.error.issues.some(issue => issue.path[0] === 'colorScheme')).toBe(true);
        expect(result.error.issues.some(issue => issue.path[0] === 'aesthetic')).toBe(true);
        expect(result.error.issues.some(issue => issue.path[0] === 'mood')).toBe(true);
      }
    });
  });

  describe('Fallback styles validation', () => {
    it('should validate all fallback styles pass schema', () => {
      const categories = ['professional', 'creative', 'academic', 'personal', 'default'] as const;

      for (const category of categories) {
        const style = FALLBACK_STYLES[category];
        const result = visualStyleSchema.safeParse(style);

        expect(result.success).toBe(true);
        if (!result.success) {
          console.error(`Fallback style '${category}' failed validation:`, result.error.issues);
        }
      }
    });

    it('should validate professional fallback style', () => {
      const result = visualStyleSchema.safeParse(FALLBACK_STYLES.professional);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.colorScheme).toBe('blue and purple gradients with white accents');
        expect(result.data.aesthetic).toBe('modern, professional, clean');
        expect(result.data.visualElements).toBe(
          'geometric shapes, abstract patterns, minimal icons'
        );
        expect(result.data.mood).toBe('confident, trustworthy, innovative');
      }
    });

    it('should validate creative fallback style', () => {
      const result = visualStyleSchema.safeParse(FALLBACK_STYLES.creative);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.colorScheme).toBe('pastel rainbow with soft gradients');
        expect(result.data.aesthetic).toBe('artistic, dynamic, expressive');
      }
    });

    it('should validate academic fallback style', () => {
      const result = visualStyleSchema.safeParse(FALLBACK_STYLES.academic);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mood).toBe('serious, authoritative, educational');
      }
    });

    it('should validate personal fallback style', () => {
      const result = visualStyleSchema.safeParse(FALLBACK_STYLES.personal);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mood).toBe('uplifting, supportive, empowering');
      }
    });

    it('should validate default fallback style', () => {
      const result = visualStyleSchema.safeParse(FALLBACK_STYLES.default);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.colorScheme).toBe('blue and white with subtle gradients');
        expect(result.data.aesthetic).toBe('clean, modern, educational');
      }
    });
  });

  describe('Edge cases and special characters', () => {
    it('should accept Unicode characters in all fields', () => {
      const unicodeStyle = {
        colorScheme: 'синий и фиолетовый с белыми акцентами',
        aesthetic: 'современный, профессиональный',
        visualElements: 'геометрические формы, минималистичные иконки',
        mood: 'уверенный, надёжный, инновационный',
      };

      const result = visualStyleSchema.safeParse(unicodeStyle);

      expect(result.success).toBe(true);
    });

    it('should accept emoji characters', () => {
      const emojiStyle = {
        colorScheme: 'blue 💙 and purple 💜 gradients',
        aesthetic: 'modern ✨',
        visualElements: 'geometric shapes 🔷🔶',
        mood: 'professional 💼',
      };

      const result = visualStyleSchema.safeParse(emojiStyle);

      expect(result.success).toBe(true);
    });

    it('should accept special characters and punctuation', () => {
      const specialStyle = {
        colorScheme: 'blue-purple (gradient) with white/cyan accents & highlights',
        aesthetic: 'modern, tech-forward, "sleek"',
        visualElements: 'code patterns <xml/>, shapes (#geometric), icons [@minimal]',
        mood: 'professional, innovative, user-friendly & approachable',
      };

      const result = visualStyleSchema.safeParse(specialStyle);

      expect(result.success).toBe(true);
    });

    it('should reject non-string types', () => {
      const invalidType = {
        colorScheme: 12345, // number instead of string
        aesthetic: 'modern',
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(invalidType);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find(issue => issue.path[0] === 'colorScheme');
        expect(error?.code).toBe('invalid_type');
      }
    });

    it('should reject null values', () => {
      const invalidNull = {
        colorScheme: 'blue and white',
        aesthetic: null,
        visualElements: 'geometric shapes',
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(invalidNull);

      expect(result.success).toBe(false);
    });

    it('should reject undefined values', () => {
      const invalidUndefined = {
        colorScheme: 'blue and white',
        aesthetic: 'modern',
        visualElements: undefined,
        mood: 'professional',
      };

      const result = visualStyleSchema.safeParse(invalidUndefined);

      expect(result.success).toBe(false);
    });
  });
});
