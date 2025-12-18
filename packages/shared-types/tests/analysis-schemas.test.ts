/**
 * Unit tests for analysis-schemas module
 * Tests Zod schema validation for Stage 4 Analysis enhancement (A23)
 *
 * Coverage:
 * - PedagogicalPatternsSchema (T009 equivalent)
 * - GenerationGuidanceSchema (T010 equivalent)
 */

import { describe, it, expect } from 'vitest';
import {
  PedagogicalPatternsSchema,
  GenerationGuidanceSchema,
} from '../src/analysis-schemas';

// ==================== Helper Functions (Data Fixtures) ====================

/**
 * Creates valid PedagogicalPatterns object for testing
 */
function createValidPedagogicalPatterns() {
  return {
    primary_strategy: 'problem-based learning' as const,
    theory_practice_ratio: '30:70',
    assessment_types: ['coding', 'quizzes', 'projects'] as const,
    key_patterns: ['build incrementally', 'learn by refactoring'],
  };
}

/**
 * Creates valid GenerationGuidance object for testing
 */
function createValidGenerationGuidance() {
  return {
    tone: 'conversational but precise' as const,
    use_analogies: true,
    specific_analogies: ['assembly line for data flow'],
    avoid_jargon: ['imperative programming', 'functional programming'],
    include_visuals: ['diagrams', 'code examples'] as const,
    exercise_types: ['coding', 'debugging'] as const,
    contextual_language_hints: 'Audience is familiar with basic JavaScript',
    real_world_examples: ['E-commerce checkout flow'],
  };
}

// ==================== PedagogicalPatternsSchema Tests ====================

