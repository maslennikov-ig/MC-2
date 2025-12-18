/**
 * Full LMS Pipeline Integration Tests
 * Test ID: T045
 * @module tests/integration/lms-full-pipeline
 *
 * Comprehensive integration tests for the complete LMS publishing pipeline:
 * CourseInput (JSON) → OLXGenerator → OLXStructure → packageOLX → tar.gz Buffer
 *
 * Tests cover:
 * - Full pipeline flow (JSON → OLX → tar.gz)
 * - Cyrillic/Unicode content preservation
 * - Large course handling (50+ units)
 * - Content integrity verification
 * - Archive structure validation
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OLXGenerator } from '@/integrations/lms/openedx/olx/generator';
import { packageOLX, getOLXFileList } from '@/integrations/lms/openedx/olx/packager';
import { OLXValidationError } from '@megacampus/shared-types/lms';
import type { CourseInput } from '@megacampus/shared-types/lms';
import type { OLXStructure } from '@/integrations/lms/openedx/olx/types';
import * as zlib from 'zlib';

// Mock the logger to avoid console output during tests
vi.mock('@/integrations/lms/logger', () => ({
  lmsLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ============================================================================
// Helper Functions for Test Data Creation
// ============================================================================

/**
 * Create minimal valid CourseInput for basic tests
 */
