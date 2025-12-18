/**
 * Unit Tests for OLX sequential.xml Template Generator
 * Test ID: T038
 *
 * Tests generateSequentialXml function for creating sequential.xml OLX structure.
 *
 * Expected Function Signature:
 * generateSequentialXml(sequential: OlxSequential): string
 *
 * Expected Output Format:
 * <sequential url_name="..." display_name="...">
 *   <vertical url_name="..." />
 *   <vertical url_name="..." />
 * </sequential>
 *
 * NOTE: This is a TDD red-phase test. The implementation does not exist yet.
 * These tests will fail until T048 implements the actual function.
 */

import { describe, it, expect } from 'vitest';
import { generateSequentialXml } from '@/integrations/lms/openedx/olx/templates/sequential';
import type { OlxSequential } from '@megacampus/shared-types/lms/olx-types';

describe('generateSequentialXml - OLX sequential.xml template', () => {
  describe('Basic Sequential XML Generation', () => {
    it('should generate valid sequential.xml with required attributes', () => {
      const sequential: OlxSequential = {
        url_name: 'lesson_1',
        display_name: 'Introduction to Variables',
        verticals: [
          {
            url_name: 'unit_1',
            display_name: 'What are Variables?',
            components: [],
          },
          {
            url_name: 'unit_2',
            display_name: 'Variable Types',
            components: [],
          },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify XML structure
      expect(result).toContain('<sequential');
      expect(result).toContain('</sequential>');

      // Verify attributes
      expect(result).toContain('url_name="lesson_1"');
      expect(result).toContain('display_name="Introduction to Variables"');
    });

    it('should include vertical references as child elements', () => {
      const sequential: OlxSequential = {
        url_name: 'control_flow',
        display_name: 'Control Flow Structures',
        verticals: [
          {
            url_name: 'if_statements',
            display_name: 'If Statements',
            components: [],
          },
          {
            url_name: 'loops',
            display_name: 'Loops',
            components: [],
          },
          {
            url_name: 'break_continue',
            display_name: 'Break and Continue',
            components: [],
          },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify vertical references
      expect(result).toContain('<vertical url_name="if_statements"');
      expect(result).toContain('<vertical url_name="loops"');
      expect(result).toContain('<vertical url_name="break_continue"');

      // Verify self-closing tags
      expect(result).toMatch(/<vertical url_name="if_statements"\s*\/>/);
    });

    it('should handle single vertical', () => {
      const sequential: OlxSequential = {
        url_name: 'single_unit',
        display_name: 'Single Unit Lesson',
        verticals: [
          {
            url_name: 'only_unit',
            display_name: 'The Only Unit',
            components: [],
          },
        ],
      };

      const result = generateSequentialXml(sequential);

      expect(result).toContain('<vertical url_name="only_unit"');
      expect(result).toContain('</sequential>');
    });
  });

  describe('Cyrillic and Unicode Support', () => {
    it('should handle Cyrillic display_name with proper XML escaping', () => {
      const sequential: OlxSequential = {
        url_name: 'variables_lesson',
        display_name: 'Переменные и типы данных',
        verticals: [
          {
            url_name: 'intro',
            display_name: 'Введение в переменные',
            components: [],
          },
          {
            url_name: 'types',
            display_name: 'Типы данных в Python',
            components: [],
          },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify Cyrillic is preserved (UTF-8 encoding) in sequential's display_name
      expect(result).toContain('display_name="Переменные и типы данных"');
      // Note: Child vertical display_names are in their own files, not in sequential.xml
      // Sequential only contains url_name references to verticals
      expect(result).toContain('url_name="intro"');
      expect(result).toContain('url_name="types"');
    });

    it('should escape special XML characters in display_name', () => {
      const sequential: OlxSequential = {
        url_name: 'algorithms',
        display_name: 'Algorithms: "Sorting & Searching" O(n) < O(n²)',  // All special chars in sequential's display_name
        verticals: [
          {
            url_name: 'sorting',
            display_name: 'Sorting: O(n log n) < O(n²)',
            components: [],
          },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify XML escaping (&, ", <) in sequential's display_name
      expect(result).toContain('&amp;'); // Ampersand escaped
      expect(result).toContain('&quot;'); // Quotes escaped
      expect(result).toContain('&lt;'); // Less-than escaped
      expect(result).not.toContain('Sorting & Searching'); // Raw ampersand should not exist
    });

    it('should handle vertical display_name with comparison operators', () => {
      const sequential: OlxSequential = {
        url_name: 'conditions',
        display_name: 'Conditional Logic: Using < and > operators',  // Put special chars in sequential's display_name
        verticals: [
          {
            url_name: 'less_than',
            display_name: 'Using < operator',
            components: [],
          },
          {
            url_name: 'greater_than',
            display_name: 'Using > operator',
            components: [],
          },
          {
            url_name: 'equality',
            display_name: 'Using == vs ===',
            components: [],
          },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify < and > are escaped in sequential's display_name
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).not.toContain('Using < and >'); // Raw < should be escaped
      // Verify vertical url_names are present
      expect(result).toContain('url_name="less_than"');
      expect(result).toContain('url_name="greater_than"');
      expect(result).toContain('url_name="equality"');
    });
  });

  describe('Vertical References', () => {
    it('should include all vertical url_name references', () => {
      const sequential: OlxSequential = {
        url_name: 'full_lesson',
        display_name: 'Complete Lesson',
        verticals: [
          { url_name: 'unit_1', display_name: 'Unit 1', components: [] },
          { url_name: 'unit_2', display_name: 'Unit 2', components: [] },
          { url_name: 'unit_3', display_name: 'Unit 3', components: [] },
          { url_name: 'unit_4', display_name: 'Unit 4', components: [] },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify all 4 verticals are referenced
      for (let i = 1; i <= 4; i++) {
        expect(result).toContain(`<vertical url_name="unit_${i}"`);
      }
    });

    it('should preserve vertical url_name order', () => {
      const sequential: OlxSequential = {
        url_name: 'ordered_lesson',
        display_name: 'Ordered Lesson',
        verticals: [
          { url_name: 'first', display_name: 'First', components: [] },
          { url_name: 'second', display_name: 'Second', components: [] },
          { url_name: 'third', display_name: 'Third', components: [] },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify order by checking positions
      const firstPos = result.indexOf('url_name="first"');
      const secondPos = result.indexOf('url_name="second"');
      const thirdPos = result.indexOf('url_name="third"');

      expect(firstPos).toBeLessThan(secondPos);
      expect(secondPos).toBeLessThan(thirdPos);
    });

    it('should handle many verticals (10+)', () => {
      const verticals = Array.from({ length: 15 }, (_, i) => ({
        url_name: `unit_${i + 1}`,
        display_name: `Unit ${i + 1}`,
        components: [],
      }));

      const sequential: OlxSequential = {
        url_name: 'many_units',
        display_name: 'Lesson with Many Units',
        verticals,
      };

      const result = generateSequentialXml(sequential);

      // Verify all 15 verticals are present
      for (let i = 1; i <= 15; i++) {
        expect(result).toContain(`url_name="unit_${i}"`);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty verticals array', () => {
      const sequential: OlxSequential = {
        url_name: 'empty_lesson',
        display_name: 'Empty Lesson',
        verticals: [],
      };

      const result = generateSequentialXml(sequential);

      // Should still generate valid sequential XML
      expect(result).toContain('<sequential');
      expect(result).toContain('</sequential>');
      // Should not contain any vertical references
      expect(result).not.toContain('<vertical');
    });

    it('should handle very long url_name', () => {
      const sequential: OlxSequential = {
        url_name: 'very_long_url_name_for_sequential_testing_purposes_that_is_still_valid',
        display_name: 'Long URL Name Lesson',
        verticals: [
          {
            url_name: 'vertical_with_very_long_url_name_for_testing',
            display_name: 'Vertical',
            components: [],
          },
        ],
      };

      const result = generateSequentialXml(sequential);

      expect(result).toContain('url_name="very_long_url_name_for_sequential_testing_purposes_that_is_still_valid"');
      expect(result).toContain('url_name="vertical_with_very_long_url_name_for_testing"');
    });

    it('should handle url_name with underscores, hyphens, and numbers', () => {
      const sequential: OlxSequential = {
        url_name: 'lesson_1-1_intro_2025',
        display_name: 'Lesson 1.1: Introduction',
        verticals: [
          { url_name: 'unit_1-1-1', display_name: 'Unit 1.1.1', components: [] },
          { url_name: 'unit_1-1-2', display_name: 'Unit 1.1.2', components: [] },
        ],
      };

      const result = generateSequentialXml(sequential);

      expect(result).toContain('url_name="lesson_1-1_intro_2025"');
      expect(result).toContain('url_name="unit_1-1-1"');
      expect(result).toContain('url_name="unit_1-1-2"');
    });

    it('should handle special characters in display_name (quotes, ampersands)', () => {
      const sequential: OlxSequential = {
        url_name: 'special_chars',
        display_name: 'Lesson: "Advanced Topics" & Best Practices',
        verticals: [
          {
            url_name: 'unit_1',
            display_name: 'Unit: "Testing" & Debugging',
            components: [],
          },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify both " and & are escaped
      expect(result).toContain('&quot;');
      expect(result).toContain('&amp;');
    });
  });

  describe('XML Formatting and Structure', () => {
    it('should generate well-formed XML', () => {
      const sequential: OlxSequential = {
        url_name: 'wellformed',
        display_name: 'Well-Formed Sequential',
        verticals: [
          { url_name: 'unit_1', display_name: 'Unit 1', components: [] },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify single root element
      const sequentialOpenTags = (result.match(/<sequential[^>]*>/g) || []).length;
      const sequentialCloseTags = (result.match(/<\/sequential>/g) || []).length;
      expect(sequentialOpenTags).toBe(1);
      expect(sequentialCloseTags).toBe(1);
    });

    it('should properly indent nested vertical elements', () => {
      const sequential: OlxSequential = {
        url_name: 'indent',
        display_name: 'Indented Sequential',
        verticals: [
          { url_name: 'unit_1', display_name: 'Unit 1', components: [] },
          { url_name: 'unit_2', display_name: 'Unit 2', components: [] },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify indentation (verticals should be indented inside sequential)
      expect(result).toMatch(/\n\s+<vertical url_name="unit_1"/);
      expect(result).toMatch(/\n\s+<vertical url_name="unit_2"/);
    });

    it('should end with newline character', () => {
      const sequential: OlxSequential = {
        url_name: 'newline',
        display_name: 'Newline Sequential',
        verticals: [
          { url_name: 'unit_1', display_name: 'Unit', components: [] },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify ends with newline
      expect(result).toMatch(/\n$/);
    });
  });

  describe('Real-world Sequential Examples', () => {
    it('should generate sequential.xml for typical Python variables lesson', () => {
      const sequential: OlxSequential = {
        url_name: 'variables_and_types',
        display_name: 'Переменные и типы данных',
        verticals: [
          { url_name: 'intro_variables', display_name: 'Введение', components: [] },
          { url_name: 'numeric_types', display_name: 'Числовые типы', components: [] },
          { url_name: 'strings', display_name: 'Строки', components: [] },
          { url_name: 'type_conversion', display_name: 'Преобразование типов', components: [] },
          { url_name: 'practice', display_name: 'Практика', components: [] },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify all elements present
      expect(result).toContain('url_name="variables_and_types"');
      expect(result).toContain('Переменные и типы данных');
      expect(result).toContain('url_name="intro_variables"');
      expect(result).toContain('url_name="practice"');
    });

    it('should generate sequential.xml for data science lesson with special chars', () => {
      const sequential: OlxSequential = {
        url_name: 'hypothesis_testing',
        display_name: 'Hypothesis Testing: T-tests & ANOVA',
        verticals: [
          { url_name: 'null_hypothesis', display_name: 'Null Hypothesis (H₀)', components: [] },
          { url_name: 'p_values', display_name: 'P-values: p < 0.05 significance', components: [] },
          { url_name: 't_test', display_name: 'T-test: "Student\'s t-distribution"', components: [] },
        ],
      };

      const result = generateSequentialXml(sequential);

      // Verify ampersand is escaped in sequential's display_name
      expect(result).toContain('T-tests &amp; ANOVA');
      // Verify vertical url_names are referenced (but their display_names are in their own files)
      expect(result).toContain('url_name="null_hypothesis"');
      expect(result).toContain('url_name="p_values"');
      expect(result).toContain('url_name="t_test"');
    });

    it('should generate sequential.xml for MegaCampus lesson mapping', () => {
      const sequential: OlxSequential = {
        url_name: 'lesson_1_1_intro_to_python',
        display_name: 'Lesson 1.1: Introduction to Python Programming',
        verticals: [
          { url_name: 'what_is_python', display_name: 'What is Python?', components: [] },
          { url_name: 'why_python', display_name: 'Why Learn Python?', components: [] },
          { url_name: 'installing_python', display_name: 'Installing Python', components: [] },
          { url_name: 'first_program', display_name: 'Your First Python Program', components: [] },
          { url_name: 'summary', display_name: 'Lesson Summary', components: [] },
        ],
      };

      const result = generateSequentialXml(sequential);

      expect(result).toContain('Lesson 1.1: Introduction to Python Programming');
      expect(result).toContain('what_is_python');
      expect(result).toContain('summary');
    });
  });
});
