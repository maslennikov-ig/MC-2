/**
 * Unit Tests for OLX Package Size Validation
 * Test ID: T113-T114
 *
 * Tests size validation functions for preventing oversized course packages.
 *
 * Expected Public Interface:
 * - validatePackageSize(structure: OLXStructure): void
 * - calculatePackageSize(structure: OLXStructure): number
 * - formatBytes(bytes: number): string
 * - MAX_PACKAGE_SIZE_BYTES: number
 * - MAX_PACKAGE_SIZE_MB: number
 *
 * Test Categories:
 * 1. formatBytes Function
 * 2. calculatePackageSize Function
 * 3. validatePackageSize Function - Valid Cases
 * 4. validatePackageSize Function - Invalid Cases
 * 5. Integration with packageOLX
 * 6. Error Message Quality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validatePackageSize,
  calculatePackageSize,
  formatBytes,
  packageOLX,
  MAX_PACKAGE_SIZE_BYTES,
  MAX_PACKAGE_SIZE_MB,
} from '@/integrations/lms/openedx/olx/packager';
import type { OLXStructure, CourseKey } from '@/integrations/lms/openedx/olx/types';
import type { OlxCourseMeta } from '@megacampus/shared-types/lms/olx-types';
import { OLXValidationError } from '@megacampus/shared-types/lms/errors';

// Mock lmsLogger to avoid console output
vi.mock('@/integrations/lms/openedx/logger', () => ({
  lmsLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * Helper: Create minimal OLX structure for testing
 */
function createMinimalOLXStructure(): OLXStructure {
  const meta: OlxCourseMeta = {
    org: 'TestOrg',
    course: 'TEST101',
    run: '2025_Q1',
    display_name: 'Test Course',
    language: 'en',
  };

  const courseKey: CourseKey = 'course-v1:TestOrg+TEST101+2025_Q1';

  const courseXml = `<course url_name="TestOrg_TEST101_2025_Q1" org="TestOrg" course="TEST101">
  <chapter url_name="chapter_1" />
</course>
`;

  const chapters = new Map<string, string>([
    ['chapter_1', '<chapter url_name="chapter_1">\n  <sequential url_name="seq_1" />\n</chapter>\n'],
  ]);

  const sequentials = new Map<string, string>([
    ['seq_1', '<sequential url_name="seq_1">\n  <vertical url_name="vert_1" />\n</sequential>\n'],
  ]);

  const verticals = new Map<string, string>([
    ['vert_1', '<vertical url_name="vert_1">\n  <html url_name="html_1" />\n</vertical>\n'],
  ]);

  const htmlRefs = new Map<string, string>([
    ['html_1', '<html url_name="html_1" display_name="HTML Component 1" />\n'],
  ]);

  const htmlContent = new Map<string, string>([['html_1', '<html><![CDATA[<p>Hello</p>]]></html>\n']]);

  const policyJson = JSON.stringify({ 'course/TestOrg_TEST101_2025_Q1': { start: '2025-01-01T00:00:00Z' } }, null, 2);

  const gradingPolicyJson = JSON.stringify({ GRADER: [], GRADE_CUTOFFS: {} }, null, 2);

  return {
    courseXml,
    courseKey,
    chapters,
    sequentials,
    verticals,
    htmlRefs,
    htmlContent,
    policies: {
      policyJson,
      gradingPolicyJson,
    },
    meta,
  };
}

/**
 * Helper: Create large OLX structure with specified total size
 *
 * Creates a structure by duplicating HTML content until target size is reached.
 */
function createLargeOLXStructure(targetSizeBytes: number): OLXStructure {
  const structure = createMinimalOLXStructure();

  // Create large HTML content to reach target size
  // Each HTML component adds ~1KB, so we calculate how many we need
  const largeContent = '<html><![CDATA[<p>' + 'X'.repeat(1000) + '</p>]]></html>\n';
  const contentSize = Buffer.byteLength(largeContent, 'utf-8');

  // Calculate current size
  const currentSize = calculatePackageSize(structure);

  // Calculate how many additional HTML components we need
  const additionalSize = targetSizeBytes - currentSize;
  const additionalComponents = Math.ceil(additionalSize / contentSize);

  // Add HTML components to reach target size
  for (let i = 2; i <= additionalComponents + 1; i++) {
    const urlName = `html_${i}`;
    structure.htmlRefs.set(urlName, `<html url_name="${urlName}" />\n`);
    structure.htmlContent.set(urlName, largeContent);

    // Add to first vertical
    const firstVert = structure.verticals.get('vert_1')!;
    const updatedVert = firstVert.replace('</vertical>', `  <html url_name="${urlName}" />\n</vertical>`);
    structure.verticals.set('vert_1', updatedVert);
  }

  return structure;
}

