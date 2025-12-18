/**
 * Unit Tests for OLX vertical.xml Template Generator
 * Test ID: T039
 *
 * Tests generateVerticalXml function for creating vertical.xml OLX structure.
 *
 * Expected Function Signature:
 * generateVerticalXml(vertical: OlxVertical): string
 *
 * Expected Output Format:
 * <vertical url_name="..." display_name="...">
 *   <html url_name="..." />
 *   <html url_name="..." />
 * </vertical>
 *
 * NOTE: This is a TDD red-phase test. The implementation does not exist yet.
 * These tests will fail until T049 implements the actual function.
 */

import { describe, it, expect } from 'vitest';
import { generateVerticalXml } from '@/integrations/lms/openedx/olx/templates/vertical';
import type { OlxVertical } from '@megacampus/shared-types/lms/olx-types';

describe('generateVerticalXml - OLX vertical.xml template', () => {
  describe('Basic Vertical XML Generation', () => {
    it('should generate valid vertical.xml with required attributes', () => {
      const vertical: OlxVertical = {
        url_name: 'unit_1',
        display_name: 'Introduction to Variables',
        components: [
          {
            type: 'html',
            url_name: 'html_intro',
            display_name: 'What are Variables?',
            content: '<p>Variables are containers...</p>',
          },
          {
            type: 'html',
            url_name: 'html_examples',
            display_name: 'Variable Examples',
            content: '<p>Here are some examples...</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify XML structure
      expect(result).toContain('<vertical');
      expect(result).toContain('</vertical>');

      // Verify attributes
      expect(result).toContain('url_name="unit_1"');
      expect(result).toContain('display_name="Introduction to Variables"');
    });

    it('should include html component references as child elements', () => {
      const vertical: OlxVertical = {
        url_name: 'control_flow_unit',
        display_name: 'Control Flow Concepts',
        components: [
          {
            type: 'html',
            url_name: 'html_if_statements',
            display_name: 'If Statements',
            content: '<p>If statements...</p>',
          },
          {
            type: 'html',
            url_name: 'html_loops',
            display_name: 'Loops',
            content: '<p>Loops...</p>',
          },
          {
            type: 'html',
            url_name: 'html_break_continue',
            display_name: 'Break and Continue',
            content: '<p>Break and continue...</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify html component references
      expect(result).toContain('<html url_name="html_if_statements"');
      expect(result).toContain('<html url_name="html_loops"');
      expect(result).toContain('<html url_name="html_break_continue"');

      // Verify self-closing tags
      expect(result).toMatch(/<html url_name="html_if_statements"\s*\/>/);
    });

    it('should handle single html component', () => {
      const vertical: OlxVertical = {
        url_name: 'single_component',
        display_name: 'Single Component Unit',
        components: [
          {
            type: 'html',
            url_name: 'html_only',
            display_name: 'The Only Component',
            content: '<p>Single component content</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      expect(result).toContain('<html url_name="html_only"');
      expect(result).toContain('</vertical>');
    });
  });

  describe('Cyrillic and Unicode Support', () => {
    it('should handle Cyrillic display_name with proper XML escaping', () => {
      const vertical: OlxVertical = {
        url_name: 'variables_unit',
        display_name: 'Переменные в Python',
        components: [
          {
            type: 'html',
            url_name: 'html_intro',
            display_name: 'Введение в переменные',
            content: '<p>Переменные - это...</p>',
          },
          {
            type: 'html',
            url_name: 'html_types',
            display_name: 'Типы данных',
            content: '<p>Типы данных в Python...</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify Cyrillic is preserved (UTF-8 encoding)
      expect(result).toContain('display_name="Переменные в Python"');
      // Note: Component display_name is NOT in vertical.xml (only url_name references)
    });

    it('should escape special XML characters in display_name', () => {
      const vertical: OlxVertical = {
        url_name: 'algorithms_unit',
        display_name: 'Algorithms: "Sorting & Searching"',
        components: [
          {
            type: 'html',
            url_name: 'html_sorting',
            display_name: 'Sorting: O(n log n) < O(n²)',
            content: '<p>Sorting algorithms...</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify XML escaping (&, ", <, >)
      expect(result).toContain('&amp;'); // Ampersand escaped
      expect(result).toContain('&quot;'); // Quotes escaped
      expect(result).not.toContain('Sorting & Searching'); // Raw ampersand should not exist
    });

    it('should handle display_name with comparison operators', () => {
      const vertical: OlxVertical = {
        url_name: 'conditions_unit',
        display_name: 'Conditional Logic: < and > operators',
        components: [
          {
            type: 'html',
            url_name: 'html_less_than',
            display_name: 'Using < operator',
            content: '<p>Less than...</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify < and > are escaped
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });
  });

  describe('HTML Component References', () => {
    it('should include all html component url_name references', () => {
      const vertical: OlxVertical = {
        url_name: 'full_unit',
        display_name: 'Complete Unit',
        components: [
          {
            type: 'html',
            url_name: 'html_1',
            display_name: 'Component 1',
            content: '<p>Content 1</p>',
          },
          {
            type: 'html',
            url_name: 'html_2',
            display_name: 'Component 2',
            content: '<p>Content 2</p>',
          },
          {
            type: 'html',
            url_name: 'html_3',
            display_name: 'Component 3',
            content: '<p>Content 3</p>',
          },
          {
            type: 'html',
            url_name: 'html_4',
            display_name: 'Component 4',
            content: '<p>Content 4</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify all 4 html components are referenced
      for (let i = 1; i <= 4; i++) {
        expect(result).toContain(`<html url_name="html_${i}"`);
      }
    });

    it('should preserve html component url_name order', () => {
      const vertical: OlxVertical = {
        url_name: 'ordered_unit',
        display_name: 'Ordered Unit',
        components: [
          {
            type: 'html',
            url_name: 'html_first',
            display_name: 'First',
            content: '<p>First</p>',
          },
          {
            type: 'html',
            url_name: 'html_second',
            display_name: 'Second',
            content: '<p>Second</p>',
          },
          {
            type: 'html',
            url_name: 'html_third',
            display_name: 'Third',
            content: '<p>Third</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify order by checking positions
      const firstPos = result.indexOf('url_name="html_first"');
      const secondPos = result.indexOf('url_name="html_second"');
      const thirdPos = result.indexOf('url_name="html_third"');

      expect(firstPos).toBeLessThan(secondPos);
      expect(secondPos).toBeLessThan(thirdPos);
    });

    it('should handle many html components (10+)', () => {
      const components = Array.from({ length: 15 }, (_, i) => ({
        type: 'html' as const,
        url_name: `html_${i + 1}`,
        display_name: `Component ${i + 1}`,
        content: `<p>Content ${i + 1}</p>`,
      }));

      const vertical: OlxVertical = {
        url_name: 'many_components',
        display_name: 'Unit with Many Components',
        components,
      };

      const result = generateVerticalXml(vertical);

      // Verify all 15 components are present
      for (let i = 1; i <= 15; i++) {
        expect(result).toContain(`url_name="html_${i}"`);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty components array', () => {
      const vertical: OlxVertical = {
        url_name: 'empty_unit',
        display_name: 'Empty Unit',
        components: [],
      };

      const result = generateVerticalXml(vertical);

      // Should still generate valid vertical XML
      expect(result).toContain('<vertical');
      expect(result).toContain('</vertical>');
      // Should not contain any html component references
      expect(result).not.toContain('<html');
    });

    it('should handle very long url_name', () => {
      const vertical: OlxVertical = {
        url_name: 'very_long_url_name_for_vertical_testing_purposes_that_is_still_valid',
        display_name: 'Long URL Name Unit',
        components: [
          {
            type: 'html',
            url_name: 'html_with_very_long_url_name_for_testing',
            display_name: 'Component',
            content: '<p>Content</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      expect(result).toContain('url_name="very_long_url_name_for_vertical_testing_purposes_that_is_still_valid"');
      expect(result).toContain('url_name="html_with_very_long_url_name_for_testing"');
    });

    it('should handle url_name with underscores, hyphens, and numbers', () => {
      const vertical: OlxVertical = {
        url_name: 'unit_1-1-1_intro_2025',
        display_name: 'Unit 1.1.1: Introduction',
        components: [
          {
            type: 'html',
            url_name: 'html_1-1-1-a',
            display_name: 'Component A',
            content: '<p>A</p>',
          },
          {
            type: 'html',
            url_name: 'html_1-1-1-b',
            display_name: 'Component B',
            content: '<p>B</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      expect(result).toContain('url_name="unit_1-1-1_intro_2025"');
      expect(result).toContain('url_name="html_1-1-1-a"');
      expect(result).toContain('url_name="html_1-1-1-b"');
    });

    it('should handle special characters in display_name (quotes, ampersands)', () => {
      const vertical: OlxVertical = {
        url_name: 'special_chars',
        display_name: 'Unit: "Advanced Topics" & Best Practices',
        components: [
          {
            type: 'html',
            url_name: 'html_1',
            display_name: 'Component: "Testing" & Debugging',
            content: '<p>Content</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify both " and & are escaped
      expect(result).toContain('&quot;');
      expect(result).toContain('&amp;');
    });
  });

  describe('XML Formatting and Structure', () => {
    it('should generate well-formed XML', () => {
      const vertical: OlxVertical = {
        url_name: 'wellformed',
        display_name: 'Well-Formed Vertical',
        components: [
          {
            type: 'html',
            url_name: 'html_1',
            display_name: 'Component 1',
            content: '<p>Content</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify single root element
      const verticalOpenTags = (result.match(/<vertical[^>]*>/g) || []).length;
      const verticalCloseTags = (result.match(/<\/vertical>/g) || []).length;
      expect(verticalOpenTags).toBe(1);
      expect(verticalCloseTags).toBe(1);
    });

    it('should properly indent nested html component elements', () => {
      const vertical: OlxVertical = {
        url_name: 'indent',
        display_name: 'Indented Vertical',
        components: [
          {
            type: 'html',
            url_name: 'html_1',
            display_name: 'Component 1',
            content: '<p>Content 1</p>',
          },
          {
            type: 'html',
            url_name: 'html_2',
            display_name: 'Component 2',
            content: '<p>Content 2</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify indentation (html components should be indented inside vertical)
      expect(result).toMatch(/\n\s+<html url_name="html_1"/);
      expect(result).toMatch(/\n\s+<html url_name="html_2"/);
    });

    it('should end with newline character', () => {
      const vertical: OlxVertical = {
        url_name: 'newline',
        display_name: 'Newline Vertical',
        components: [
          {
            type: 'html',
            url_name: 'html_1',
            display_name: 'Component',
            content: '<p>Content</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify ends with newline
      expect(result).toMatch(/\n$/);
    });
  });

  describe('Real-world Vertical Examples', () => {
    it('should generate vertical.xml for typical Python lesson unit', () => {
      const vertical: OlxVertical = {
        url_name: 'intro_to_variables',
        display_name: 'Введение в переменные',
        components: [
          {
            type: 'html',
            url_name: 'html_what_are_variables',
            display_name: 'Что такое переменные?',
            content: '<h2>Что такое переменные?</h2><p>Переменные - это...</p>',
          },
          {
            type: 'html',
            url_name: 'html_creating_variables',
            display_name: 'Создание переменных',
            content: '<h2>Создание переменных</h2><p>Для создания...</p>',
          },
          {
            type: 'html',
            url_name: 'html_examples',
            display_name: 'Примеры',
            content: '<h2>Примеры</h2><pre><code>x = 10</code></pre>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify all elements present
      expect(result).toContain('url_name="intro_to_variables"');
      expect(result).toContain('Введение в переменные');
      expect(result).toContain('url_name="html_what_are_variables"');
      expect(result).toContain('url_name="html_examples"');
    });

    it('should generate vertical.xml for data science unit with special chars', () => {
      const vertical: OlxVertical = {
        url_name: 'hypothesis_testing_intro',
        display_name: 'Hypothesis Testing: p-values & significance',
        components: [
          {
            type: 'html',
            url_name: 'html_null_hypothesis',
            display_name: 'Null Hypothesis (H₀)',
            content: '<h2>Null Hypothesis</h2><p>The null hypothesis...</p>',
          },
          {
            type: 'html',
            url_name: 'html_p_values',
            display_name: 'P-values: p < 0.05',
            content: '<h2>P-values</h2><p>When p < 0.05...</p>',
          },
          {
            type: 'html',
            url_name: 'html_significance',
            display_name: 'Statistical Significance & Interpretation',
            content: '<h2>Interpretation</h2><p>Results are significant if...</p>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      // Verify ampersand is escaped
      expect(result).toContain('p-values &amp; significance');
      // Verify html components present
      expect(result).toContain('url_name="html_null_hypothesis"');
      expect(result).toContain('url_name="html_p_values"');
      expect(result).toContain('url_name="html_significance"');
    });

    it('should generate vertical.xml for MegaCampus content block mapping', () => {
      const vertical: OlxVertical = {
        url_name: 'lesson_1_1_unit_1',
        display_name: 'Lesson 1.1 - Unit 1: What is Python?',
        components: [
          {
            type: 'html',
            url_name: 'html_intro',
            display_name: 'Introduction',
            content: '<h2>What is Python?</h2><p>Python is a...</p>',
          },
          {
            type: 'html',
            url_name: 'html_history',
            display_name: 'Python History',
            content: '<h3>History</h3><p>Created by Guido van Rossum...</p>',
          },
          {
            type: 'html',
            url_name: 'html_applications',
            display_name: 'Applications',
            content: '<h3>Where Python is Used</h3><ul><li>Web development</li></ul>',
          },
        ],
      };

      const result = generateVerticalXml(vertical);

      expect(result).toContain('Lesson 1.1 - Unit 1: What is Python?');
      expect(result).toContain('html_intro');
      expect(result).toContain('html_applications');
    });
  });
});