function createMinimalCourseInput(): CourseInput {
  return {
    courseId: 'TEST101',
    title: 'Test Course',
    description: 'A minimal test course',
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
                content: '<p>Test content for unit 1</p>',
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Create CourseInput with Cyrillic titles and content
 */
function createCyrillicCourseInput(): CourseInput {
  return {
    courseId: 'AI101',
    title: 'Введение в искусственный интеллект',
    description: 'Курс по основам ИИ и машинного обучения',
    org: 'MegaCampus',
    run: 'self_paced',
    language: 'ru',
    startDate: '2025-01-15T00:00:00Z',
    chapters: [
      {
        id: 'ch1',
        title: 'Основы машинного обучения',
        sections: [
          {
            id: 'sec1',
            title: 'Введение в ML',
            units: [
              {
                id: 'u1',
                title: 'Что такое машинное обучение',
                content: '<p>Машинное обучение - это раздел искусственного интеллекта.</p>',
              },
              {
                id: 'u2',
                title: 'Типы задач ML',
                content: '<p>Существуют различные типы задач: классификация, регрессия, кластеризация.</p>',
              },
            ],
          },
          {
            id: 'sec2',
            title: 'Алгоритмы обучения',
            units: [
              {
                id: 'u3',
                title: 'Supervised Learning',
                content: '<p>Обучение с учителем использует размеченные данные.</p>',
              },
              {
                id: 'u4',
                title: 'Unsupervised Learning',
                content: '<p>Обучение без учителя работает с неразмеченными данными.</p>',
              },
            ],
          },
        ],
      },
      {
        id: 'ch2',
        title: 'Нейронные сети',
        sections: [
          {
            id: 'sec3',
            title: 'Архитектуры нейронных сетей',
            units: [
              {
                id: 'u5',
                title: 'Перцептрон',
                content: '<p>Перцептрон - простейшая модель нейронной сети.</p>',
              },
              {
                id: 'u6',
                title: 'Многослойные сети',
                content: '<p>Глубокие нейронные сети содержат множество слоёв.</p>',
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Create large CourseInput with 50+ units
 */
function createLargeCourseInput(): CourseInput {
  const chapters: CourseInput['chapters'] = [];

  // Create 5 chapters with 2 sections each, 5 units per section = 50 units
  for (let ch = 0; ch < 5; ch++) {
    const sections: CourseInput['chapters'][0]['sections'] = [];

    for (let sec = 0; sec < 2; sec++) {
      const units: CourseInput['chapters'][0]['sections'][0]['units'] = [];

      for (let u = 0; u < 5; u++) {
        const unitNum = ch * 10 + sec * 5 + u + 1;
        units.push({
          id: `unit_${ch}_${sec}_${u}`,
          title: `Unit ${unitNum}`,
          content: `<p>This is the content for unit ${unitNum}. It contains educational material.</p>`,
        });
      }

      sections.push({
        id: `section_${ch}_${sec}`,
        title: `Section ${ch * 2 + sec + 1}`,
        units,
      });
    }

    chapters.push({
      id: `chapter_${ch}`,
      title: `Chapter ${ch + 1}`,
      sections,
    });
  }

  return {
    courseId: 'LARGE101',
    title: 'Large Test Course',
    description: 'A course with many units for testing scalability',
    org: 'MegaCampus',
    run: '2025_Q1',
    language: 'en',
    chapters,
  };
}

/**
 * Create realistic MegaCampus-like course with complex structure
 */
function createRealisticCourseInput(): CourseInput {
  return {
    courseId: 'WEB201',
    title: 'Web Development Bootcamp',
    description: 'Complete web development course covering frontend and backend',
    org: 'MegaCampus',
    run: 'self_paced',
    language: 'en',
    startDate: '2025-02-01T00:00:00Z',
    enrollmentStart: '2025-01-15T00:00:00Z',
    enrollmentEnd: '2025-12-31T23:59:59Z',
    chapters: [
      {
        id: 'ch1',
        title: 'HTML & CSS Fundamentals',
        sections: [
          {
            id: 'sec1',
            title: 'HTML Basics',
            units: [
              {
                id: 'u1',
                title: 'Introduction to HTML',
                content: '<p>HTML (HyperText Markup Language) is the standard markup language for web pages.</p>',
              },
              {
                id: 'u2',
                title: 'HTML Elements and Tags',
                content: '<p>HTML elements are the building blocks of web pages. Tags define the structure.</p>',
              },
              {
                id: 'u3',
                title: 'Forms and Input Elements',
                content: '<p>HTML forms allow users to enter data that is sent to a server for processing.</p>',
              },
            ],
          },
          {
            id: 'sec2',
            title: 'CSS Styling',
            units: [
              {
                id: 'u4',
                title: 'CSS Selectors',
                content: '<p>CSS selectors are used to target HTML elements for styling.</p>',
              },
              {
                id: 'u5',
                title: 'Box Model',
                content: '<p>The CSS box model describes the rectangular boxes around elements.</p>',
              },
            ],
          },
        ],
      },
      {
        id: 'ch2',
        title: 'JavaScript Programming',
        sections: [
          {
            id: 'sec3',
            title: 'JavaScript Basics',
            units: [
              {
                id: 'u6',
                title: 'Variables and Data Types',
                content: '<p>JavaScript uses var, let, and const to declare variables.</p>',
              },
              {
                id: 'u7',
                title: 'Functions',
                content: '<p>Functions are reusable blocks of code that perform specific tasks.</p>',
              },
            ],
          },
        ],
      },
    ],
  };
}

// ============================================================================
// Helper Functions for Archive Extraction and Verification
// ============================================================================

/**
 * Extract tar.gz buffer and return map of file paths to contents
 *
 * Uses tar.list() to extract file names, then uses a simpler approach
 * to read the decompressed tar data.
 */
async function extractTarGz(buffer: Buffer): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  // Decompress gzip
  const decompressed = zlib.gunzipSync(buffer);

  // Parse tar manually (simple approach for small archives)
  let offset = 0;
  while (offset < decompressed.length) {
    // Read 512-byte header block
    const header = decompressed.slice(offset, offset + 512);

    // Check for end of archive (two consecutive zero blocks)
    if (header.every((byte) => byte === 0)) {
      break;
    }

    // Extract filename (first 100 bytes, null-terminated)
    const nameEnd = header.indexOf(0, 0);
    const name = header.slice(0, nameEnd > 0 && nameEnd <= 100 ? nameEnd : 100).toString('utf-8');

    // Extract file size (octal, bytes 124-135)
    const sizeStr = header.slice(124, 136).toString('utf-8').trim();
    const size = parseInt(sizeStr, 8) || 0;

    // Extract file type (byte 156)
    const typeFlag = header[156];

    // Move past header
    offset += 512;

    if (size > 0 && (typeFlag === 0 || typeFlag === 48)) {
      // Regular file (type 0 or '0')
      // Extract content
      const content = decompressed.slice(offset, offset + size).toString('utf-8');
      files.set(name, content);

      // Move past content (padded to 512-byte blocks)
      offset += Math.ceil(size / 512) * 512;
    } else if (typeFlag === 53) {
      // Directory (type 5 or '5'), skip
      offset += Math.ceil(size / 512) * 512;
    } else {
      // Other types, skip
      offset += Math.ceil(size / 512) * 512;
    }
  }

  return files;
}

/**
 * Verify tar.gz archive structure matches OLX specification
 */
function verifyArchiveStructure(files: Map<string, string>, expectedRun: string): void {
  // Verify required files exist
  expect(files.has('course/course.xml')).toBe(true);
  expect(files.has(`course/policies/${expectedRun}/policy.json`)).toBe(true);
  expect(files.has(`course/policies/${expectedRun}/grading_policy.json`)).toBe(true);

  // Verify directory structure
  const filePaths = Array.from(files.keys());

  // Check chapter files
  const chapterFiles = filePaths.filter((path) => path.startsWith('course/chapter/'));
  expect(chapterFiles.length).toBeGreaterThan(0);
  chapterFiles.forEach((path) => {
    expect(path).toMatch(/^course\/chapter\/[a-z0-9_-]+\.xml$/);
  });

  // Check sequential files
  const sequentialFiles = filePaths.filter((path) => path.startsWith('course/sequential/'));
  expect(sequentialFiles.length).toBeGreaterThan(0);
  sequentialFiles.forEach((path) => {
    expect(path).toMatch(/^course\/sequential\/[a-z0-9_-]+\.xml$/);
  });

  // Check vertical files
  const verticalFiles = filePaths.filter((path) => path.startsWith('course/vertical/'));
  expect(verticalFiles.length).toBeGreaterThan(0);
  verticalFiles.forEach((path) => {
    expect(path).toMatch(/^course\/vertical\/[a-z0-9_-]+\.xml$/);
  });

  // Check HTML files
  const htmlXmlFiles = filePaths.filter((path) => path.match(/^course\/html\/.*\.xml$/));
  const htmlContentFiles = filePaths.filter((path) => path.match(/^course\/html\/.*\.html$/));
  expect(htmlXmlFiles.length).toBeGreaterThan(0);
  expect(htmlContentFiles.length).toBeGreaterThan(0);
  expect(htmlXmlFiles.length).toBe(htmlContentFiles.length);
}

// ============================================================================
// Test Suite: Full Pipeline - Basic Flow
// ============================================================================

describe('Full Pipeline - Basic Flow', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should complete full pipeline from CourseInput to tar.gz', async () => {
    const input = createMinimalCourseInput();

    // Step 1: Generate OLX structure
    const olxStructure = generator.generate(input);
    expect(olxStructure).toBeDefined();
    expect(olxStructure.courseKey).toBe('course-v1:MegaCampus+TEST101+2025_Q1');

    // Step 2: Package to tar.gz
    const result = await packageOLX(olxStructure);
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.size).toBeGreaterThan(0);
    expect(result.fileCount).toBeGreaterThan(0);
  });

  it('should produce valid gzip-compressed tar archive', async () => {
    const input = createMinimalCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    // Verify gzip magic bytes (1f 8b)
    expect(result.buffer[0]).toBe(0x1f);
    expect(result.buffer[1]).toBe(0x8b);

    // Verify buffer can be decompressed without error
    expect(() => zlib.gunzipSync(result.buffer)).not.toThrow();
  });

  it('should verify tar.gz contains expected files', async () => {
    const input = createMinimalCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    // Verify required files
    expect(files.has('course/course.xml')).toBe(true);
    expect(files.has('course/policies/2025_Q1/policy.json')).toBe(true);
    expect(files.has('course/policies/2025_Q1/grading_policy.json')).toBe(true);

    // Verify chapter/sequential/vertical/html files exist
    const filePaths = Array.from(files.keys());
    expect(filePaths.some((p) => p.startsWith('course/chapter/'))).toBe(true);
    expect(filePaths.some((p) => p.startsWith('course/sequential/'))).toBe(true);
    expect(filePaths.some((p) => p.startsWith('course/vertical/'))).toBe(true);
    expect(filePaths.some((p) => p.match(/^course\/html\/.*\.html$/))).toBe(true);
  });

  it('should verify course.xml contains correct metadata', async () => {
    const input = createMinimalCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);
    const courseXml = files.get('course/course.xml')!;

    expect(courseXml).toContain('<course');
    expect(courseXml).toContain('org="MegaCampus"');
    expect(courseXml).toContain('course="TEST101"');
    expect(courseXml).toContain('display_name="Test Course"');
    expect(courseXml).toContain('language="en"');
  });

  it('should verify chapter structure matches input', async () => {
    const input = createMinimalCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    // Find chapter file
    const chapterFiles = Array.from(files.keys()).filter((p) => p.startsWith('course/chapter/'));
    expect(chapterFiles.length).toBe(1);

    const chapterXml = files.get(chapterFiles[0])!;
    expect(chapterXml).toContain('display_name="Chapter 1"');
    expect(chapterXml).toContain('<sequential');
  });

  it('should verify HTML content matches input units', async () => {
    const input = createMinimalCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    // Find HTML content files
    const htmlFiles = Array.from(files.keys()).filter((p) => p.match(/^course\/html\/.*\.html$/));
    expect(htmlFiles.length).toBe(1);

    const htmlContent = files.get(htmlFiles[0])!;
    expect(htmlContent).toContain('Test content for unit 1');
  });
});

// ============================================================================
// Test Suite: Full Pipeline - Cyrillic Course
// ============================================================================

describe('Full Pipeline - Cyrillic Course', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should process Cyrillic course through full pipeline', async () => {
    const input = createCyrillicCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.size).toBeGreaterThan(0);
  });

  it('should preserve Cyrillic in display_name attributes', async () => {
    const input = createCyrillicCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);
    const courseXml = files.get('course/course.xml')!;

    // Verify Cyrillic course title
    expect(courseXml).toContain('Введение в искусственный интеллект');

    // Check chapter files for Cyrillic display names
    const chapterFiles = Array.from(files.keys()).filter((p) => p.startsWith('course/chapter/'));
    const firstChapterXml = files.get(chapterFiles[0])!;
    expect(firstChapterXml).toContain('Основы машинного обучения');
  });

  it('should ensure url_names are ASCII (transliterated)', async () => {
    const input = createCyrillicCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);
    const filePaths = Array.from(files.keys());

    // All file names should be ASCII-only
    const contentFiles = filePaths.filter(
      (p) =>
        p.startsWith('course/chapter/') ||
        p.startsWith('course/sequential/') ||
        p.startsWith('course/vertical/') ||
        p.startsWith('course/html/')
    );

    contentFiles.forEach((path) => {
      // Extract filename from path
      const filename = path.split('/').pop()!;
      const nameWithoutExt = filename.replace(/\.(xml|html)$/, '');

      // Should be ASCII lowercase with underscores/hyphens only
      expect(nameWithoutExt).toMatch(/^[a-z0-9_-]+$/);
    });
  });

  it('should preserve Cyrillic in HTML content', async () => {
    const input = createCyrillicCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    // Find HTML content files
    const htmlFiles = Array.from(files.keys()).filter((p) => p.match(/^course\/html\/.*\.html$/));

    // Check that Cyrillic content is preserved
    let foundCyrillicContent = false;
    htmlFiles.forEach((path) => {
      const content = files.get(path)!;
      if (content.includes('Машинное обучение') || content.includes('искусственного интеллекта')) {
        foundCyrillicContent = true;
      }
    });

    expect(foundCyrillicContent).toBe(true);
  });

  it('should verify UTF-8 encoding in tar.gz', async () => {
    const input = createCyrillicCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    // Extract and verify UTF-8 encoding
    const files = await extractTarGz(result.buffer);

    const courseXml = files.get('course/course.xml')!;
    const cyrillicText = 'Введение в искусственный интеллект';

    // Verify Cyrillic is correctly encoded
    expect(courseXml).toContain(cyrillicText);

    // Verify buffer length matches UTF-8 encoding (Cyrillic takes more bytes)
    const utf8Bytes = Buffer.from(cyrillicText, 'utf-8');
    expect(utf8Bytes.length).toBeGreaterThan(cyrillicText.length); // Cyrillic uses multi-byte chars
  });
});