describe('formatBytes', () => {
  it('should format bytes to MB with one decimal', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB'); // 1 MB
  });

  it('should format 100 MB correctly', () => {
    expect(formatBytes(100 * 1024 * 1024)).toBe('100.0 MB');
  });

  it('should format 125.3 MB correctly', () => {
    expect(formatBytes(125 * 1024 * 1024 + 314572)).toBe('125.3 MB');
  });

  it('should format small sizes correctly', () => {
    expect(formatBytes(512 * 1024)).toBe('0.5 MB'); // 512 KB
  });

  it('should format large sizes correctly', () => {
    expect(formatBytes(500 * 1024 * 1024)).toBe('500.0 MB');
  });

  it('should round to one decimal place', () => {
    expect(formatBytes(1536000)).toBe('1.5 MB'); // ~1.46 MB
  });

  it('should handle zero bytes', () => {
    expect(formatBytes(0)).toBe('0.0 MB');
  });
});

describe('calculatePackageSize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate size for minimal structure', () => {
    const structure = createMinimalOLXStructure();

    const size = calculatePackageSize(structure);

    expect(size).toBeGreaterThan(0);
    expect(typeof size).toBe('number');
  });

  it('should include course.xml in calculation', () => {
    const structure = createMinimalOLXStructure();

    const courseXmlSize = Buffer.byteLength(structure.courseXml, 'utf-8');
    const totalSize = calculatePackageSize(structure);

    expect(totalSize).toBeGreaterThanOrEqual(courseXmlSize);
  });

  it('should include all chapter content', () => {
    const structure = createMinimalOLXStructure();

    const sizeWithChapter = calculatePackageSize(structure);

    // Remove chapters and recalculate
    structure.chapters = new Map();
    const sizeWithoutChapter = calculatePackageSize(structure);

    expect(sizeWithChapter).toBeGreaterThan(sizeWithoutChapter);
  });

  it('should include all sequential content', () => {
    const structure = createMinimalOLXStructure();

    const sizeWithSequentials = calculatePackageSize(structure);

    // Remove sequentials and recalculate
    structure.sequentials = new Map();
    const sizeWithoutSequentials = calculatePackageSize(structure);

    expect(sizeWithSequentials).toBeGreaterThan(sizeWithoutSequentials);
  });

  it('should include all vertical content', () => {
    const structure = createMinimalOLXStructure();

    const sizeWithVerticals = calculatePackageSize(structure);

    // Remove verticals and recalculate
    structure.verticals = new Map();
    const sizeWithoutVerticals = calculatePackageSize(structure);

    expect(sizeWithVerticals).toBeGreaterThan(sizeWithoutVerticals);
  });

  it('should include all HTML reference files', () => {
    const structure = createMinimalOLXStructure();

    const sizeWithRefs = calculatePackageSize(structure);

    // Remove HTML refs and recalculate
    structure.htmlRefs = new Map();
    const sizeWithoutRefs = calculatePackageSize(structure);

    expect(sizeWithRefs).toBeGreaterThan(sizeWithoutRefs);
  });

  it('should include all HTML content files', () => {
    const structure = createMinimalOLXStructure();

    const sizeWithContent = calculatePackageSize(structure);

    // Remove HTML content and recalculate
    structure.htmlContent = new Map();
    const sizeWithoutContent = calculatePackageSize(structure);

    expect(sizeWithContent).toBeGreaterThan(sizeWithoutContent);
  });

  it('should include policy files', () => {
    const structure = createMinimalOLXStructure();

    const sizeWithPolicies = calculatePackageSize(structure);

    // Remove policy content (replace with empty strings)
    structure.policies.policyJson = '';
    structure.policies.gradingPolicyJson = '';
    const sizeWithoutPolicies = calculatePackageSize(structure);

    expect(sizeWithPolicies).toBeGreaterThan(sizeWithoutPolicies);
  });

  it('should handle UTF-8 content correctly', () => {
    const structure = createMinimalOLXStructure();

    // Add UTF-8 content (Cyrillic)
    structure.htmlContent.set('html_1', '<html><![CDATA[<p>Привет мир</p>]]></html>\n');

    const size = calculatePackageSize(structure);

    // Cyrillic characters take more bytes than ASCII
    expect(size).toBeGreaterThan(0);
  });

  it('should return consistent results for same structure', () => {
    const structure = createMinimalOLXStructure();

    const size1 = calculatePackageSize(structure);
    const size2 = calculatePackageSize(structure);

    expect(size1).toBe(size2);
  });

  it('should scale linearly with content size', () => {
    const structure = createMinimalOLXStructure();

    const size1 = calculatePackageSize(structure);

    // Add more HTML content
    structure.htmlContent.set('html_2', '<html><![CDATA[<p>More content</p>]]></html>\n');
    structure.htmlRefs.set('html_2', '<html url_name="html_2" />\n');

    const size2 = calculatePackageSize(structure);

    expect(size2).toBeGreaterThan(size1);
  });
});

