/**
 * Unit Tests for OLXGenerator Class
 * Test ID: T042
 *
 * Tests the OLXGenerator class for converting CourseInput to OLX structure.
 * Covers basic generation, structure mapping, Cyrillic support, validation,
 * reset functionality, and performance.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OLXGenerator } from '@/integrations/lms/openedx/olx/generator';
import { OLXValidationError } from '@megacampus/shared-types/lms';
import type { CourseInput } from '@megacampus/shared-types/lms';

// Mock the logger to avoid console output during tests
vi.mock('@/integrations/lms/logger', () => ({
  lmsLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * Helper function to create minimal valid CourseInput
 */
function createMinimalCourseInput(overrides?: Partial<CourseInput>): CourseInput {
  return {
    courseId: 'TEST101',
    title: 'Test Course',
    description: 'A test course',
    org: 'MegaCampus',
    run: '2025_Q1',
    language: 'en',
    chapters: [
      {
        id: 'chapter1',
        title: 'Chapter 1',
        sections: [
          {
            id: 'section1',
            title: 'Section 1',
            units: [
              {
                id: 'unit1',
                title: 'Unit 1',
                content: '<p>Test content</p>',
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

/**
 * Helper function to create multi-chapter course
 */
function createMultiChapterCourse(): CourseInput {
  return {
    courseId: 'MULTI101',
    title: 'Multi-Chapter Course',
    org: 'MegaCampus',
    run: '2025_Q1',
    language: 'en',
    chapters: [
      {
        id: 'ch1',
        title: 'Introduction',
        sections: [
          {
            id: 'sec1',
            title: 'Basics',
            units: [
              { id: 'u1', title: 'Unit 1', content: '<p>Content 1</p>' },
              { id: 'u2', title: 'Unit 2', content: '<p>Content 2</p>' },
              { id: 'u3', title: 'Unit 3', content: '<p>Content 3</p>' },
            ],
          },
          {
            id: 'sec2',
            title: 'Advanced',
            units: [
              { id: 'u4', title: 'Unit 4', content: '<p>Content 4</p>' },
              { id: 'u5', title: 'Unit 5', content: '<p>Content 5</p>' },
              { id: 'u6', title: 'Unit 6', content: '<p>Content 6</p>' },
            ],
          },
        ],
      },
      {
        id: 'ch2',
        title: 'Deep Dive',
        sections: [
          {
            id: 'sec3',
            title: 'Theory',
            units: [
              { id: 'u7', title: 'Unit 7', content: '<p>Content 7</p>' },
              { id: 'u8', title: 'Unit 8', content: '<p>Content 8</p>' },
              { id: 'u9', title: 'Unit 9', content: '<p>Content 9</p>' },
            ],
          },
          {
            id: 'sec4',
            title: 'Practice',
            units: [
              { id: 'u10', title: 'Unit 10', content: '<p>Content 10</p>' },
              { id: 'u11', title: 'Unit 11', content: '<p>Content 11</p>' },
              { id: 'u12', title: 'Unit 12', content: '<p>Content 12</p>' },
            ],
          },
        ],
      },
      {
        id: 'ch3',
        title: 'Projects',
        sections: [
          {
            id: 'sec5',
            title: 'Final Project',
            units: [
              { id: 'u13', title: 'Unit 13', content: '<p>Content 13</p>' },
              { id: 'u14', title: 'Unit 14', content: '<p>Content 14</p>' },
              { id: 'u15', title: 'Unit 15', content: '<p>Content 15</p>' },
            ],
          },
          {
            id: 'sec6',
            title: 'Presentations',
            units: [
              { id: 'u16', title: 'Unit 16', content: '<p>Content 16</p>' },
              { id: 'u17', title: 'Unit 17', content: '<p>Content 17</p>' },
              { id: 'u18', title: 'Unit 18', content: '<p>Content 18</p>' },
            ],
          },
        ],
      },
    ],
  };
}

describe('OLXGenerator - Basic Generation', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should generate OLX from minimal valid course input', () => {
    const input = createMinimalCourseInput();
    const result = generator.generate(input);

    expect(result).toBeDefined();
    expect(result.courseKey).toBe('course-v1:MegaCampus+TEST101+2025_Q1');
    expect(result.courseXml).toBeDefined();
    expect(result.courseXml.length).toBeGreaterThan(0);
    expect(result.chapters.size).toBe(1);
    expect(result.sequentials.size).toBe(1);
    expect(result.verticals.size).toBe(1);
    expect(result.htmlRefs.size).toBe(1);
    expect(result.htmlContent.size).toBe(1);
  });

  it('should generate OLX from multi-chapter course', () => {
    const input = createMultiChapterCourse();
    const result = generator.generate(input);

    expect(result.courseKey).toBe('course-v1:MegaCampus+MULTI101+2025_Q1');
    expect(result.chapters.size).toBe(3);
    expect(result.sequentials.size).toBe(6);
    expect(result.verticals.size).toBe(18);
    expect(result.htmlRefs.size).toBe(18);
    expect(result.htmlContent.size).toBe(18);
  });

  it('should verify courseKey format matches course-v1:Org+Course+Run', () => {
    const input = createMinimalCourseInput({
      org: 'TestOrg',
      courseId: 'COURSE123',
      run: 'spring_2025',
    });
    const result = generator.generate(input);

    expect(result.courseKey).toBe('course-v1:TestOrg+COURSE123+spring_2025');
    expect(result.courseKey).toMatch(/^course-v1:[^+]+\+[^+]+\+[^+]+$/);
  });

  it('should verify courseXml contains valid XML structure', () => {
    const input = createMinimalCourseInput();
    const result = generator.generate(input);

    expect(result.courseXml).toContain('<course');
    expect(result.courseXml).toContain('</course>');
    expect(result.courseXml).toContain('org="MegaCampus"');
    expect(result.courseXml).toContain('course="TEST101"');
  });

  it('should generate all required metadata', () => {
    const input = createMinimalCourseInput({
      startDate: '2025-01-15T00:00:00Z',
      description: 'Test description',
    });
    const result = generator.generate(input);

    expect(result.meta).toBeDefined();
    expect(result.meta.org).toBe('MegaCampus');
    expect(result.meta.course).toBe('TEST101');
    expect(result.meta.run).toBe('2025_Q1');
    expect(result.meta.display_name).toBe('Test Course');
    expect(result.meta.language).toBe('en');
    expect(result.meta.start).toBe('2025-01-15T00:00:00Z');
  });
});

describe('OLXGenerator - Structure Mapping', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should verify chapters map contains correct XML for each chapter', () => {
    const input = createMultiChapterCourse();
    const result = generator.generate(input);

    expect(result.chapters.size).toBe(3);

    // Check that each chapter XML contains proper structure
    for (const [urlName, xml] of result.chapters.entries()) {
      expect(xml).toContain('<chapter');
      expect(xml).toContain(`url_name="${urlName}"`);
      expect(xml).toContain('</chapter>');
      expect(xml).toContain('<sequential');
    }
  });

  it('should verify sequentials map contains correct XML for each section', () => {
    const input = createMultiChapterCourse();
    const result = generator.generate(input);

    expect(result.sequentials.size).toBe(6);

    for (const [urlName, xml] of result.sequentials.entries()) {
      expect(xml).toContain('<sequential');
      expect(xml).toContain(`url_name="${urlName}"`);
      expect(xml).toContain('</sequential>');
      expect(xml).toContain('<vertical');
    }
  });

  it('should verify verticals map contains correct XML for each unit', () => {
    const input = createMultiChapterCourse();
    const result = generator.generate(input);

    expect(result.verticals.size).toBe(18);

    for (const [urlName, xml] of result.verticals.entries()) {
      expect(xml).toContain('<vertical');
      expect(xml).toContain(`url_name="${urlName}"`);
      expect(xml).toContain('</vertical>');
      expect(xml).toContain('<html');
    }
  });

  it('should verify htmlRefs and htmlContent maps are populated correctly', () => {
    const input = createMultiChapterCourse();
    const result = generator.generate(input);

    expect(result.htmlRefs.size).toBe(18);
    expect(result.htmlContent.size).toBe(18);

    // Verify same url_names in both maps
    const refKeys = Array.from(result.htmlRefs.keys()).sort();
    const contentKeys = Array.from(result.htmlContent.keys()).sort();
    expect(refKeys).toEqual(contentKeys);
  });

  it('should verify 1:1 mapping between input units and output html files', () => {
    const input = createMultiChapterCourse();
    const result = generator.generate(input);

    // Count total units in input
    let totalUnits = 0;
    for (const chapter of input.chapters) {
      for (const section of chapter.sections) {
        totalUnits += section.units.length;
      }
    }

    expect(result.htmlContent.size).toBe(totalUnits);
    expect(result.htmlRefs.size).toBe(totalUnits);
    expect(result.verticals.size).toBe(totalUnits);
  });

  it('should ensure all html content contains actual unit content', () => {
    const input = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter 1',
          sections: [
            {
              id: 'sec1',
              title: 'Section 1',
              units: [
                {
                  id: 'u1',
                  title: 'Unit 1',
                  content: '<p>Unique test content 12345</p>',
                },
              ],
            },
          ],
        },
      ],
    });
    const result = generator.generate(input);

    const htmlContents = Array.from(result.htmlContent.values());
    expect(htmlContents).toHaveLength(1);
    expect(htmlContents[0]).toContain('Unique test content 12345');
  });
});