// ============================================================================
// Test Suite: Full Pipeline - Large Course
// ============================================================================

describe('Full Pipeline - Large Course', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should process large course (50+ units) through pipeline', async () => {
    const input = createLargeCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.size).toBeGreaterThan(0);
    expect(olxStructure.verticals.size).toBe(50);
  });

  it('should verify all 50+ units present in tar.gz', async () => {
    const input = createLargeCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    // Count HTML content files (one per unit)
    const htmlContentFiles = Array.from(files.keys()).filter((p) =>
      p.match(/^course\/html\/.*\.html$/)
    );
    expect(htmlContentFiles.length).toBe(50);

    // Count vertical files (one per unit)
    const verticalFiles = Array.from(files.keys()).filter((p) => p.startsWith('course/vertical/'));
    expect(verticalFiles.length).toBe(50);
  });

  it('should complete large course in reasonable time (<5 seconds)', async () => {
    const input = createLargeCourseInput();

    const startTime = Date.now();

    // Full pipeline
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const duration = Date.now() - startTime;

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(duration).toBeLessThan(5000); // Should complete in <5 seconds
  });

  it('should verify file count matches expected structure', async () => {
    const input = createLargeCourseInput();
    const olxStructure = generator.generate(input);

    // Get expected file list
    const expectedFiles = getOLXFileList(olxStructure);

    // Package and extract
    const result = await packageOLX(olxStructure);
    const files = await extractTarGz(result.buffer);

    // Verify file count
    expect(files.size).toBe(expectedFiles.length);
    expect(result.fileCount).toBe(expectedFiles.length);
  });

  it('should verify archive size is reasonable for large course', async () => {
    const input = createLargeCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    // Archive should be compressed (smaller than uncompressed)
    const decompressed = zlib.gunzipSync(result.buffer);
    expect(result.buffer.length).toBeLessThan(decompressed.length);

    // Archive should be reasonable size (less than 10MB for 50 units)
    expect(result.buffer.length).toBeLessThan(10 * 1024 * 1024);
  });
});

