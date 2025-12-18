/**
 * Unit Tests for OLX Validators Module
 * Tests T044: Comprehensive validation tests for CourseInput and OLXStructure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateCourseInput,
  validateOLXStructure,
  validateXml,
  isValidUrlName,
  type ValidationResult,
} from '@/integrations/lms/openedx/olx/validators';
import type { CourseInput } from '@megacampus/shared-types/lms';
import type { OLXStructure, CourseKey } from '@/integrations/lms/openedx/olx/types';

// Mock lmsLogger to avoid console output during tests
vi.mock('@/integrations/lms/logger', () => ({
  lmsLogger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper: Create valid minimal CourseInput
function createValidCourseInput(): CourseInput {
  return {
    courseId: 'intro-to-ai',
    title: 'Introduction to AI',
    description: 'Learn AI basics',
    org: 'MegaCampus',
    run: '2025_Q1',
    language: 'ru',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Chapter 1',
        sections: [
          {
            id: 'section-1',
            title: 'Section 1',
            units: [
              {
                id: 'unit-1',
                title: 'Unit 1',
                content: '<p>Hello world</p>',
              },
            ],
          },
        ],
      },
    ],
  };
}

// Helper: Create valid minimal OLXStructure
function createValidOLXStructure(): OLXStructure {
  return {
    courseXml: '<course url_name="test" org="MegaCampus" />',
    courseKey: 'course-v1:MegaCampus+AI101+2025_Q1' as CourseKey,
    chapters: new Map([['chapter_1', '<chapter url_name="chapter_1" />']]),
    sequentials: new Map([['section_1', '<sequential url_name="section_1" />']]),
    verticals: new Map([['unit_1', '<vertical url_name="unit_1" />']]),
    htmlRefs: new Map([['html_1', '<html url_name="html_1" filename="html_1" />']]),
    htmlContent: new Map([['html_1', '<p>Content</p>']]),
    policies: {
      policyJson: '{"course/test": {}}',
      gradingPolicyJson: '{"GRADER": []}',
    },
    meta: {
      org: 'MegaCampus',
      course: 'AI101',
      run: '2025_Q1',
      display_name: 'Introduction to AI',
      language: 'ru',
    },
  };
}

// Helper: Create invalid CourseInput with specific overrides
function createInvalidCourseInput(overrides: Partial<CourseInput>): CourseInput {
  const base = createValidCourseInput();
  return { ...base, ...overrides };
}

describe('validateCourseInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Valid Cases', () => {
    it('should validate valid minimal course input (1 chapter, 1 section, 1 unit)', () => {
      const input = createValidCourseInput();
      const result = validateCourseInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid course with multiple chapters', () => {
      const input = createValidCourseInput();
      input.chapters.push({
        id: 'chapter-2',
        title: 'Chapter 2',
        sections: [
          {
            id: 'section-2',
            title: 'Section 2',
            units: [
              {
                id: 'unit-2',
                title: 'Unit 2',
                content: '<p>Content 2</p>',
              },
            ],
          },
        ],
      });

      const result = validateCourseInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate course with ASCII courseId/org/run containing hyphens and underscores', () => {
      const input = createValidCourseInput();
      input.courseId = 'intro-to-ai_2025';
      input.org = 'Mega_Campus-Org';
      input.run = '2025_Q1-Spring';

      const result = validateCourseInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate course with Cyrillic titles (titles can be UTF-8)', () => {
      const input = createValidCourseInput();
      input.title = 'Введение в программирование';
      input.chapters[0].title = 'Глава 1: Основы';
      input.chapters[0].sections[0].title = 'Раздел 1: Начало';
      input.chapters[0].sections[0].units[0].title = 'Урок 1: Привет мир';

      const result = validateCourseInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate course with multiple sections per chapter', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections.push({
        id: 'section-2',
        title: 'Section 2',
        units: [
          {
            id: 'unit-2',
            title: 'Unit 2',
            content: '<p>Content 2</p>',
          },
        ],
      });

      const result = validateCourseInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate course with multiple units per section', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units.push({
        id: 'unit-2',
        title: 'Unit 2',
        content: '<p>More content</p>',
      });

      const result = validateCourseInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Error Cases - Structure', () => {
    it('should reject course with empty chapters array', () => {
      const input = createInvalidCourseInput({ chapters: [] });
      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Course must have at least 1 chapter');
    });

    it('should reject chapter with empty sections array', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections = [];

      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('must have at least 1 section');
      expect(result.errors[0]).toContain('Chapter 1');
    });

    it('should reject section with empty units array', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units = [];

      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('must have at least 1 unit');
      expect(result.errors[0]).toContain('Section 1');
    });

    it('should reject unit with empty content', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = '';

      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('must have content');
      expect(result.errors[0]).toContain('Unit 1');
    });

    it('should reject unit with whitespace-only content', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].content = '   \n  \t  ';

      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('must have content');
    });

    it('should reject unit with empty title', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].title = '';

      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('must have a title');
    });

    it('should reject unit with whitespace-only title', () => {
      const input = createValidCourseInput();
      input.chapters[0].sections[0].units[0].title = '   ';

      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('must have a title');
    });
  });

  describe('Error Cases - ASCII Identifiers', () => {
    it('should reject non-ASCII courseId (Cyrillic)', () => {
      const input = createInvalidCourseInput({ courseId: 'введение-в-ai' });
      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.includes('courseId') && e.includes('ASCII'))).toBe(true);
    });

    it('should reject non-ASCII org', () => {
      const input = createInvalidCourseInput({ org: 'МегаКампус' });
      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.includes('org') && e.includes('ASCII'))).toBe(true);
    });

    it('should reject non-ASCII run', () => {
      const input = createInvalidCourseInput({ run: '2025_весна' });
      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.includes('run') && e.includes('ASCII'))).toBe(true);
    });

    it('should reject courseId with spaces', () => {
      const input = createInvalidCourseInput({ courseId: 'intro to ai' });
      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.includes('courseId') && e.includes('ASCII'))).toBe(true);
    });

    it('should reject org with special characters', () => {
      const input = createInvalidCourseInput({ org: 'Mega@Campus' });
      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.includes('org') && e.includes('ASCII'))).toBe(true);
    });

    it('should reject run with periods', () => {
      const input = createInvalidCourseInput({ run: '2025.Q1' });
      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.includes('run') && e.includes('ASCII'))).toBe(true);
    });
  });

  describe('Multiple Errors', () => {
    it('should return multiple errors for multiple issues', () => {
      const input = createValidCourseInput();
      input.courseId = 'invalid courseId'; // Space
      input.org = 'Неверный'; // Cyrillic
      input.chapters[0].sections[0].units[0].content = ''; // Empty content

      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.some((e) => e.includes('courseId'))).toBe(true);
      expect(result.errors.some((e) => e.includes('org'))).toBe(true);
      expect(result.errors.some((e) => e.includes('must have content'))).toBe(true);
    });

    it('should capture errors from multiple chapters', () => {
      const input = createValidCourseInput();
      input.chapters.push({
        id: 'chapter-2',
        title: 'Chapter 2',
        sections: [], // Empty sections
      });
      input.chapters[0].sections[0].units[0].content = ''; // Empty content

      const result = validateCourseInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.some((e) => e.includes('Chapter 1'))).toBe(true);
      expect(result.errors.some((e) => e.includes('Chapter 1'))).toBe(true);
    });
  });
});

describe('validateOLXStructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Valid Cases', () => {
    it('should validate valid minimal OLX structure', () => {
      const structure = createValidOLXStructure();
      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate structure with multiple chapters/sequentials', () => {
      const structure = createValidOLXStructure();
      structure.chapters.set('chapter_2', '<chapter url_name="chapter_2" />');
      structure.sequentials.set('section_2', '<sequential url_name="section_2" />');
      structure.verticals.set('unit_2', '<vertical url_name="unit_2" />');

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate structure with ASCII url_names containing underscores', () => {
      const structure = createValidOLXStructure();
      structure.chapters.set('chapter_intro_basics', '<chapter url_name="chapter_intro_basics" />');

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate structure with ASCII url_names containing hyphens', () => {
      const structure = createValidOLXStructure();
      structure.chapters.set('chapter-intro-basics', '<chapter url_name="chapter-intro-basics" />');

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid policy files (proper JSON)', () => {
      const structure = createValidOLXStructure();
      structure.policies.policyJson = JSON.stringify({
        'course/test': {
          display_name: 'Test Course',
          language: 'ru',
        },
      });
      structure.policies.gradingPolicyJson = JSON.stringify({
        GRADER: [
          {
            type: 'Homework',
            min_count: 5,
            drop_count: 1,
            weight: 0.5,
          },
        ],
      });

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Error Cases - Course XML', () => {
    it('should reject empty courseXml', () => {
      const structure = createValidOLXStructure();
      structure.courseXml = '';

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('course.xml') && e.includes('empty'))).toBe(true);
    });

    it('should reject whitespace-only courseXml', () => {
      const structure = createValidOLXStructure();
      structure.courseXml = '   \n  \t  ';

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('course.xml') && e.includes('empty'))).toBe(true);
    });
  });

  describe('Error Cases - Course Key', () => {
    it('should reject invalid courseKey (not starting with "course-v1:")', () => {
      const structure = createValidOLXStructure();
      structure.courseKey = 'MegaCampus+AI101+2025_Q1' as CourseKey;

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid course key format'))).toBe(true);
    });

    it('should reject courseKey with wrong prefix', () => {
      const structure = createValidOLXStructure();
      structure.courseKey = 'course-v2:MegaCampus+AI101+2025_Q1' as CourseKey;

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid course key format'))).toBe(true);
    });
  });

  describe('Error Cases - Chapters', () => {
    it('should reject empty chapters map', () => {
      const structure = createValidOLXStructure();
      structure.chapters = new Map();

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Course must have at least 1 chapter'))).toBe(
        true
      );
    });
  });

  describe('Error Cases - URL Names', () => {
    it('should reject invalid url_name (uppercase)', () => {
      const structure = createValidOLXStructure();
      structure.chapters.set('Chapter_1', '<chapter url_name="Chapter_1" />');

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid') && e.includes('Chapter_1'))).toBe(
        true
      );
    });

    it('should reject invalid url_name (Cyrillic)', () => {
      const structure = createValidOLXStructure();
      structure.chapters.set('глава_1', '<chapter url_name="глава_1" />');

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid') && e.includes('ASCII'))).toBe(true);
    });

    it('should reject invalid url_name (spaces)', () => {
      const structure = createValidOLXStructure();
      structure.sequentials.set('section 1', '<sequential url_name="section 1" />');

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid') && e.includes('ASCII'))).toBe(true);
    });

    it('should reject invalid url_name (special characters)', () => {
      const structure = createValidOLXStructure();
      structure.verticals.set('unit@1', '<vertical url_name="unit@1" />');

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid') && e.includes('ASCII'))).toBe(true);
    });
  });

  describe('Error Cases - Policy Files', () => {
    it('should reject missing policy.json', () => {
      const structure = createValidOLXStructure();
      structure.policies.policyJson = '';

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('policy.json') && e.includes('empty'))).toBe(
        true
      );
    });

    it('should reject whitespace-only policy.json', () => {
      const structure = createValidOLXStructure();
      structure.policies.policyJson = '   ';

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('policy.json') && e.includes('empty'))).toBe(
        true
      );
    });

    it('should reject invalid policy.json (not JSON)', () => {
      const structure = createValidOLXStructure();
      structure.policies.policyJson = 'not valid json {';

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('policy.json') && e.includes('not valid JSON'))
      ).toBe(true);
    });

    it('should reject missing grading_policy.json', () => {
      const structure = createValidOLXStructure();
      structure.policies.gradingPolicyJson = '';

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('grading_policy.json') && e.includes('empty'))
      ).toBe(true);
    });

    it('should reject invalid grading_policy.json (not JSON)', () => {
      const structure = createValidOLXStructure();
      structure.policies.gradingPolicyJson = '{"GRADER": [unclosed';

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('grading_policy.json') && e.includes('not valid JSON'))
      ).toBe(true);
    });
  });

  describe('Error Cases - XML Files', () => {
    it('should reject malformed XML in chapters (empty content)', () => {
      const structure = createValidOLXStructure();
      structure.chapters.set('chapter_1', '');

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('chapter/chapter_1.xml'))).toBe(true);
    });

    it('should reject malformed XML in sequentials (no tags)', () => {
      const structure = createValidOLXStructure();
      structure.sequentials.set('section_1', 'not xml content');

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('sequential/section_1.xml'))).toBe(true);
    });

    it('should reject malformed XML in verticals (mismatched tags)', () => {
      const structure = createValidOLXStructure();
      structure.verticals.set('unit_1', '<vertical><inner></vertical>');

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('vertical/unit_1.xml'))).toBe(true);
    });
  });

  describe('Multiple Errors', () => {
    it('should return multiple errors for multiple issues', () => {
      const structure = createValidOLXStructure();
      structure.courseXml = ''; // Empty course.xml
      structure.courseKey = 'invalid-key' as CourseKey; // Invalid key
      structure.chapters = new Map(); // Empty chapters
      structure.policies.policyJson = 'invalid json'; // Invalid JSON

      const result = validateOLXStructure(structure);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});

describe('validateXml', () => {
  describe('Valid Cases', () => {
    it('should validate simple valid XML (self-closing tag)', () => {
      const content = '<chapter url_name="test" />';
      const result = validateXml(content, 'chapter.xml');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate nested XML', () => {
      const content = '<course><chapter><sequential /></chapter></course>';
      const result = validateXml(content, 'course.xml');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate self-closing tags', () => {
      const content = '<html url_name="test" filename="test.html" />';
      const result = validateXml(content, 'html.xml');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate UTF-8 content', () => {
      const content = '<course display_name="Введение в AI" />';
      const result = validateXml(content, 'course.xml');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate XML with attributes', () => {
      const content =
        '<chapter url_name="chapter_1" display_name="Chapter 1" start="2025-01-01T00:00:00Z" />';
      const result = validateXml(content, 'chapter.xml');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate XML with multiple nested levels', () => {
      const content = `
        <course>
          <chapter>
            <sequential>
              <vertical>
                <html />
              </vertical>
            </sequential>
          </chapter>
        </course>
      `;
      const result = validateXml(content, 'course.xml');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Error Cases', () => {
    it('should reject empty content', () => {
      const result = validateXml('', 'test.xml');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('test.xml');
      expect(result.errors[0]).toContain('empty');
    });

    it('should reject whitespace-only content', () => {
      const result = validateXml('   \n  \t  ', 'test.xml');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('empty');
    });

    it('should reject content with no XML tags', () => {
      const result = validateXml('This is just plain text', 'test.xml');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('does not appear to be XML');
    });

    it('should reject content with only opening bracket', () => {
      const result = validateXml('< this is not xml', 'test.xml');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject mismatched tags (more opening than closing)', () => {
      const content = '<chapter><sequential><vertical></vertical></sequential>';
      const result = validateXml(content, 'test.xml');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Mismatched XML tags'))).toBe(true);
    });

    it('should reject mismatched tags (more closing than opening)', () => {
      const content = '<chapter></chapter></sequential>';
      const result = validateXml(content, 'test.xml');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Mismatched XML tags'))).toBe(true);
    });

    it('should provide filename in error messages', () => {
      const result = validateXml('', 'chapter/intro.xml');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('chapter/intro.xml');
    });
  });

  describe('Tag Counting', () => {
    it('should correctly count self-closing tags', () => {
      const content = '<chapter /><sequential /><vertical />';
      const result = validateXml(content, 'test.xml');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should correctly count mixed self-closing and paired tags', () => {
      const content = '<course><chapter /><sequential></sequential></course>';
      const result = validateXml(content, 'test.xml');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

describe('isValidUrlName', () => {
  describe('Valid Cases', () => {
    it('should accept simple lowercase: "chapter_1"', () => {
      expect(isValidUrlName('chapter_1')).toBe(true);
    });

    it('should accept url_name with hyphen: "lesson-intro"', () => {
      expect(isValidUrlName('lesson-intro')).toBe(true);
    });

    it('should accept url_name with numbers: "unit_123"', () => {
      expect(isValidUrlName('unit_123')).toBe(true);
    });

    it('should accept single character: "a"', () => {
      expect(isValidUrlName('a')).toBe(true);
    });

    it('should accept single digit: "1"', () => {
      expect(isValidUrlName('1')).toBe(true);
    });

    it('should accept maximum length (100 chars)', () => {
      const longValid = 'a'.repeat(100);
      expect(isValidUrlName(longValid)).toBe(true);
    });

    it('should accept mixed lowercase, numbers, underscores, hyphens', () => {
      expect(isValidUrlName('intro-to-ai_2025_chapter_1')).toBe(true);
    });

    it('should accept all lowercase letters', () => {
      expect(isValidUrlName('abcdefghijklmnopqrstuvwxyz')).toBe(true);
    });

    it('should accept all digits', () => {
      expect(isValidUrlName('0123456789')).toBe(true);
    });

    it('should accept only underscores', () => {
      expect(isValidUrlName('___')).toBe(true);
    });

    it('should accept only hyphens', () => {
      expect(isValidUrlName('---')).toBe(true);
    });
  });

  describe('Invalid Cases', () => {
    it('should reject empty string', () => {
      expect(isValidUrlName('')).toBe(false);
    });

    it('should reject uppercase: "Chapter_1"', () => {
      expect(isValidUrlName('Chapter_1')).toBe(false);
    });

    it('should reject mixed case: "Chapter_intro"', () => {
      expect(isValidUrlName('Chapter_intro')).toBe(false);
    });

    it('should reject Cyrillic: "введение"', () => {
      expect(isValidUrlName('введение')).toBe(false);
    });

    it('should reject Chinese characters: "第一章"', () => {
      expect(isValidUrlName('第一章')).toBe(false);
    });

    it('should reject space: "hello world"', () => {
      expect(isValidUrlName('hello world')).toBe(false);
    });

    it('should reject special chars: "unit@1"', () => {
      expect(isValidUrlName('unit@1')).toBe(false);
    });

    it('should reject period: "chapter.1"', () => {
      expect(isValidUrlName('chapter.1')).toBe(false);
    });

    it('should reject too long (>100 chars)', () => {
      const tooLong = 'a'.repeat(101);
      expect(isValidUrlName(tooLong)).toBe(false);
    });

    it('should reject leading spaces: " chapter"', () => {
      expect(isValidUrlName(' chapter')).toBe(false);
    });

    it('should reject trailing spaces: "chapter "', () => {
      expect(isValidUrlName('chapter ')).toBe(false);
    });

    it('should reject leading/trailing spaces: " chapter "', () => {
      expect(isValidUrlName(' chapter ')).toBe(false);
    });

    it('should reject slash: "chapter/1"', () => {
      expect(isValidUrlName('chapter/1')).toBe(false);
    });

    it('should reject backslash: "chapter\\1"', () => {
      expect(isValidUrlName('chapter\\1')).toBe(false);
    });

    it('should reject plus: "chapter+1"', () => {
      expect(isValidUrlName('chapter+1')).toBe(false);
    });

    it('should reject equals: "chapter=1"', () => {
      expect(isValidUrlName('chapter=1')).toBe(false);
    });

    it('should reject parentheses: "chapter(1)"', () => {
      expect(isValidUrlName('chapter(1)')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle exactly 100 characters', () => {
      const exactly100 = 'a'.repeat(100);
      expect(isValidUrlName(exactly100)).toBe(true);
    });

    it('should reject 101 characters', () => {
      const exactly101 = 'a'.repeat(101);
      expect(isValidUrlName(exactly101)).toBe(false);
    });

    it('should reject tab character', () => {
      expect(isValidUrlName('chapter\t1')).toBe(false);
    });

    it('should reject newline character', () => {
      expect(isValidUrlName('chapter\n1')).toBe(false);
    });

    it('should reject emoji', () => {
      expect(isValidUrlName('chapter_😀')).toBe(false);
    });
  });
});