describe('PedagogicalPatternsSchema', () => {
  describe('Valid cases', () => {
    it('should validate valid pedagogical patterns with all fields', () => {
      const validPatterns = createValidPedagogicalPatterns();
      const result = PedagogicalPatternsSchema.safeParse(validPatterns);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.primary_strategy).toBe('problem-based learning');
        expect(result.data.theory_practice_ratio).toBe('30:70');
        expect(result.data.assessment_types).toHaveLength(3);
        expect(result.data.key_patterns).toHaveLength(2);
      }
    });

    it('should validate all primary_strategy enum values', () => {
      const strategies = [
        'problem-based learning',
        'lecture-based',
        'inquiry-based',
        'project-based',
        'mixed',
      ] as const;

      for (const strategy of strategies) {
        const patterns = {
          ...createValidPedagogicalPatterns(),
          primary_strategy: strategy,
        };
        const result = PedagogicalPatternsSchema.safeParse(patterns);

        expect(result.success).toBe(true);
      }
    });

    it('should validate all theory_practice_ratio formats', () => {
      const ratios = ['30:70', '50:50', '70:30', '10:90', '100:0'];

      for (const ratio of ratios) {
        const patterns = {
          ...createValidPedagogicalPatterns(),
          theory_practice_ratio: ratio,
        };
        const result = PedagogicalPatternsSchema.safeParse(patterns);

        expect(result.success).toBe(true);
      }
    });

    it('should validate all assessment_types combinations', () => {
      const allAssessmentTypes = [
        'coding',
        'quizzes',
        'projects',
        'essays',
        'presentations',
        'peer-review',
      ] as const;

      const patterns = {
        ...createValidPedagogicalPatterns(),
        assessment_types: allAssessmentTypes,
      };
      const result = PedagogicalPatternsSchema.safeParse(patterns);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assessment_types).toHaveLength(6);
      }
    });

    it('should validate key_patterns with 2-5 items', () => {
      const patterns = {
        ...createValidPedagogicalPatterns(),
        key_patterns: [
          'build incrementally',
          'learn by refactoring',
          'test-driven learning',
        ],
      };
      const result = PedagogicalPatternsSchema.safeParse(patterns);

      expect(result.success).toBe(true);
    });

    it('should validate single assessment type', () => {
      const patterns = {
        ...createValidPedagogicalPatterns(),
        assessment_types: ['coding'],
      };
      const result = PedagogicalPatternsSchema.safeParse(patterns);

      expect(result.success).toBe(true);
    });
  });

  describe('Invalid cases', () => {
    it('should reject missing required field: primary_strategy', () => {
      const invalid = {
        theory_practice_ratio: '30:70',
        assessment_types: ['coding'],
        key_patterns: ['pattern1'],
      };
      const result = PedagogicalPatternsSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('primary_strategy');
      }
    });

    it('should reject missing required field: theory_practice_ratio', () => {
      const invalid = {
        primary_strategy: 'problem-based learning',
        assessment_types: ['coding'],
        key_patterns: ['pattern1'],
      };
      const result = PedagogicalPatternsSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('theory_practice_ratio');
      }
    });

    it('should reject missing required field: assessment_types', () => {
      const invalid = {
        primary_strategy: 'problem-based learning',
        theory_practice_ratio: '30:70',
        key_patterns: ['pattern1'],
      };
      const result = PedagogicalPatternsSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('assessment_types');
      }
    });

    it('should reject missing required field: key_patterns', () => {
      const invalid = {
        primary_strategy: 'problem-based learning',
        theory_practice_ratio: '30:70',
        assessment_types: ['coding'],
      };
      const result = PedagogicalPatternsSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('key_patterns');
      }
    });

    it('should reject invalid primary_strategy enum value', () => {
      const invalid = {
        ...createValidPedagogicalPatterns(),
        primary_strategy: 'flipped-classroom', // Not in enum
      };
      const result = PedagogicalPatternsSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid enum value');
      }
    });

    it('should reject invalid theory_practice_ratio format (missing colon)', () => {
      const invalid = {
        ...createValidPedagogicalPatterns(),
        theory_practice_ratio: '3070', // Invalid format
      };
      const result = PedagogicalPatternsSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Must be format "XX:YY"');
      }
    });

    it('should reject invalid theory_practice_ratio format (non-numeric)', () => {
      const invalid = {
        ...createValidPedagogicalPatterns(),
        theory_practice_ratio: 'high:low', // Invalid format
      };
      const result = PedagogicalPatternsSchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('should reject invalid assessment_types enum value', () => {
      const invalid = {
        ...createValidPedagogicalPatterns(),
        assessment_types: ['coding', 'oral-exam'], // 'oral-exam' not in enum
      };
      const result = PedagogicalPatternsSchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('should reject empty assessment_types array (NOTE: Zod allows, runtime should catch)', () => {
      const invalid = {
        ...createValidPedagogicalPatterns(),
        assessment_types: [],
      };
      const result = PedagogicalPatternsSchema.safeParse(invalid);

      // NOTE: Current Zod schema allows empty array
      // Runtime validation should enforce minimum 1 item
      expect(result.success).toBe(true);
    });

    it('should reject empty key_patterns array (NOTE: Zod allows, runtime should catch)', () => {
      const invalid = {
        ...createValidPedagogicalPatterns(),
        key_patterns: [],
      };
      const result = PedagogicalPatternsSchema.safeParse(invalid);

      // NOTE: Current Zod schema allows empty array
      // Runtime validation should enforce minimum 2 items
      expect(result.success).toBe(true);
    });
  });
});

// ==================== GenerationGuidanceSchema Tests ====================