// ============================================================================
// Test Suite: Full Pipeline - Content Integrity
// ============================================================================

describe('Full Pipeline - Content Integrity', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should preserve exact content through pipeline', async () => {
    const uniqueContent = '<p>Unique test content with identifier: ABC-12345-XYZ</p>';
    const input = createMinimalCourseInput();
    input.chapters[0].sections[0].units[0].content = uniqueContent;

    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);
    const files = await extractTarGz(result.buffer);

    // Find HTML content
    const htmlFiles = Array.from(files.keys()).filter((p) => p.match(/^course\/html\/.*\.html$/));
    const htmlContent = files.get(htmlFiles[0])!;

    expect(htmlContent).toContain(uniqueContent);
  });

  it('should handle special characters in content', async () => {
    const specialContent = '<p>Special: &lt;tag&gt; &amp; "quotes" &#39;apostrophe&#39;</p>';
    const input = createMinimalCourseInput();
    input.chapters[0].sections[0].units[0].content = specialContent;

    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);
    const files = await extractTarGz(result.buffer);

    const htmlFiles = Array.from(files.keys()).filter((p) => p.match(/^course\/html\/.*\.html$/));
    const htmlContent = files.get(htmlFiles[0])!;

    // Verify content is preserved
    expect(htmlContent).toContain(specialContent);
  });

  it('should handle very long content without truncation', async () => {
    const longContent = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(1000) + '</p>';
    const input = createMinimalCourseInput();
    input.chapters[0].sections[0].units[0].content = longContent;

    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);
    const files = await extractTarGz(result.buffer);

    const htmlFiles = Array.from(files.keys()).filter((p) => p.match(/^course\/html\/.*\.html$/));
    const htmlContent = files.get(htmlFiles[0])!;

    // Verify full content length
    expect(htmlContent.length).toBeGreaterThan(longContent.length * 0.9); // Allow some overhead
    expect(htmlContent).toContain('Lorem ipsum');
  });

  it('should verify no content corruption in archive', async () => {
    const input = createLargeCourseInput();

    // Add unique identifiers to each unit
    input.chapters.forEach((chapter, chIdx) => {
      chapter.sections.forEach((section, secIdx) => {
        section.units.forEach((unit, uIdx) => {
          unit.content = `<p>Chapter ${chIdx + 1}, Section ${secIdx + 1}, Unit ${uIdx + 1}: UNIQUE-${chIdx}-${secIdx}-${uIdx}</p>`;
        });
      });
    });

    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);
    const files = await extractTarGz(result.buffer);

    // Verify all unique identifiers are present
    const htmlFiles = Array.from(files.keys()).filter((p) => p.match(/^course\/html\/.*\.html$/));
    expect(htmlFiles.length).toBe(50);

    // Check each unit has correct identifier
    const allContent = htmlFiles.map((path) => files.get(path)!).join('\n');

    for (let ch = 0; ch < 5; ch++) {
      for (let sec = 0; sec < 2; sec++) {
        for (let u = 0; u < 5; u++) {
          expect(allContent).toContain(`UNIQUE-${ch}-${sec}-${u}`);
        }
      }
    }
  });
});

