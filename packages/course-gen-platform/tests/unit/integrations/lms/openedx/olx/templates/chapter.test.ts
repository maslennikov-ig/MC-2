/**
 * Unit Tests for OLX chapter.xml Template Generator
 * Test ID: T037
 *
 * Tests generateChapterXml function for creating chapter.xml OLX structure.
 *
 * Expected Function Signature:
 * generateChapterXml(chapter: OlxChapter): string
 *
 * Expected Output Format:
 * <chapter url_name="..." display_name="...">
 *   <sequential url_name="..." />
 *   <sequential url_name="..." />
 * </chapter>
 *
 * NOTE: This is a TDD red-phase test. The implementation does not exist yet.
 * These tests will fail until T047 implements the actual function.
 */

import { describe, it, expect } from 'vitest';
import { generateChapterXml } from '@/integrations/lms/openedx/olx/templates/chapter';
import type { OlxChapter } from '@megacampus/shared-types/lms/olx-types';

describe('generateChapterXml - OLX chapter.xml template', () => {
  describe('Basic Chapter XML Generation', () => {
    it('should generate valid chapter.xml with required attributes', () => {
      const chapter: OlxChapter = {
        url_name: 'intro_chapter',
        display_name: 'Introduction to Programming',
        sequentials: [
          {
            url_name: 'lesson_1',
            display_name: 'Getting Started',
            verticals: [],
          },
          {
            url_name: 'lesson_2',
            display_name: 'Basic Syntax',
            verticals: [],
          },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify XML structure
      expect(result).toContain('<chapter');
      expect(result).toContain('</chapter>');

      // Verify attributes
      expect(result).toContain('url_name="intro_chapter"');
      expect(result).toContain('display_name="Introduction to Programming"');
    });

    it('should include sequential references as child elements', () => {
      const chapter: OlxChapter = {
        url_name: 'data_structures',
        display_name: 'Data Structures',
        sequentials: [
          {
            url_name: 'arrays_lists',
            display_name: 'Arrays and Lists',
            verticals: [],
          },
          {
            url_name: 'dictionaries',
            display_name: 'Dictionaries',
            verticals: [],
          },
          {
            url_name: 'sets_tuples',
            display_name: 'Sets and Tuples',
            verticals: [],
          },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify sequential references
      expect(result).toContain('<sequential url_name="arrays_lists"');
      expect(result).toContain('<sequential url_name="dictionaries"');
      expect(result).toContain('<sequential url_name="sets_tuples"');

      // Verify self-closing tags
      expect(result).toMatch(/<sequential url_name="arrays_lists"\s*\/>/);
    });

    it('should handle single sequential', () => {
      const chapter: OlxChapter = {
        url_name: 'single_lesson_chapter',
        display_name: 'Single Lesson Chapter',
        sequentials: [
          {
            url_name: 'only_lesson',
            display_name: 'The Only Lesson',
            verticals: [],
          },
        ],
      };

      const result = generateChapterXml(chapter);

      expect(result).toContain('<sequential url_name="only_lesson"');
      expect(result).toContain('</chapter>');
    });
  });

  describe('Cyrillic and Unicode Support', () => {
    it('should handle Cyrillic display_name with proper XML escaping', () => {
      const chapter: OlxChapter = {
        url_name: 'osnovy_python',
        display_name: 'Основы программирования на Python',
        sequentials: [
          {
            url_name: 'variables',
            display_name: 'Переменные и типы данных',
            verticals: [],
          },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify Cyrillic is preserved (UTF-8 encoding) in chapter's display_name
      expect(result).toContain('display_name="Основы программирования на Python"');
      // Note: Child sequential display_names are in their own files, not in chapter.xml
      // Chapter only contains url_name references to sequentials
      expect(result).toContain('url_name="variables"');
    });

    it('should escape special XML characters in display_name', () => {
      const chapter: OlxChapter = {
        url_name: 'algorithms',
        display_name: 'Data Structures & Algorithms: "Advanced" Topics',
        sequentials: [
          {
            url_name: 'sorting',
            display_name: 'Sorting: O(n log n) vs O(n²)',
            verticals: [],
          },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify XML escaping (&, ", <, >)
      expect(result).toContain('&amp;'); // Ampersand escaped
      expect(result).toContain('&quot;'); // Quotes escaped
      expect(result).not.toContain('Data Structures & Algorithms'); // Raw ampersand should not exist
    });

    it('should handle chapter display_name with comparison operators', () => {
      const chapter: OlxChapter = {
        url_name: 'comparisons',
        display_name: 'Comparison Operations: x < y vs x > y',  // Put special chars in chapter's display_name
        sequentials: [
          {
            url_name: 'less_than',
            display_name: 'Less Than (<) Operator',  // These are in their own XML files
            verticals: [],
          },
          {
            url_name: 'greater_than',
            display_name: 'Greater Than (>) Operator',  // These are in their own XML files
            verticals: [],
          },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify < and > in chapter's display_name are escaped
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      // Verify sequential url_name references are present
      expect(result).toContain('url_name="less_than"');
      expect(result).toContain('url_name="greater_than"');
    });
  });

  describe('Sequential References', () => {
    it('should include all sequential url_name references', () => {
      const chapter: OlxChapter = {
        url_name: 'full_chapter',
        display_name: 'Complete Chapter',
        sequentials: [
          { url_name: 'seq_1', display_name: 'Lesson 1', verticals: [] },
          { url_name: 'seq_2', display_name: 'Lesson 2', verticals: [] },
          { url_name: 'seq_3', display_name: 'Lesson 3', verticals: [] },
          { url_name: 'seq_4', display_name: 'Lesson 4', verticals: [] },
          { url_name: 'seq_5', display_name: 'Lesson 5', verticals: [] },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify all 5 sequentials are referenced
      for (let i = 1; i <= 5; i++) {
        expect(result).toContain(`<sequential url_name="seq_${i}"`);
      }
    });

    it('should preserve sequential url_name order', () => {
      const chapter: OlxChapter = {
        url_name: 'ordered_chapter',
        display_name: 'Ordered Chapter',
        sequentials: [
          { url_name: 'first', display_name: 'First', verticals: [] },
          { url_name: 'second', display_name: 'Second', verticals: [] },
          { url_name: 'third', display_name: 'Third', verticals: [] },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify order by checking positions
      const firstPos = result.indexOf('url_name="first"');
      const secondPos = result.indexOf('url_name="second"');
      const thirdPos = result.indexOf('url_name="third"');

      expect(firstPos).toBeLessThan(secondPos);
      expect(secondPos).toBeLessThan(thirdPos);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty sequentials array', () => {
      const chapter: OlxChapter = {
        url_name: 'empty_chapter',
        display_name: 'Empty Chapter',
        sequentials: [],
      };

      const result = generateChapterXml(chapter);

      // Should still generate valid chapter XML
      expect(result).toContain('<chapter');
      expect(result).toContain('</chapter>');
      // Should not contain any sequential references
      expect(result).not.toContain('<sequential');
    });

    it('should handle very long url_name', () => {
      const chapter: OlxChapter = {
        url_name: 'very_long_url_name_for_chapter_testing_purposes_that_is_still_valid',
        display_name: 'Long URL Name Chapter',
        sequentials: [
          {
            url_name: 'sequential_with_very_long_url_name_for_testing',
            display_name: 'Sequential',
            verticals: [],
          },
        ],
      };

      const result = generateChapterXml(chapter);

      expect(result).toContain('url_name="very_long_url_name_for_chapter_testing_purposes_that_is_still_valid"');
      expect(result).toContain('url_name="sequential_with_very_long_url_name_for_testing"');
    });

    it('should handle url_name with underscores and numbers', () => {
      const chapter: OlxChapter = {
        url_name: 'chapter_1_intro_2025',
        display_name: 'Chapter 1: Introduction',
        sequentials: [
          { url_name: 'lesson_1_1', display_name: 'Lesson 1.1', verticals: [] },
          { url_name: 'lesson_1_2', display_name: 'Lesson 1.2', verticals: [] },
        ],
      };

      const result = generateChapterXml(chapter);

      expect(result).toContain('url_name="chapter_1_intro_2025"');
      expect(result).toContain('url_name="lesson_1_1"');
      expect(result).toContain('url_name="lesson_1_2"');
    });

    it('should handle special characters in display_name (quotes, ampersands)', () => {
      const chapter: OlxChapter = {
        url_name: 'special_chars',
        display_name: "Chapter: \"Quotes\" & 'Apostrophes'",
        sequentials: [
          {
            url_name: 'seq_1',
            display_name: 'Lesson: "Testing" & More',
            verticals: [],
          },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify both " and & are escaped
      expect(result).toContain('&quot;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&apos;'); // Apostrophe escaped
    });
  });

  describe('XML Formatting and Structure', () => {
    it('should generate well-formed XML', () => {
      const chapter: OlxChapter = {
        url_name: 'wellformed',
        display_name: 'Well-Formed Chapter',
        sequentials: [
          { url_name: 'seq_1', display_name: 'Sequential 1', verticals: [] },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify single root element
      const chapterOpenTags = (result.match(/<chapter[^>]*>/g) || []).length;
      const chapterCloseTags = (result.match(/<\/chapter>/g) || []).length;
      expect(chapterOpenTags).toBe(1);
      expect(chapterCloseTags).toBe(1);
    });

    it('should properly indent nested sequential elements', () => {
      const chapter: OlxChapter = {
        url_name: 'indent',
        display_name: 'Indented Chapter',
        sequentials: [
          { url_name: 'seq_1', display_name: 'Sequential 1', verticals: [] },
          { url_name: 'seq_2', display_name: 'Sequential 2', verticals: [] },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify indentation (sequentials should be indented inside chapter)
      expect(result).toMatch(/\n\s+<sequential url_name="seq_1"/);
      expect(result).toMatch(/\n\s+<sequential url_name="seq_2"/);
    });

    it('should end with newline character', () => {
      const chapter: OlxChapter = {
        url_name: 'newline',
        display_name: 'Newline Chapter',
        sequentials: [
          { url_name: 'seq_1', display_name: 'Sequential', verticals: [] },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify ends with newline
      expect(result).toMatch(/\n$/);
    });
  });

  describe('Real-world Chapter Examples', () => {
    it('should generate chapter.xml for typical Python basics chapter', () => {
      const chapter: OlxChapter = {
        url_name: 'python_basics',
        display_name: 'Основы Python',
        sequentials: [
          { url_name: 'intro', display_name: 'Введение', verticals: [] },
          { url_name: 'variables', display_name: 'Переменные и типы', verticals: [] },
          { url_name: 'operators', display_name: 'Операторы', verticals: [] },
          { url_name: 'control_flow', display_name: 'Управляющие конструкции', verticals: [] },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify all elements present
      expect(result).toContain('url_name="python_basics"');
      expect(result).toContain('Основы Python');
      expect(result).toContain('url_name="intro"');
      expect(result).toContain('url_name="control_flow"');
    });

    it('should generate chapter.xml for data science chapter with special chars', () => {
      const chapter: OlxChapter = {
        url_name: 'statistics_ml',
        display_name: 'Statistics & Machine Learning Fundamentals',
        sequentials: [
          { url_name: 'probability', display_name: 'Probability Theory', verticals: [] },
          { url_name: 'distributions', display_name: 'Distributions: Normal & T-distribution', verticals: [] },
          { url_name: 'hypothesis_testing', display_name: 'Hypothesis Testing (p < 0.05)', verticals: [] },
        ],
      };

      const result = generateChapterXml(chapter);

      // Verify ampersand is escaped in chapter's display_name
      expect(result).toContain('Statistics &amp; Machine Learning');
      // Verify sequential url_names are referenced (their display_names are in their own files)
      expect(result).toContain('url_name="probability"');
      expect(result).toContain('url_name="distributions"');
      expect(result).toContain('url_name="hypothesis_testing"');
    });

    it('should generate chapter.xml for MegaCampus section (1 section = 1 chapter)', () => {
      const chapter: OlxChapter = {
        url_name: 'section_1_fundamentals',
        display_name: 'Section 1: Programming Fundamentals',
        sequentials: [
          { url_name: 'lesson_1_1', display_name: 'Lesson 1.1: Variables', verticals: [] },
          { url_name: 'lesson_1_2', display_name: 'Lesson 1.2: Data Types', verticals: [] },
          { url_name: 'lesson_1_3', display_name: 'Lesson 1.3: Operators', verticals: [] },
        ],
      };

      const result = generateChapterXml(chapter);

      expect(result).toContain('Section 1: Programming Fundamentals');
      expect(result).toContain('lesson_1_1');
      expect(result).toContain('lesson_1_2');
      expect(result).toContain('lesson_1_3');
    });
  });
});