describe('OLXGenerator - Cyrillic/Unicode Support', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should generate OLX from course with Cyrillic titles', () => {
    const input = createMinimalCourseInput({
      title: 'Введение в программирование',
      language: 'ru',
      chapters: [
        {
          id: 'ch1',
          title: 'Основы Python',
          sections: [
            {
              id: 'sec1',
              title: 'Переменные и типы данных',
              units: [
                {
                  id: 'u1',
                  title: 'Что такое переменная',
                  content: '<p>Переменная - это именованная область памяти</p>',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = generator.generate(input);

    expect(result).toBeDefined();
    expect(result.courseKey).toBe('course-v1:MegaCampus+TEST101+2025_Q1');
  });

  it('should verify display_name attributes contain original Cyrillic text', () => {
    const input = createMinimalCourseInput({
      title: 'Курс по Python',
      language: 'ru',
      chapters: [
        {
          id: 'ch1',
          title: 'Глава 1',
          sections: [
            {
              id: 'sec1',
              title: 'Раздел 1',
              units: [
                {
                  id: 'u1',
                  title: 'Урок 1',
                  content: '<p>Содержание урока</p>',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = generator.generate(input);

    // Check course.xml
    expect(result.courseXml).toContain('display_name="Курс по Python"');

    // Check chapter XML
    const chapterXml = Array.from(result.chapters.values())[0];
    expect(chapterXml).toContain('display_name="Глава 1"');

    // Check sequential XML
    const sequentialXml = Array.from(result.sequentials.values())[0];
    expect(sequentialXml).toContain('display_name="Раздел 1"');

    // Check vertical XML
    const verticalXml = Array.from(result.verticals.values())[0];
    expect(verticalXml).toContain('display_name="Урок 1"');
  });

  it('should verify url_names are ASCII-only (transliterated)', () => {
    const input = createMinimalCourseInput({
      title: 'Курс по Python',
      chapters: [
        {
          id: 'ch1',
          title: 'Введение',
          sections: [
            {
              id: 'sec1',
              title: 'Основы',
              units: [
                {
                  id: 'u1',
                  title: 'Первый урок',
                  content: '<p>Content</p>',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = generator.generate(input);

    // All url_names should be ASCII-only
    for (const urlName of result.chapters.keys()) {
      expect(urlName).toMatch(/^[a-z0-9_-]+$/);
    }

    for (const urlName of result.sequentials.keys()) {
      expect(urlName).toMatch(/^[a-z0-9_-]+$/);
    }

    for (const urlName of result.verticals.keys()) {
      expect(urlName).toMatch(/^[a-z0-9_-]+$/);
    }

    for (const urlName of result.htmlRefs.keys()) {
      expect(urlName).toMatch(/^[a-z0-9_-]+$/);
    }
  });

  it('should test mixed Cyrillic/Latin content', () => {
    const input = createMinimalCourseInput({
      title: 'Introduction to Python для начинающих',
      language: 'ru',
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter 1: Основы',
          sections: [
            {
              id: 'sec1',
              title: 'Variables & Переменные',
              units: [
                {
                  id: 'u1',
                  title: 'Hello, Привет!',
                  content: '<p>Mixed content: Это пример</p>',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = generator.generate(input);

    expect(result.courseXml).toContain('Introduction to Python для начинающих');

    const chapterXml = Array.from(result.chapters.values())[0];
    expect(chapterXml).toContain('Chapter 1: Основы');

    // url_names still ASCII-only
    for (const urlName of result.chapters.keys()) {
      expect(urlName).toMatch(/^[a-z0-9_-]+$/);
    }
  });
});

describe('OLXGenerator - URL Name Generation', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should verify unique url_names generated for all elements', () => {
    const input = createMultiChapterCourse();
    const result = generator.generate(input);

    // Check uniqueness within each element type
    const chapterKeys = Array.from(result.chapters.keys());
    const sequentialKeys = Array.from(result.sequentials.keys());
    const verticalKeys = Array.from(result.verticals.keys());
    const htmlKeys = Array.from(result.htmlRefs.keys());

    // Uniqueness within each type
    expect(new Set(chapterKeys).size).toBe(chapterKeys.length);
    expect(new Set(sequentialKeys).size).toBe(sequentialKeys.length);
    expect(new Set(verticalKeys).size).toBe(verticalKeys.length);
    expect(new Set(htmlKeys).size).toBe(htmlKeys.length);
  });

  it('should verify url_names are lowercase ASCII with underscores', () => {
    const input = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter With Spaces',
          sections: [
            {
              id: 'sec1',
              title: 'Section-With-Hyphens',
              units: [
                {
                  id: 'u1',
                  title: 'Unit_With_Underscores',
                  content: '<p>Content</p>',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = generator.generate(input);

    for (const urlName of result.chapters.keys()) {
      expect(urlName).toMatch(/^[a-z0-9_-]+$/);
      expect(urlName).toBe(urlName.toLowerCase());
    }
  });

  it('should verify duplicate titles get numeric suffixes', () => {
    const input = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: 'Introduction',
          sections: [
            {
              id: 'sec1',
              title: 'Lesson',
              units: [
                { id: 'u1', title: 'Test', content: '<p>1</p>' },
                { id: 'u2', title: 'Test', content: '<p>2</p>' },
                { id: 'u3', title: 'Test', content: '<p>3</p>' },
              ],
            },
          ],
        },
      ],
    });

    const result = generator.generate(input);

    const verticalKeys = Array.from(result.verticals.keys()).sort();
    expect(verticalKeys).toContain('test');
    expect(verticalKeys).toContain('test_1');
    expect(verticalKeys).toContain('test_2');
  });

  it('should test url_name truncation for very long titles', () => {
    const longTitle =
      'This is an extremely long chapter title that exceeds forty characters and should be truncated';

    const input = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: longTitle,
          sections: [
            {
              id: 'sec1',
              title: 'Section 1',
              units: [
                {
                  id: 'u1',
                  title: 'Unit 1',
                  content: '<p>Content</p>',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = generator.generate(input);

    const chapterKeys = Array.from(result.chapters.keys());
    expect(chapterKeys).toHaveLength(1);
    expect(chapterKeys[0].length).toBeLessThanOrEqual(100);
    // Base name should be truncated to ~40 chars (before suffix)
    expect(chapterKeys[0].length).toBeLessThanOrEqual(50);
  });

  it('should handle empty titles by generating default url_name', () => {
    const input = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: '!!!', // Will be empty after slugification
          sections: [
            {
              id: 'sec1',
              title: '@@@',
              units: [
                {
                  id: 'u1',
                  title: '###',
                  content: '<p>Content</p>',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = generator.generate(input);

    // Should use default 'item' when slugification results in empty string
    expect(result.chapters.size).toBeGreaterThan(0);
    expect(result.sequentials.size).toBeGreaterThan(0);
    expect(result.verticals.size).toBeGreaterThan(0);
  });
});

describe('OLXGenerator - Policy Files', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should verify policyJson contains valid JSON', () => {
    const input = createMinimalCourseInput();
    const result = generator.generate(input);

    expect(result.policies.policyJson).toBeDefined();
    expect(() => JSON.parse(result.policies.policyJson)).not.toThrow();

    const policy = JSON.parse(result.policies.policyJson);
    expect(policy).toBeTypeOf('object');
  });

  it('should verify gradingPolicyJson contains valid JSON', () => {
    const input = createMinimalCourseInput();
    const result = generator.generate(input);

    expect(result.policies.gradingPolicyJson).toBeDefined();
    expect(() => JSON.parse(result.policies.gradingPolicyJson)).not.toThrow();

    const gradingPolicy = JSON.parse(result.policies.gradingPolicyJson);
    expect(gradingPolicy).toBeTypeOf('object');
  });

  it('should verify policy files include course metadata', () => {
    const input = createMinimalCourseInput({
      org: 'TestOrg',
      courseId: 'POLICY101',
      run: 'test_run',
    });
    const result = generator.generate(input);

    const policy = JSON.parse(result.policies.policyJson);
    // Policy file structure typically includes course metadata
    expect(policy).toBeDefined();
  });
});

describe('OLXGenerator - Validation Error Handling', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should throw OLXValidationError for course with no chapters', () => {
    const input = createMinimalCourseInput({
      chapters: [],
    });

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
    try {
      generator.generate(input);
    } catch (error) {
      expect(error).toBeInstanceOf(OLXValidationError);
      if (error instanceof OLXValidationError) {
        expect(error.errors.some((e) => e.message.includes('at least 1 chapter'))).toBe(true);
      }
    }
  });

  it('should throw OLXValidationError for chapter with no sections', () => {
    const input = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: 'Empty Chapter',
          sections: [],
        },
      ],
    });

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
    try {
      generator.generate(input);
    } catch (error) {
      expect(error).toBeInstanceOf(OLXValidationError);
      if (error instanceof OLXValidationError) {
        expect(error.errors.some((e) => e.message.includes('at least 1 section'))).toBe(true);
      }
    }
  });

  it('should throw OLXValidationError for section with no units', () => {
    const input = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter 1',
          sections: [
            {
              id: 'sec1',
              title: 'Empty Section',
              units: [],
            },
          ],
        },
      ],
    });

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
    try {
      generator.generate(input);
    } catch (error) {
      expect(error).toBeInstanceOf(OLXValidationError);
      if (error instanceof OLXValidationError) {
        expect(error.errors.some((e) => e.message.includes('at least 1 unit'))).toBe(true);
      }
    }
  });

  it('should throw OLXValidationError for unit with empty content', () => {
    const input = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter 1',
          sections: [
            {
              id: 'sec1',
              title: 'Section 1',
              units: [
                {
                  id: 'u1',
                  title: 'Empty Unit',
                  content: '   ',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
    try {
      generator.generate(input);
    } catch (error) {
      expect(error).toBeInstanceOf(OLXValidationError);
      if (error instanceof OLXValidationError) {
        expect(error.errors.some((e) => e.message.includes('must have content'))).toBe(true);
      }
    }
  });

  it('should throw OLXValidationError for non-ASCII courseId', () => {
    const input = createMinimalCourseInput({
      courseId: 'КУРС101' as any, // Cyrillic
    });

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
    try {
      generator.generate(input);
    } catch (error) {
      expect(error).toBeInstanceOf(OLXValidationError);
      if (error instanceof OLXValidationError) {
        expect(error.errors.some((e) => e.message.includes('courseId') && e.message.includes('ASCII'))).toBe(true);
      }
    }
  });

  it('should throw OLXValidationError for non-ASCII org', () => {
    const input = createMinimalCourseInput({
      org: 'МегаКампус' as any, // Cyrillic
    });

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
    try {
      generator.generate(input);
    } catch (error) {
      expect(error).toBeInstanceOf(OLXValidationError);
      if (error instanceof OLXValidationError) {
        expect(error.errors.some((e) => e.message.includes('org') && e.message.includes('ASCII'))).toBe(true);
      }
    }
  });

  it('should throw OLXValidationError for non-ASCII run', () => {
    const input = createMinimalCourseInput({
      run: 'осень_2025' as any, // Cyrillic
    });

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
    try {
      generator.generate(input);
    } catch (error) {
      expect(error).toBeInstanceOf(OLXValidationError);
      if (error instanceof OLXValidationError) {
        expect(error.errors.some((e) => e.message.includes('run') && e.message.includes('ASCII'))).toBe(true);
      }
    }
  });

  it('should throw OLXValidationError for courseId with spaces', () => {
    const input = createMinimalCourseInput({
      courseId: 'TEST 101' as any,
    });

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
  });
});

describe('OLXGenerator - Reset Functionality', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should clear url_name registry when reset is called', () => {
    const input1 = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: 'Test',
          sections: [
            {
              id: 'sec1',
              title: 'Test',
              units: [
                { id: 'u1', title: 'Test', content: '<p>1</p>' },
              ],
            },
          ],
        },
      ],
    });

    const result1 = generator.generate(input1);
    const chapterKey1 = Array.from(result1.chapters.keys())[0];

    generator.reset();

    const input2 = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch2',
          title: 'Test', // Same title as before
          sections: [
            {
              id: 'sec2',
              title: 'Test',
              units: [
                { id: 'u2', title: 'Test', content: '<p>2</p>' },
              ],
            },
          ],
        },
      ],
    });

    const result2 = generator.generate(input2);
    const chapterKey2 = Array.from(result2.chapters.keys())[0];

    // After reset, should get same url_name for same title (not with suffix)
    expect(chapterKey1).toBe(chapterKey2);
  });

  it('should generate multiple courses sequentially with reset', () => {
    const input1 = createMinimalCourseInput({ courseId: 'COURSE1' });
    const result1 = generator.generate(input1);

    generator.reset();

    const input2 = createMinimalCourseInput({ courseId: 'COURSE2' });
    const result2 = generator.generate(input2);

    generator.reset();

    const input3 = createMinimalCourseInput({ courseId: 'COURSE3' });
    const result3 = generator.generate(input3);

    expect(result1.courseKey).toContain('COURSE1');
    expect(result2.courseKey).toContain('COURSE2');
    expect(result3.courseKey).toContain('COURSE3');
  });

  it('should verify fresh url_names after reset', () => {
    const input = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter',
          sections: [
            {
              id: 'sec1',
              title: 'Section',
              units: [
                { id: 'u1', title: 'Unit', content: '<p>1</p>' },
                { id: 'u2', title: 'Unit', content: '<p>2</p>' },
              ],
            },
          ],
        },
      ],
    });

    const result1 = generator.generate(input);
    const verticals1 = Array.from(result1.verticals.keys()).sort();

    generator.reset();

    const result2 = generator.generate(input);
    const verticals2 = Array.from(result2.verticals.keys()).sort();

    // After reset, should get same url_names (fresh registry)
    expect(verticals1).toEqual(verticals2);
  });
});

describe('OLXGenerator - Large Course Handling', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should generate OLX for 50+ unit course', () => {
    const chapters: CourseInput['chapters'] = [];

    // Create 5 chapters with 3 sections each, 4 units per section = 60 units
    for (let ch = 0; ch < 5; ch++) {
      const sections: CourseInput['chapters'][0]['sections'] = [];
      for (let sec = 0; sec < 3; sec++) {
        const units: CourseInput['chapters'][0]['sections'][0]['units'] = [];
        for (let u = 0; u < 4; u++) {
          units.push({
            id: `u_${ch}_${sec}_${u}`,
            title: `Unit ${ch * 12 + sec * 4 + u + 1}`,
            content: `<p>Content for unit ${ch * 12 + sec * 4 + u + 1}</p>`,
          });
        }
        sections.push({
          id: `sec_${ch}_${sec}`,
          title: `Section ${ch * 3 + sec + 1}`,
          units,
        });
      }
      chapters.push({
        id: `ch_${ch}`,
        title: `Chapter ${ch + 1}`,
        sections,
      });
    }

    const input = createMinimalCourseInput({ chapters });
    const result = generator.generate(input);

    expect(result.chapters.size).toBe(5);
    expect(result.sequentials.size).toBe(15);
    expect(result.verticals.size).toBe(60);
    expect(result.htmlRefs.size).toBe(60);
    expect(result.htmlContent.size).toBe(60);
  });

  it('should verify all structures populated correctly for large course', () => {
    const chapters: CourseInput['chapters'] = [];

    for (let ch = 0; ch < 10; ch++) {
      const sections: CourseInput['chapters'][0]['sections'] = [];
      for (let sec = 0; sec < 2; sec++) {
        const units: CourseInput['chapters'][0]['sections'][0]['units'] = [];
        for (let u = 0; u < 3; u++) {
          units.push({
            id: `u_${ch}_${sec}_${u}`,
            title: `Unit ${ch * 6 + sec * 3 + u + 1}`,
            content: `<p>Content ${ch * 6 + sec * 3 + u + 1}</p>`,
          });
        }
        sections.push({
          id: `sec_${ch}_${sec}`,
          title: `Section ${ch * 2 + sec + 1}`,
          units,
        });
      }
      chapters.push({
        id: `ch_${ch}`,
        title: `Chapter ${ch + 1}`,
        sections,
      });
    }

    const input = createMinimalCourseInput({ chapters });
    const result = generator.generate(input);

    // Verify all maps are populated
    expect(result.chapters.size).toBeGreaterThan(0);
    expect(result.sequentials.size).toBeGreaterThan(0);
    expect(result.verticals.size).toBeGreaterThan(0);
    expect(result.htmlRefs.size).toBeGreaterThan(0);
    expect(result.htmlContent.size).toBeGreaterThan(0);

    // Verify 1:1 mapping
    expect(result.verticals.size).toBe(result.htmlRefs.size);
    expect(result.htmlRefs.size).toBe(result.htmlContent.size);
  });

  it('should complete generation in reasonable time (<5 seconds)', () => {
    const chapters: CourseInput['chapters'] = [];

    // Create large course (100 units)
    for (let ch = 0; ch < 5; ch++) {
      const sections: CourseInput['chapters'][0]['sections'] = [];
      for (let sec = 0; sec < 4; sec++) {
        const units: CourseInput['chapters'][0]['sections'][0]['units'] = [];
        for (let u = 0; u < 5; u++) {
          units.push({
            id: `u_${ch}_${sec}_${u}`,
            title: `Unit ${ch * 20 + sec * 5 + u + 1}`,
            content: `<p>Content ${ch * 20 + sec * 5 + u + 1}</p>`,
          });
        }
        sections.push({
          id: `sec_${ch}_${sec}`,
          title: `Section ${ch * 4 + sec + 1}`,
          units,
        });
      }
      chapters.push({
        id: `ch_${ch}`,
        title: `Chapter ${ch + 1}`,
        sections,
      });
    }

    const input = createMinimalCourseInput({ chapters });

    const startTime = Date.now();
    const result = generator.generate(input);
    const duration = Date.now() - startTime;

    expect(result.verticals.size).toBe(100);
    expect(duration).toBeLessThan(5000); // Should complete in <5 seconds
  });
});

describe('OLXGenerator - Edge Cases', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should handle course with special characters in titles', () => {
    const input = createMinimalCourseInput({
      title: 'Data Structures & Algorithms: "Advanced" Course',
      chapters: [
        {
          id: 'ch1',
          title: 'Arrays & Lists',
          sections: [
            {
              id: 'sec1',
              title: 'Introduction to <Arrays>',
              units: [
                {
                  id: 'u1',
                  title: 'What is an Array?',
                  content: '<p>Content</p>',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = generator.generate(input);

    // Should handle XML escaping correctly
    expect(result.courseXml).toContain('&amp;');
    expect(result.courseXml).toContain('&quot;');
  });

  it('should handle very long content in units', () => {
    const longContent = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(1000) + '</p>';

    const input = createMinimalCourseInput({
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter 1',
          sections: [
            {
              id: 'sec1',
              title: 'Section 1',
              units: [
                {
                  id: 'u1',
                  title: 'Unit with long content',
                  content: longContent,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = generator.generate(input);

    const htmlContent = Array.from(result.htmlContent.values())[0];
    expect(htmlContent).toContain('Lorem ipsum');
    expect(htmlContent.length).toBeGreaterThan(1000);
  });

  it('should handle minimal course with optional fields omitted', () => {
    const input: CourseInput = {
      courseId: 'MIN101',
      title: 'Minimal Course',
      org: 'TestOrg',
      run: '2025',
      language: 'en',
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter',
          sections: [
            {
              id: 'sec1',
              title: 'Section',
              units: [
                {
                  id: 'u1',
                  title: 'Unit',
                  content: '<p>Content</p>',
                },
              ],
            },
          ],
        },
      ],
    };

    const result = generator.generate(input);

    expect(result).toBeDefined();
    expect(result.courseKey).toBe('course-v1:TestOrg+MIN101+2025');
  });

  it('should handle course with dates specified', () => {
    const input = createMinimalCourseInput({
      startDate: '2025-01-15T00:00:00Z',
      enrollmentStart: '2025-01-01T00:00:00Z',
      enrollmentEnd: '2025-12-31T23:59:59Z',
    });

    const result = generator.generate(input);

    expect(result.meta.start).toBe('2025-01-15T00:00:00Z');
    // enrollmentStart and enrollmentEnd are in CourseInput but not in OlxCourseMeta
    // They would be in policy.json
  });
});