// ============================================================================
// Test Suite: Full Pipeline - Realistic Course
// ============================================================================

describe('Full Pipeline - Realistic Course', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should process realistic MegaCampus-like course', async () => {
    const input = createRealisticCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.size).toBeGreaterThan(0);
  });

  it('should verify complete structure in tar.gz', async () => {
    const input = createRealisticCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    // Verify structure
    verifyArchiveStructure(files, 'self_paced');

    // Verify expected counts
    expect(input.chapters.length).toBe(2);

    const chapterFiles = Array.from(files.keys()).filter((p) => p.startsWith('course/chapter/'));
    expect(chapterFiles.length).toBe(2);
  });

  it('should verify policy files contain correct metadata', async () => {
    const input = createRealisticCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    // Verify policy.json
    const policyJson = files.get('course/policies/self_paced/policy.json')!;
    expect(() => JSON.parse(policyJson)).not.toThrow();

    const policy = JSON.parse(policyJson);
    expect(policy).toBeDefined();
    expect(policy).toBeTypeOf('object');

    // Verify grading_policy.json
    const gradingPolicyJson = files.get('course/policies/self_paced/grading_policy.json')!;
    expect(() => JSON.parse(gradingPolicyJson)).not.toThrow();

    const gradingPolicy = JSON.parse(gradingPolicyJson);
    expect(gradingPolicy).toBeDefined();
  });

  it('should verify dates in course metadata', async () => {
    const input = createRealisticCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);
    const courseXml = files.get('course/course.xml')!;

    // Verify start date is in courseXml
    expect(courseXml).toContain('2025-02-01T00:00:00Z');
  });

  it('should verify nested section structure', async () => {
    const input = createRealisticCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    // Find sequential files
    const sequentialFiles = Array.from(files.keys()).filter((p) =>
      p.startsWith('course/sequential/')
    );

    // Check each sequential references verticals
    sequentialFiles.forEach((path) => {
      const sequentialXml = files.get(path)!;
      expect(sequentialXml).toContain('<sequential');
      expect(sequentialXml).toContain('<vertical');
    });
  });
});