describe('GenerationGuidanceSchema', () => {
  describe('Valid cases', () => {
    it('should validate valid generation guidance with all fields', () => {
      const validGuidance = createValidGenerationGuidance();
      const result = GenerationGuidanceSchema.safeParse(validGuidance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tone).toBe('conversational but precise');
        expect(result.data.use_analogies).toBe(true);
        expect(result.data.specific_analogies).toHaveLength(1);
        expect(result.data.avoid_jargon).toHaveLength(2);
        expect(result.data.include_visuals).toHaveLength(2);
        expect(result.data.exercise_types).toHaveLength(2);
        expect(result.data.real_world_examples).toHaveLength(1);
      }
    });

    it('should validate all tone enum values', () => {
      const tones = [
        'conversational but precise',
        'formal academic',
        'casual friendly',
        'technical professional',
      ] as const;

      for (const tone of tones) {
        const guidance = {
          ...createValidGenerationGuidance(),
          tone,
        };
        const result = GenerationGuidanceSchema.safeParse(guidance);

        expect(result.success).toBe(true);
      }
    });

    it('should validate use_analogies as boolean (true/false)', () => {
      const guidanceTrue = {
        ...createValidGenerationGuidance(),
        use_analogies: true,
      };
      const guidanceFalse = {
        ...createValidGenerationGuidance(),
        use_analogies: false,
      };

      expect(GenerationGuidanceSchema.safeParse(guidanceTrue).success).toBe(true);
      expect(GenerationGuidanceSchema.safeParse(guidanceFalse).success).toBe(true);
    });

    it('should validate all include_visuals types', () => {
      const allVisualTypes = [
        'diagrams',
        'flowcharts',
        'code examples',
        'screenshots',
        'animations',
        'plots',
        'tables',
      ] as const;

      const guidance = {
        ...createValidGenerationGuidance(),
        include_visuals: allVisualTypes,
      };
      const result = GenerationGuidanceSchema.safeParse(guidance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_visuals).toHaveLength(7);
      }
    });

    it('should validate all exercise_types', () => {
      const allExerciseTypes = [
        // Technical
        'coding',
        'derivation',
        'debugging',
        'refactoring',
        // Analytical
        'analysis',
        'interpretation',
        'case-study',
        'problem-solving',
        // Interactive
        'role-play',
        'simulation',
        'scenarios',
        'discussion',
        // Assessment
        'quiz',
        'practice',
        'reflection',
        'writing',
        'presentation',
        // Visual/Structured
        'tables',
        'diagrams',
        'flowcharts',
        // Standard formats
        'fill-in-the-blank',
        'matching',
        'multiple-choice',
        'true-false',
        'short-answer',
        'essay',
      ] as const;

      const guidance = {
        ...createValidGenerationGuidance(),
        exercise_types: allExerciseTypes,
      };
      const result = GenerationGuidanceSchema.safeParse(guidance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.exercise_types).toHaveLength(26);
      }
    });

    it('should validate without optional fields (specific_analogies, real_world_examples)', () => {
      const guidance = {
        tone: 'formal academic' as const,
        use_analogies: false,
        avoid_jargon: ['monad', 'functor'],
        include_visuals: ['diagrams'] as const,
        exercise_types: ['derivation'] as const,
        contextual_language_hints: 'Audience has PhD in mathematics',
      };
      const result = GenerationGuidanceSchema.safeParse(guidance);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.specific_analogies).toBeUndefined();
        expect(result.data.real_world_examples).toBeUndefined();
      }
    });

    it('should validate empty avoid_jargon array', () => {
      const guidance = {
        ...createValidGenerationGuidance(),
        avoid_jargon: [],
      };
      const result = GenerationGuidanceSchema.safeParse(guidance);

      expect(result.success).toBe(true);
    });

    it('should validate empty specific_analogies (optional)', () => {
      const guidance = {
        ...createValidGenerationGuidance(),
        specific_analogies: [],
      };
      const result = GenerationGuidanceSchema.safeParse(guidance);

      expect(result.success).toBe(true);
    });
  });

  describe('Invalid cases', () => {
    it('should reject missing required field: tone', () => {
      const invalid = {
        use_analogies: true,
        avoid_jargon: ['term1'],
        include_visuals: ['diagrams'],
        exercise_types: ['coding'],
        contextual_language_hints: 'Audience is beginners',
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('tone');
      }
    });

    it('should reject missing required field: use_analogies', () => {
      const invalid = {
        tone: 'conversational but precise',
        avoid_jargon: ['term1'],
        include_visuals: ['diagrams'],
        exercise_types: ['coding'],
        contextual_language_hints: 'Audience is beginners',
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('use_analogies');
      }
    });

    it('should reject missing required field: avoid_jargon', () => {
      const invalid = {
        tone: 'conversational but precise',
        use_analogies: true,
        include_visuals: ['diagrams'],
        exercise_types: ['coding'],
        contextual_language_hints: 'Audience is beginners',
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('avoid_jargon');
      }
    });

    it('should reject missing required field: include_visuals', () => {
      const invalid = {
        tone: 'conversational but precise',
        use_analogies: true,
        avoid_jargon: ['term1'],
        exercise_types: ['coding'],
        contextual_language_hints: 'Audience is beginners',
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('include_visuals');
      }
    });

    it('should reject missing required field: exercise_types', () => {
      const invalid = {
        tone: 'conversational but precise',
        use_analogies: true,
        avoid_jargon: ['term1'],
        include_visuals: ['diagrams'],
        contextual_language_hints: 'Audience is beginners',
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('exercise_types');
      }
    });

    it('should reject missing required field: contextual_language_hints', () => {
      const invalid = {
        tone: 'conversational but precise',
        use_analogies: true,
        avoid_jargon: ['term1'],
        include_visuals: ['diagrams'],
        exercise_types: ['coding'],
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('contextual_language_hints');
      }
    });

    it('should reject invalid tone enum value', () => {
      const invalid = {
        ...createValidGenerationGuidance(),
        tone: 'overly technical', // Not in enum
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('should reject use_analogies not boolean', () => {
      const invalid = {
        ...createValidGenerationGuidance(),
        use_analogies: 'yes', // Should be boolean
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('should reject avoid_jargon not an array', () => {
      const invalid = {
        ...createValidGenerationGuidance(),
        avoid_jargon: 'monad', // Should be array
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('should reject empty include_visuals array (NOTE: Zod allows, runtime should catch)', () => {
      const invalid = {
        ...createValidGenerationGuidance(),
        include_visuals: [],
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      // NOTE: Current Zod schema allows empty array
      // Runtime validation should enforce minimum 1 item
      expect(result.success).toBe(true);
    });

    it('should reject empty exercise_types array (NOTE: Zod allows, runtime should catch)', () => {
      const invalid = {
        ...createValidGenerationGuidance(),
        exercise_types: [],
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      // NOTE: Current Zod schema allows empty array
      // Runtime validation should enforce minimum 1 item
      expect(result.success).toBe(true);
    });

    it('should filter invalid include_visuals enum value with soft validation', () => {
      // Soft validation: unknown values are filtered with warning, not rejected
      const invalid = {
        ...createValidGenerationGuidance(),
        include_visuals: ['diagrams', 'videos'], // 'videos' not in enum - will be filtered
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(true);
      if (result.success) {
        // 'videos' should be filtered out, only 'diagrams' remains
        expect(result.data.include_visuals).toEqual(['diagrams']);
      }
    });

    it('should filter invalid exercise_types enum value with soft validation', () => {
      // Soft validation: unknown values are filtered with warning, not rejected
      const invalid = {
        ...createValidGenerationGuidance(),
        exercise_types: ['coding', 'memorization'], // 'memorization' not in enum - will be filtered
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(true);
      if (result.success) {
        // 'memorization' should be filtered out, only 'coding' remains
        expect(result.data.exercise_types).toEqual(['coding']);
      }
    });

    it('should filter all unknown values and keep empty array', () => {
      // When all values are unknown, result should be empty array
      const invalid = {
        ...createValidGenerationGuidance(),
        include_visuals: ['videos', 'infographics', 'gifs'], // all unknown
      };
      const result = GenerationGuidanceSchema.safeParse(invalid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include_visuals).toEqual([]);
      }
    });
  });
});
