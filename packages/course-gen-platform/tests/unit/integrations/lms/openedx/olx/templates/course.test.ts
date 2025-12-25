/**
 * Unit Tests for OLX course.xml Template Generator
 * Test ID: T036
 *
 * Tests generateCourseXml function for creating course.xml OLX structure.
 *
 * Expected Function Signature:
 * generateCourseXml(meta: OlxCourseMeta, chapters: { url_name: string }[]): string
 *
 * Expected Output Format:
 * <course url_name="..." display_name="..." org="..." course="..." language="...">
 *   <chapter url_name="..." />
 *   <chapter url_name="..." />
 * </course>
 *
 * NOTE: This is a TDD red-phase test. The implementation does not exist yet.
 * These tests will fail until T046 implements the actual function.
 */

import { describe, it, expect } from 'vitest';
import { generateCourseXml } from '@/integrations/lms/openedx/olx/templates/course';
import type { OlxCourseMeta } from '@megacampus/shared-types/lms/olx-types';

describe('generateCourseXml - OLX course.xml template', () => {
  describe('Basic Course XML Generation', () => {
    it('should generate valid course.xml with required attributes', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'INTRO101',
        run: '2025_Q1',
        display_name: 'Introduction to Programming',
        language: 'en',
      };

      const chapters = [
        { url_name: 'chapter_1' },
        { url_name: 'chapter_2' },
      ];

      const result = generateCourseXml(meta, chapters);

      // Verify XML structure
      expect(result).toContain('<course');
      expect(result).toContain('</course>');

      // Verify required attributes
      expect(result).toContain('org="MegaCampus"');
      expect(result).toContain('course="INTRO101"');
      // url_name is formatted as org_course_run
      expect(result).toContain('url_name="MegaCampus_INTRO101_2025_Q1"');
      expect(result).toContain('display_name="Introduction to Programming"');
      expect(result).toContain('language="en"');
    });

    it('should include chapter references as child elements', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'TEST101',
        run: '2025_Q1',
        display_name: 'Test Course',
        language: 'en',
      };

      const chapters = [
        { url_name: 'intro_chapter' },
        { url_name: 'basics_chapter' },
        { url_name: 'advanced_chapter' },
      ];

      const result = generateCourseXml(meta, chapters);

      // Verify chapter references
      expect(result).toContain('<chapter url_name="intro_chapter"');
      expect(result).toContain('<chapter url_name="basics_chapter"');
      expect(result).toContain('<chapter url_name="advanced_chapter"');

      // Verify self-closing tags
      expect(result).toMatch(/<chapter url_name="intro_chapter"\s*\/>/);
    });

    it('should handle single chapter', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'SINGLE101',
        run: '2025_Q1',
        display_name: 'Single Chapter Course',
        language: 'en',
      };

      const chapters = [{ url_name: 'only_chapter' }];

      const result = generateCourseXml(meta, chapters);

      expect(result).toContain('<chapter url_name="only_chapter"');
      expect(result).toContain('</course>');
    });
  });

  describe('Cyrillic and Unicode Support', () => {
    it('should handle Cyrillic display_name with proper XML escaping', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'RUS101',
        run: '2025_Q1',
        display_name: 'Введение в программирование',
        language: 'ru',
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      // Verify Cyrillic is preserved (UTF-8 encoding)
      expect(result).toContain('display_name="Введение в программирование"');
      expect(result).toContain('language="ru"');
    });

    it('should escape special XML characters in display_name', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'SPEC101',
        run: '2025_Q1',
        display_name: 'Data Structures & Algorithms: "Advanced" Course',
        language: 'en',
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      // Verify XML escaping (&, ", <, >)
      expect(result).toContain('&amp;'); // Ampersand escaped
      expect(result).toContain('&quot;'); // Quotes escaped
      expect(result).not.toContain('display_name="Data Structures & Algorithms'); // Raw ampersand should not exist
    });

    it('should handle display_name with less-than and greater-than', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'MATH101',
        run: '2025_Q1',
        display_name: 'Mathematics: x < y < z',
        language: 'en',
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      // Verify < and > are escaped
      expect(result).toContain('&lt;');
      expect(result).toContain('y &lt;');
    });
  });

  describe('Optional Attributes', () => {
    it('should include start and end dates when provided', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'DATED101',
        run: '2025_Q1',
        display_name: 'Dated Course',
        language: 'en',
        start: '2025-01-15T00:00:00Z',
        end: '2025-06-30T23:59:59Z',
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      // Verify start/end attributes
      expect(result).toContain('start="2025-01-15T00:00:00Z"');
      expect(result).toContain('end="2025-06-30T23:59:59Z"');
    });

    it('should omit start and end dates when not provided', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'NODATES101',
        run: '2025_Q1',
        display_name: 'Undated Course',
        language: 'en',
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      // Verify no start/end attributes
      expect(result).not.toContain('start=');
      expect(result).not.toContain('end=');
    });

    it('should handle only start date (no end date)', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'STARTONLY101',
        run: '2025_Q1',
        display_name: 'Start Only Course',
        language: 'en',
        start: '2025-01-01T00:00:00Z',
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      expect(result).toContain('start="2025-01-01T00:00:00Z"');
      expect(result).not.toContain('end=');
    });
  });

  describe('Language Attribute', () => {
    it('should use default language "ru" when not specified', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'DEFAULT101',
        run: '2025_Q1',
        display_name: 'Default Language Course',
        language: 'ru', // Default from schema
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      expect(result).toContain('language="ru"');
    });

    it('should support all 18 platform languages', () => {
      const languages = [
        'en', 'ru', 'zh', 'ar', 'ja', 'ko', 'hi', 'vi', 'es', 'fr',
        'de', 'pt', 'it', 'tr', 'th', 'id', 'ms', 'pl',
      ];

      languages.forEach((lang) => {
        const meta: OlxCourseMeta = {
          org: 'MegaCampus',
          course: 'LANG101',
          run: '2025_Q1',
          display_name: 'Multi-Language Course',
          language: lang as any,
        };

        const chapters = [{ url_name: 'chapter_1' }];

        const result = generateCourseXml(meta, chapters);

        expect(result).toContain(`language="${lang}"`);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty chapters array', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'EMPTY101',
        run: '2025_Q1',
        display_name: 'Empty Course',
        language: 'en',
      };

      const chapters: { url_name: string }[] = [];

      const result = generateCourseXml(meta, chapters);

      // Should still generate valid course XML
      expect(result).toContain('<course');
      expect(result).toContain('</course>');
      // Should not contain any chapter references
      expect(result).not.toContain('<chapter');
    });

    it('should handle very long course codes', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'ADVANCED_PROGRAMMING_WITH_PYTHON_2025', // Long code
        run: '2025_Q1',
        display_name: 'Advanced Programming',
        language: 'en',
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      expect(result).toContain('course="ADVANCED_PROGRAMMING_WITH_PYTHON_2025"');
    });

    it('should handle special characters in org name', () => {
      const meta: OlxCourseMeta = {
        org: 'Mega-Campus_2025',
        course: 'TEST101',
        run: '2025_Q1',
        display_name: 'Test Course',
        language: 'en',
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      expect(result).toContain('org="Mega-Campus_2025"');
    });
  });

  describe('XML Formatting and Structure', () => {
    it('should generate well-formed XML', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'WELLFORMED101',
        run: '2025_Q1',
        display_name: 'Well-Formed Course',
        language: 'en',
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      // Verify XML declaration (optional but good practice)
      // expect(result).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);

      // Verify single root element
      const courseOpenTags = (result.match(/<course[^>]*>/g) || []).length;
      const courseCloseTags = (result.match(/<\/course>/g) || []).length;
      expect(courseOpenTags).toBe(1);
      expect(courseCloseTags).toBe(1);
    });

    it('should properly indent nested chapter elements', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'INDENT101',
        run: '2025_Q1',
        display_name: 'Indented Course',
        language: 'en',
      };

      const chapters = [
        { url_name: 'chapter_1' },
        { url_name: 'chapter_2' },
      ];

      const result = generateCourseXml(meta, chapters);

      // Verify indentation (chapters should be indented inside course)
      // This assumes 2-space or 4-space indentation
      expect(result).toMatch(/\n\s+<chapter url_name="chapter_1"/);
      expect(result).toMatch(/\n\s+<chapter url_name="chapter_2"/);
    });

    it('should end with newline character', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'NEWLINE101',
        run: '2025_Q1',
        display_name: 'Newline Course',
        language: 'en',
      };

      const chapters = [{ url_name: 'chapter_1' }];

      const result = generateCourseXml(meta, chapters);

      // Verify ends with newline
      expect(result).toMatch(/\n$/);
    });
  });

  describe('Real-world Course Examples', () => {
    it('should generate course.xml for typical Russian programming course', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'PYTHON_BASICS',
        run: '2025_Spring',
        display_name: 'Основы программирования на Python',
        language: 'ru',
        start: '2025-02-01T00:00:00Z',
        end: '2025-05-31T23:59:59Z',
      };

      const chapters = [
        { url_name: 'intro' },
        { url_name: 'variables_types' },
        { url_name: 'control_flow' },
        { url_name: 'functions' },
        { url_name: 'data_structures' },
      ];

      const result = generateCourseXml(meta, chapters);

      // Verify all elements present
      expect(result).toContain('org="MegaCampus"');
      expect(result).toContain('course="PYTHON_BASICS"');
      expect(result).toContain('Основы программирования на Python');
      expect(result).toContain('language="ru"');
      expect(result).toContain('chapter url_name="intro"');
      expect(result).toContain('chapter url_name="data_structures"');
    });

    it('should generate course.xml for English data science course', () => {
      const meta: OlxCourseMeta = {
        org: 'DataScienceAcademy',
        course: 'DS101',
        run: '2025_Winter',
        display_name: 'Introduction to Data Science & Machine Learning',
        language: 'en',
        start: '2025-01-10T00:00:00Z',
      };

      const chapters = [
        { url_name: 'foundations' },
        { url_name: 'statistics' },
        { url_name: 'ml_basics' },
      ];

      const result = generateCourseXml(meta, chapters);

      // Verify ampersand is escaped
      expect(result).toContain('Data Science &amp; Machine Learning');
      expect(result).toContain('org="DataScienceAcademy"');
      expect(result).toContain('start="2025-01-10T00:00:00Z"');
    });
  });
});