// ============================================================================
// Test Suite: Archive Verification
// ============================================================================

describe('Archive Verification', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should verify tar.gz can be decompressed with standard tools', async () => {
    const input = createMinimalCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    // Test decompression with zlib (standard Node.js library)
    let decompressed: Buffer;
    expect(() => {
      decompressed = zlib.gunzipSync(result.buffer);
    }).not.toThrow();

    // Verify decompressed is valid tar
    expect(decompressed!.length).toBeGreaterThan(result.buffer.length);
  });

  it('should verify directory structure matches OLX spec', async () => {
    const input = createCyrillicCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    verifyArchiveStructure(files, 'self_paced');
  });

  it('should verify all expected directories exist', async () => {
    const input = createRealisticCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);
    const filePaths = Array.from(files.keys());

    // Check required directories (by checking for files in them)
    const directories = [
      'course/chapter/',
      'course/sequential/',
      'course/vertical/',
      'course/html/',
      'course/policies/self_paced/',
    ];

    directories.forEach((dir) => {
      expect(filePaths.some((p) => p.startsWith(dir))).toBe(true);
    });
  });

  it('should verify file paths use forward slashes', async () => {
    const input = createMinimalCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);
    const filePaths = Array.from(files.keys());

    // All paths should use forward slashes (not backslashes)
    filePaths.forEach((path) => {
      expect(path).not.toContain('\\');
      expect(path).toContain('/');
    });
  });

  it('should verify all XML files are well-formed', async () => {
    const input = createMinimalCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    // Check all XML files
    const xmlFiles = Array.from(files.keys()).filter((p) => p.endsWith('.xml'));

    xmlFiles.forEach((path) => {
      const content = files.get(path)!;

      // Basic well-formedness checks: must have some XML tags
      const hasOpeningTag = /<[a-z_]+.*>/i.test(content);
      const hasClosingTag = /<\/[a-z_]+>/i.test(content);
      const hasSelfClosing = /<[a-z_]+[^>]*\/>/i.test(content);

      // Each XML file must have either closing tags or self-closing tags
      expect(hasOpeningTag || hasSelfClosing).toBe(true);
      expect(hasClosingTag || hasSelfClosing).toBe(true);

      // Should not have unclosed tags (basic check)
      const openTags = (content.match(/<[a-z_]+[^/>]*>/gi) || []).length;
      const closeTags = (content.match(/<\/[a-z_]+>/gi) || []).length;
      const selfClosingTags = (content.match(/<[a-z_]+[^/>]*\/>/gi) || []).length;

      // Open tags should roughly equal close tags + self-closing tags
      // (This is a rough check, not full XML validation)
      expect(openTags).toBeLessThanOrEqual(closeTags + selfClosingTags + 5);
    });
  });

  it('should verify JSON files are valid', async () => {
    const input = createRealisticCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    // Check policy.json
    const policyJson = files.get('course/policies/self_paced/policy.json')!;
    expect(() => JSON.parse(policyJson)).not.toThrow();

    // Check grading_policy.json
    const gradingPolicyJson = files.get('course/policies/self_paced/grading_policy.json')!;
    expect(() => JSON.parse(gradingPolicyJson)).not.toThrow();
  });

  it('should verify HTML files contain valid content', async () => {
    const input = createMinimalCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const files = await extractTarGz(result.buffer);

    const htmlFiles = Array.from(files.keys()).filter((p) => p.match(/^course\/html\/.*\.html$/));

    htmlFiles.forEach((path) => {
      const content = files.get(path)!;

      // Should contain HTML content
      expect(content.length).toBeGreaterThan(0);

      // Should have HTML-like structure
      expect(content).toMatch(/<[a-z]+/i); // Has some tags
    });
  });
});

