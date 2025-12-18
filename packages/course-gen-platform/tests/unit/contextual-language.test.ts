/**
 * Unit tests for Contextual Language Generator Utility
 *
 * Tests category-specific motivational language templates used by Phase 1 Classification.
 * These templates guide the LLM in generating appropriate contextual language for each
 * of the 6 course categories.
 *
 * @module tests/unit/contextual-language
 */

import { describe, it, expect } from 'vitest';
import {
  getContextualLanguageTemplates,
  buildContextualLanguagePromptSection,
  CATEGORY_TEMPLATES,
  type CourseCategory,
  type CategoryTemplate,
} from '../../src/orchestrator/services/analysis/contextual-language';

describe('Contextual Language Generator', () => {
  /**
   * All 6 category types as defined in the system
   */
  const ALL_CATEGORIES: CourseCategory[] = [
    'professional',
    'personal',
    'creative',
    'hobby',
    'spiritual',
    'academic',
  ];

  /**
   * Template field names (6 fields per category)
   */
  const TEMPLATE_FIELDS: (keyof CategoryTemplate)[] = [
    'why_matters',
    'motivators',
    'experience_prompt',
    'problem_statement',
    'knowledge_bridge',
    'practical_benefit',
  ];

  describe('CATEGORY_TEMPLATES Structure Validation', () => {
    it('should define templates for all 6 categories', () => {
      expect(Object.keys(CATEGORY_TEMPLATES)).toHaveLength(6);

      ALL_CATEGORIES.forEach((category) => {
        expect(CATEGORY_TEMPLATES).toHaveProperty(category);
      });
    });

    it('should have all 6 fields for each category', () => {
      ALL_CATEGORIES.forEach((category) => {
        const template = CATEGORY_TEMPLATES[category];

        TEMPLATE_FIELDS.forEach((field) => {
          expect(template).toHaveProperty(field);
          expect(typeof template[field]).toBe('string');
          expect(template[field].length).toBeGreaterThan(0);
        });
      });
    });

    it('should have non-empty string values for all fields', () => {
      ALL_CATEGORIES.forEach((category) => {
        const template = CATEGORY_TEMPLATES[category];

        TEMPLATE_FIELDS.forEach((field) => {
          const value = template[field];
          expect(value.trim()).toBe(value); // No leading/trailing whitespace
          expect(value.length).toBeGreaterThan(10); // Meaningful content
        });
      });
    });
  });

  describe('Category-Specific Template Adaptation', () => {
    describe('Professional Category', () => {
      it('should contain career-focused language', () => {
        const template = CATEGORY_TEMPLATES.professional;

        expect(template.why_matters).toMatch(/career|professional/i);
        expect(template.motivators).toMatch(/earning|job|career|professional/i);
        expect(template.experience_prompt).toMatch(/workplace|professional/i);
        expect(template.problem_statement).toMatch(/career|skills/i);
        expect(template.knowledge_bridge).toMatch(/professional/i);
        expect(template.practical_benefit).toMatch(/job|career/i);
      });

      it('should have all required fields', () => {
        const template = CATEGORY_TEMPLATES.professional;

        expect(template.why_matters).toBe('career advancement and professional competitiveness');
        expect(template.motivators).toBe('increased earning potential, job security, industry recognition');
        expect(template.experience_prompt).toBe('workplace challenges and professional growth opportunities');
        expect(template.problem_statement).toBe('skills gap affecting career progression');
        expect(template.knowledge_bridge).toBe('practical application in current or future professional roles');
        expect(template.practical_benefit).toBe('immediate applicability to job responsibilities and career goals');
      });
    });

    describe('Personal Category', () => {
      it('should contain personal growth language', () => {
        const template = CATEGORY_TEMPLATES.personal;

        expect(template.why_matters).toMatch(/personal/i);
        expect(template.motivators).toMatch(/self-improvement|personal|life/i);
        expect(template.experience_prompt).toMatch(/personal/i);
        expect(template.problem_statement).toMatch(/personal/i);
        expect(template.knowledge_bridge).toMatch(/personal|daily life/i);
        expect(template.practical_benefit).toMatch(/personal/i);
      });

      it('should focus on life improvement', () => {
        const template = CATEGORY_TEMPLATES.personal;

        expect(template.motivators).toContain('life quality enhancement');
        expect(template.practical_benefit).toContain('well-being');
      });
    });

    describe('Creative Category', () => {
      it('should contain artistic expression language', () => {
        const template = CATEGORY_TEMPLATES.creative;

        expect(template.why_matters).toMatch(/artistic|creative/i);
        expect(template.motivators).toMatch(/creative|artistic|expression/i);
        expect(template.experience_prompt).toMatch(/creative|artistic/i);
        expect(template.problem_statement).toMatch(/creative/i);
        expect(template.knowledge_bridge).toMatch(/creative/i);
        expect(template.practical_benefit).toMatch(/creative|artistic/i);
      });

      it('should emphasize creative fulfillment', () => {
        const template = CATEGORY_TEMPLATES.creative;

        expect(template.why_matters).toBe('artistic expression and creative fulfillment');
        expect(template.motivators).toContain('creative outlets');
        expect(template.practical_benefit).toContain('artistic output');
      });
    });

    describe('Hobby Category', () => {
      it('should contain enjoyment and leisure language', () => {
        const template = CATEGORY_TEMPLATES.hobby;

        expect(template.why_matters).toMatch(/enjoyment|leisure/i);
        expect(template.motivators).toMatch(/fun|enjoyment|leisure|hobby/i);
        expect(template.experience_prompt).toMatch(/leisure|hobby/i);
        expect(template.problem_statement).toMatch(/hobby/i);
        expect(template.knowledge_bridge).toMatch(/hobby|leisure/i);
        expect(template.practical_benefit).toMatch(/enjoyment|hobby/i);
      });

      it('should emphasize fun and relaxation', () => {
        const template = CATEGORY_TEMPLATES.hobby;

        expect(template.motivators).toContain('fun');
        expect(template.motivators).toContain('relaxation');
      });
    });

    describe('Spiritual Category', () => {
      it('should contain spiritual growth language', () => {
        const template = CATEGORY_TEMPLATES.spiritual;

        expect(template.why_matters).toMatch(/spiritual/i);
        expect(template.motivators).toMatch(/spiritual|inner|peace/i);
        expect(template.experience_prompt).toMatch(/spiritual|inner/i);
        expect(template.problem_statement).toMatch(/spiritual/i);
        expect(template.knowledge_bridge).toMatch(/spiritual/i);
        expect(template.practical_benefit).toMatch(/spiritual/i);
      });

      it('should emphasize inner development', () => {
        const template = CATEGORY_TEMPLATES.spiritual;

        expect(template.why_matters).toBe('spiritual growth and inner development');
        expect(template.motivators).toContain('inner peace');
        expect(template.practical_benefit).toContain('personal transformation');
      });
    });

    describe('Academic Category', () => {
      it('should contain educational achievement language', () => {
        const template = CATEGORY_TEMPLATES.academic;

        expect(template.why_matters).toMatch(/educational|academic|knowledge/i);
        expect(template.motivators).toMatch(/academic|educational|learning/i);
        expect(template.experience_prompt).toMatch(/academic/i);
        expect(template.problem_statement).toMatch(/academic|knowledge/i);
        expect(template.knowledge_bridge).toMatch(/academic|educational/i);
        expect(template.practical_benefit).toMatch(/academic/i);
      });

      it('should emphasize academic success', () => {
        const template = CATEGORY_TEMPLATES.academic;

        expect(template.motivators).toContain('academic success');
        expect(template.practical_benefit).toContain('academic performance');
      });
    });
  });

  describe('Template Field Length Validation', () => {
    /**
     * Note: The actual field length requirements are for the LLM-generated output in Phase1Output.
     * Template strings are concise reference patterns (not bound by output length constraints).
     *
     * Phase1Output requirements:
     * - why_matters_context: 50-300 chars (TARGET: 100)
     * - motivators: 100-600 chars (TARGET: 200)
     * - experience_prompt: 100-600 chars (TARGET: 200)
     * - problem_statement_context: 50-300 chars (TARGET: 100)
     * - knowledge_bridge: 100-600 chars (TARGET: 200)
     * - practical_benefit_focus: 100-600 chars (TARGET: 200)
     */

    it('should have reasonable template string lengths', () => {
      ALL_CATEGORIES.forEach((category) => {
        const template = CATEGORY_TEMPLATES[category];

        // Templates should be concise but meaningful
        TEMPLATE_FIELDS.forEach((field) => {
          const value = template[field];
          expect(value.length).toBeGreaterThanOrEqual(20); // Minimum meaningful length
          expect(value.length).toBeLessThanOrEqual(200); // Templates are concise patterns
        });
      });
    });

    it('should have consistent length patterns across categories', () => {
      // All categories should have similar template lengths (they're reference patterns)
      const templateLengths: Record<CourseCategory, number> = {
        professional: 0,
        personal: 0,
        creative: 0,
        hobby: 0,
        spiritual: 0,
        academic: 0,
      };

      ALL_CATEGORIES.forEach((category) => {
        const template = CATEGORY_TEMPLATES[category];
        const totalLength = TEMPLATE_FIELDS.reduce((sum, field) => sum + template[field].length, 0);
        templateLengths[category] = totalLength;
      });

      // All categories should have similar total template lengths (within 50% of average)
      const lengths = Object.values(templateLengths);
      const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

      lengths.forEach((length) => {
        expect(length).toBeGreaterThan(avgLength * 0.5);
        expect(length).toBeLessThan(avgLength * 1.5);
      });
    });
  });

  describe('Category Uniqueness Validation', () => {
    it('should have unique motivator language per category', () => {
      const motivators = ALL_CATEGORIES.map((cat) => CATEGORY_TEMPLATES[cat].motivators);

      // Each category should have different motivators
      const uniqueMotivators = new Set(motivators);
      expect(uniqueMotivators.size).toBe(6);
    });

    it('should have unique why_matters language per category', () => {
      const whyMatters = ALL_CATEGORIES.map((cat) => CATEGORY_TEMPLATES[cat].why_matters);

      // Each category should have different why_matters
      const uniqueWhyMatters = new Set(whyMatters);
      expect(uniqueWhyMatters.size).toBe(6);
    });

    it('should have unique practical_benefit language per category', () => {
      const benefits = ALL_CATEGORIES.map((cat) => CATEGORY_TEMPLATES[cat].practical_benefit);

      // Each category should have different practical benefits
      const uniqueBenefits = new Set(benefits);
      expect(uniqueBenefits.size).toBe(6);
    });

    it('should contain category-specific keywords', () => {
      // Professional should mention "career" or "job"
      expect(CATEGORY_TEMPLATES.professional.motivators).toMatch(/career|job|earning/i);

      // Creative should mention "artistic" or "creative"
      expect(CATEGORY_TEMPLATES.creative.motivators).toMatch(/artistic|creative/i);

      // Hobby should mention "fun" or "enjoyment"
      expect(CATEGORY_TEMPLATES.hobby.motivators).toMatch(/fun|enjoyment/i);

      // Spiritual should mention "spiritual" or "inner"
      expect(CATEGORY_TEMPLATES.spiritual.motivators).toMatch(/spiritual|inner/i);

      // Academic should mention "academic" or "educational"
      expect(CATEGORY_TEMPLATES.academic.motivators).toMatch(/academic|educational/i);

      // Personal should mention "personal" or "life"
      expect(CATEGORY_TEMPLATES.personal.motivators).toMatch(/personal|life/i);
    });
  });

  describe('getContextualLanguageTemplates Function', () => {
    it('should return correct template for professional category', () => {
      const template = getContextualLanguageTemplates('professional');

      expect(template).toBeDefined();
      expect(template.why_matters).toBe(CATEGORY_TEMPLATES.professional.why_matters);
      expect(template.motivators).toBe(CATEGORY_TEMPLATES.professional.motivators);
    });

    it('should return correct template for creative category', () => {
      const template = getContextualLanguageTemplates('creative');

      expect(template).toBeDefined();
      expect(template.why_matters).toBe(CATEGORY_TEMPLATES.creative.why_matters);
      expect(template.motivators).toMatch(/creative|artistic/i);
    });

    it('should return correct template for hobby category', () => {
      const template = getContextualLanguageTemplates('hobby');

      expect(template).toBeDefined();
      expect(template.why_matters).toBe(CATEGORY_TEMPLATES.hobby.why_matters);
      expect(template.motivators).toMatch(/fun|enjoyment/i);
    });

    it('should return correct template for spiritual category', () => {
      const template = getContextualLanguageTemplates('spiritual');

      expect(template).toBeDefined();
      expect(template.why_matters).toBe(CATEGORY_TEMPLATES.spiritual.why_matters);
      expect(template.motivators).toMatch(/spiritual|inner/i);
    });

    it('should return correct template for academic category', () => {
      const template = getContextualLanguageTemplates('academic');

      expect(template).toBeDefined();
      expect(template.why_matters).toBe(CATEGORY_TEMPLATES.academic.why_matters);
      expect(template.motivators).toMatch(/academic/i);
    });

    it('should return correct template for personal category', () => {
      const template = getContextualLanguageTemplates('personal');

      expect(template).toBeDefined();
      expect(template.why_matters).toBe(CATEGORY_TEMPLATES.personal.why_matters);
      expect(template.motivators).toMatch(/personal|life/i);
    });

    it('should return templates with all 6 fields for every category', () => {
      ALL_CATEGORIES.forEach((category) => {
        const template = getContextualLanguageTemplates(category);

        expect(template).toHaveProperty('why_matters');
        expect(template).toHaveProperty('motivators');
        expect(template).toHaveProperty('experience_prompt');
        expect(template).toHaveProperty('problem_statement');
        expect(template).toHaveProperty('knowledge_bridge');
        expect(template).toHaveProperty('practical_benefit');
      });
    });
  });

  describe('buildContextualLanguagePromptSection Function', () => {
    it('should generate a formatted prompt section', () => {
      const promptSection = buildContextualLanguagePromptSection();

      expect(promptSection).toBeDefined();
      expect(typeof promptSection).toBe('string');
      expect(promptSection.length).toBeGreaterThan(100);
    });

    it('should include all 6 categories in the prompt section', () => {
      const promptSection = buildContextualLanguagePromptSection();

      ALL_CATEGORIES.forEach((category) => {
        expect(promptSection).toContain(category.toUpperCase());
      });
    });

    it('should include all field labels in the prompt section', () => {
      const promptSection = buildContextualLanguagePromptSection();

      // Check for field labels (formatted in the output)
      expect(promptSection).toContain('Why Matters:');
      expect(promptSection).toContain('Motivators:');
      expect(promptSection).toContain('Experience Prompt:');
      expect(promptSection).toContain('Problem Statement:');
      expect(promptSection).toContain('Knowledge Bridge:');
      expect(promptSection).toContain('Practical Benefit:');
    });

    it('should include template header', () => {
      const promptSection = buildContextualLanguagePromptSection();

      expect(promptSection).toContain('CONTEXTUAL LANGUAGE TEMPLATES');
      expect(promptSection).toContain('Reference Patterns');
    });

    it('should include template values from CATEGORY_TEMPLATES', () => {
      const promptSection = buildContextualLanguagePromptSection();

      // Check a few key template values are included
      expect(promptSection).toContain(CATEGORY_TEMPLATES.professional.why_matters);
      expect(promptSection).toContain(CATEGORY_TEMPLATES.creative.motivators);
      expect(promptSection).toContain(CATEGORY_TEMPLATES.hobby.practical_benefit);
    });

    it('should have proper formatting with line breaks', () => {
      const promptSection = buildContextualLanguagePromptSection();

      // Should have multiple lines
      const lines = promptSection.split('\n');
      expect(lines.length).toBeGreaterThan(30); // At least 6 categories * 6 fields + headers
    });

    it('should be suitable for LLM system prompt inclusion', () => {
      const promptSection = buildContextualLanguagePromptSection();

      // Should be well-structured for LLM consumption
      expect(promptSection).toContain('PROFESSIONAL:');
      expect(promptSection).toContain('CREATIVE:');
      expect(promptSection).toContain('HOBBY:');
      expect(promptSection).toContain('SPIRITUAL:');
      expect(promptSection).toContain('ACADEMIC:');
      expect(promptSection).toContain('PERSONAL:');

      // Should provide guidance
      expect(promptSection).toMatch(/use these templates/i);
    });
  });

  describe('All 6 Categories Coverage', () => {
    it('should generate unique language for all 6 categories', () => {
      const categories: CourseCategory[] = [
        'professional',
        'personal',
        'creative',
        'hobby',
        'spiritual',
        'academic',
      ];

      const templates = categories.map((category) => getContextualLanguageTemplates(category));

      // All templates should exist
      expect(templates).toHaveLength(6);

      // All templates should have motivators
      templates.forEach((template) => {
        expect(template.motivators).toBeDefined();
        expect(template.motivators.length).toBeGreaterThan(0);
      });

      // All motivators should be unique
      const motivators = templates.map((t) => t.motivators);
      const uniqueMotivators = new Set(motivators);
      expect(uniqueMotivators.size).toBe(6);
    });

    it('should provide complete templates for real-world scenarios', () => {
      // Scenario 1: Professional React Hooks course
      const professionalTemplate = getContextualLanguageTemplates('professional');
      expect(professionalTemplate.motivators).toMatch(/career|earning|job/i);
      expect(professionalTemplate.practical_benefit).toMatch(/job|career/i);

      // Scenario 2: Creative Watercolor Painting course
      const creativeTemplate = getContextualLanguageTemplates('creative');
      expect(creativeTemplate.motivators).toMatch(/artistic|creative/i);
      expect(creativeTemplate.why_matters).toMatch(/artistic|creative/i);

      // Scenario 3: Hobby Photography course
      const hobbyTemplate = getContextualLanguageTemplates('hobby');
      expect(hobbyTemplate.motivators).toMatch(/fun|enjoyment/i);
      expect(hobbyTemplate.why_matters).toMatch(/enjoyment|leisure/i);

      // Scenario 4: Spiritual Meditation course
      const spiritualTemplate = getContextualLanguageTemplates('spiritual');
      expect(spiritualTemplate.motivators).toMatch(/spiritual|inner/i);
      expect(spiritualTemplate.practical_benefit).toMatch(/spiritual|transformation/i);

      // Scenario 5: Academic Calculus course
      const academicTemplate = getContextualLanguageTemplates('academic');
      expect(academicTemplate.motivators).toMatch(/academic|educational/i);
      expect(academicTemplate.practical_benefit).toMatch(/academic/i);

      // Scenario 6: Personal Time Management course
      const personalTemplate = getContextualLanguageTemplates('personal');
      expect(personalTemplate.motivators).toMatch(/personal|life/i);
      expect(personalTemplate.practical_benefit).toMatch(/personal|life/i);
    });
  });
});