describe('validatePackageSize - Valid Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass validation for minimal structure', () => {
    const structure = createMinimalOLXStructure();

    expect(() => validatePackageSize(structure)).not.toThrow();
  });

  it('should pass validation for structure at 50% of limit', () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 0.5);

    expect(() => validatePackageSize(structure)).not.toThrow();
  });

  it('should pass validation for structure at 90% of limit', () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 0.9);

    expect(() => validatePackageSize(structure)).not.toThrow();
  });

  it('should pass validation for structure exactly at limit', () => {
    // Edge case: exactly at limit should pass
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES);

    expect(() => validatePackageSize(structure)).not.toThrow();
  });

  it('should pass validation for empty optional fields', () => {
    const structure = createMinimalOLXStructure();

    // Clear optional collections
    structure.chapters = new Map();
    structure.sequentials = new Map();
    structure.verticals = new Map();
    structure.htmlRefs = new Map();
    structure.htmlContent = new Map();

    expect(() => validatePackageSize(structure)).not.toThrow();
  });
});

describe('validatePackageSize - Invalid Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw OLXValidationError when size exceeds limit', () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES + 1);

    expect(() => validatePackageSize(structure)).toThrow(OLXValidationError);
  });

  it('should throw with size information in error message', () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 1.2);

    try {
      validatePackageSize(structure);
      expect.fail('Should have thrown OLXValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(OLXValidationError);
      expect((error as Error).message).toContain('MB');
      expect((error as Error).message).toContain('100');
    }
  });

  it('should throw when significantly over limit (150 MB)', () => {
    const structure = createLargeOLXStructure(150 * 1024 * 1024);

    expect(() => validatePackageSize(structure)).toThrow(OLXValidationError);
  });

  it('should throw when slightly over limit (101 MB)', () => {
    const structure = createLargeOLXStructure(101 * 1024 * 1024);

    expect(() => validatePackageSize(structure)).toThrow(OLXValidationError);
  });

  it('should include structured errors in OLXValidationError', () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 1.5);

    try {
      validatePackageSize(structure);
      expect.fail('Should have thrown OLXValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(OLXValidationError);
      const validationError = error as OLXValidationError;
      expect(validationError.errors).toBeDefined();
      expect(validationError.errors.length).toBeGreaterThan(0);
      expect(validationError.errors[0]).toHaveProperty('path', 'package');
      expect(validationError.errors[0]).toHaveProperty('severity', 'error');
    }
  });
});

describe('validatePackageSize - Error Message Quality', () => {
  it('should include current package size in error message', () => {
    const structure = createLargeOLXStructure(125 * 1024 * 1024);

    try {
      validatePackageSize(structure);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toMatch(/125\.\d+ MB/);
    }
  });

  it('should include maximum allowed size in error message', () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 1.2);

    try {
      validatePackageSize(structure);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('100.0 MB');
    }
  });

  it('should include actionable suggestions to reduce size', () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 1.5);

    try {
      validatePackageSize(structure);
      expect.fail('Should have thrown');
    } catch (error) {
      const message = (error as Error).message;

      // Check for key suggestions
      expect(message).toContain('media files');
      expect(message).toContain('external video hosting');
      expect(message).toContain('multiple smaller courses');
    }
  });

  it('should suggest removing large media files', () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 1.2);

    try {
      validatePackageSize(structure);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as Error).message.toLowerCase()).toContain('media');
    }
  });

  it('should suggest using external video hosting', () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 1.2);

    try {
      validatePackageSize(structure);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as Error).message.toLowerCase()).toContain('video');
    }
  });

  it('should suggest splitting into multiple courses', () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 1.2);

    try {
      validatePackageSize(structure);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as Error).message.toLowerCase()).toContain('split');
    }
  });
});

describe('Integration with packageOLX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow packaging when size is valid', async () => {
    const structure = createMinimalOLXStructure();

    const result = await packageOLX(structure);

    expect(result).toBeDefined();
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('should prevent packaging when size exceeds limit', async () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 1.2);

    await expect(packageOLX(structure)).rejects.toThrow(OLXValidationError);
  });

  it('should throw before creating archive (fail fast)', async () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 1.5);

    const startTime = Date.now();
    try {
      await packageOLX(structure);
      expect.fail('Should have thrown');
    } catch (error) {
      const elapsed = Date.now() - startTime;

      // Should fail quickly (within 100ms) since validation happens before archiving
      expect(elapsed).toBeLessThan(100);
      expect(error).toBeInstanceOf(OLXValidationError);
    }
  });

  it('should validate at the start of packageOLX', async () => {
    const structure = createLargeOLXStructure(MAX_PACKAGE_SIZE_BYTES * 1.3);

    try {
      await packageOLX(structure);
      expect.fail('Should have thrown');
    } catch (error) {
      // Validation should happen before any archiving logs
      expect(error).toBeInstanceOf(OLXValidationError);
    }
  });
});

describe('Constants', () => {
  it('should export MAX_PACKAGE_SIZE_BYTES constant', () => {
    expect(MAX_PACKAGE_SIZE_BYTES).toBe(100 * 1024 * 1024);
  });

  it('should export MAX_PACKAGE_SIZE_MB constant', () => {
    expect(MAX_PACKAGE_SIZE_MB).toBe(100);
  });

  it('should have consistent constants', () => {
    expect(MAX_PACKAGE_SIZE_BYTES).toBe(MAX_PACKAGE_SIZE_MB * 1024 * 1024);
  });
});