// ============================================================================
// Test Suite: Error Scenarios
// ============================================================================

describe('Error Scenarios', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should throw OLXValidationError for course with no chapters', async () => {
    const input = createMinimalCourseInput();
    input.chapters = [];

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
  });

  it('should throw OLXValidationError for chapter with no sections', async () => {
    const input = createMinimalCourseInput();
    input.chapters[0].sections = [];

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
  });

  it('should throw OLXValidationError for section with no units', async () => {
    const input = createMinimalCourseInput();
    input.chapters[0].sections[0].units = [];

    expect(() => generator.generate(input)).toThrow(OLXValidationError);
  });

  it('should provide descriptive error message for validation failures', async () => {
    const input = createMinimalCourseInput();
    input.chapters = [];

    try {
      generator.generate(input);
      expect.fail('Should have thrown OLXValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(OLXValidationError);
      if (error instanceof OLXValidationError) {
        expect(error.message).toContain('validation');
        expect(error.errors.length).toBeGreaterThan(0);
        expect(error.errors[0].message).toContain('chapter');
      }
    }
  });
});

// ============================================================================
// Test Suite: Performance and Edge Cases
// ============================================================================

describe('Performance and Edge Cases', () => {
  let generator: OLXGenerator;

  beforeEach(() => {
    generator = new OLXGenerator();
  });

  it('should handle multiple sequential pipeline runs', async () => {
    const input1 = createMinimalCourseInput();
    const input2 = createCyrillicCourseInput();
    const input3 = createRealisticCourseInput();

    // Run 1
    const olx1 = generator.generate(input1);
    const result1 = await packageOLX(olx1);
    expect(result1.buffer).toBeInstanceOf(Buffer);

    generator.reset();

    // Run 2
    const olx2 = generator.generate(input2);
    const result2 = await packageOLX(olx2);
    expect(result2.buffer).toBeInstanceOf(Buffer);

    generator.reset();

    // Run 3
    const olx3 = generator.generate(input3);
    const result3 = await packageOLX(olx3);
    expect(result3.buffer).toBeInstanceOf(Buffer);

    // Verify each archive is different
    expect(result1.buffer.equals(result2.buffer)).toBe(false);
    expect(result2.buffer.equals(result3.buffer)).toBe(false);
  });

  it('should handle course with mixed content types', async () => {
    const input = createMinimalCourseInput();
    input.chapters[0].sections[0].units = [
      {
        id: 'u1',
        title: 'Plain HTML',
        content: '<p>Simple paragraph</p>',
      },
      {
        id: 'u2',
        title: 'Complex HTML',
        content: '<div><h2>Title</h2><ul><li>Item 1</li><li>Item 2</li></ul></div>',
      },
      {
        id: 'u3',
        title: 'HTML with attributes',
        content: '<p class="highlight" data-id="123">Content with attributes</p>',
      },
    ];

    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);
    const files = await extractTarGz(result.buffer);

    // Verify all content types are preserved
    const htmlFiles = Array.from(files.keys()).filter((p) => p.match(/^course\/html\/.*\.html$/));
    expect(htmlFiles.length).toBe(3);

    const allContent = htmlFiles.map((path) => files.get(path)!).join('\n');
    expect(allContent).toContain('Simple paragraph');
    expect(allContent).toContain('<ul>');
    expect(allContent).toContain('class="highlight"');
  });

  it('should verify compression ratio is effective', async () => {
    const input = createLargeCourseInput();
    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    const decompressed = zlib.gunzipSync(result.buffer);
    const compressionRatio = result.buffer.length / decompressed.length;

    // Compression ratio should be less than 0.5 (at least 50% compression)
    expect(compressionRatio).toBeLessThan(0.5);
  });

  it('should handle empty description gracefully', async () => {
    const input = createMinimalCourseInput();
    delete input.description;

    const olxStructure = generator.generate(input);
    const result = await packageOLX(olxStructure);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.size).toBeGreaterThan(0);
  });

  it('should verify file count accuracy', async () => {
    const input = createRealisticCourseInput();
    const olxStructure = generator.generate(input);

    // Get expected file list
    const expectedFiles = getOLXFileList(olxStructure);

    // Package
    const result = await packageOLX(olxStructure);

    // Verify reported file count matches actual
    expect(result.fileCount).toBe(expectedFiles.length);

    // Extract and verify
    const files = await extractTarGz(result.buffer);
    expect(files.size).toBe(expectedFiles.length);
  });
});
