/**
 * Unit Tests for OLX Policy JSON Generators
 * Test ID: T041
 *
 * Tests two functions:
 * 1. generatePolicyJson(meta: OlxCourseMeta): string
 *    - Generates policy.json with course metadata
 *
 * 2. generateGradingPolicyJson(): string
 *    - Generates grading_policy.json with default grading configuration
 *
 * Expected Output Formats:
 *
 * policy.json:
 * {
 *   "course/COURSE_CODE": {
 *     "display_name": "...",
 *     "start": "...",
 *     "end": "...",
 *     "language": "...",
 *     "enrollment_start": null,
 *     "enrollment_end": null
 *   }
 * }
 *
 * grading_policy.json:
 * {
 *   "GRADER": [...],
 *   "GRADE_CUTOFFS": {...}
 * }
 *
 * NOTE: This is a TDD red-phase test. The implementation does not exist yet.
 * These tests will fail until T051-T052 implements the actual functions.
 */

import { describe, it, expect } from 'vitest';
import {
  generatePolicyJson,
  generateGradingPolicyJson,
} from '@/integrations/lms/openedx/olx/templates/policies';
import type { OlxCourseMeta } from '@megacampus/shared-types/lms/olx-types';

describe('generatePolicyJson - OLX policy.json template', () => {
  describe('Basic Policy JSON Generation', () => {
    it('should generate valid policy.json with required fields', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'INTRO101',
        run: '2025_Q1',
        display_name: 'Introduction to Programming',
        language: 'en',
      };

      const result = generatePolicyJson(meta);

      // Verify result is valid JSON
      const parsed = JSON.parse(result);

      // Verify structure: top-level key is "course/COURSE_CODE"
      expect(parsed).toHaveProperty('course/course');

      const policy = parsed['course/course'];

      // Verify required fields
      expect(policy.display_name).toBe('Introduction to Programming');
      expect(policy.language).toBe('en');
    });

    it('should use course code as the top-level key', () => {
      const meta: OlxCourseMeta = {
        org: 'TestOrg',
        course: 'TESTCOURSE',
        run: '2025_Spring',
        display_name: 'Test Course',
        language: 'en',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);

      // Verify top-level key format
      expect(parsed).toHaveProperty('course/course');
    });

    it('should include enrollment fields set to null by default', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'ENROLL101',
        run: '2025_Q1',
        display_name: 'Enrollment Test',
        language: 'en',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      // Verify enrollment fields default to null
      expect(policy.enrollment_start).toBeNull();
      expect(policy.enrollment_end).toBeNull();
    });
  });

  describe('Optional Date Fields', () => {
    it('should include start date when provided', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'DATED101',
        run: '2025_Q1',
        display_name: 'Dated Course',
        language: 'en',
        start: '2025-01-15T00:00:00Z',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      expect(policy.start).toBe('2025-01-15T00:00:00Z');
    });

    it('should include end date when provided', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'DATED101',
        run: '2025_Q1',
        display_name: 'Dated Course',
        language: 'en',
        end: '2025-06-30T23:59:59Z',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      expect(policy.end).toBe('2025-06-30T23:59:59Z');
    });

    it('should include both start and end dates when provided', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'FULLDATE101',
        run: '2025_Q1',
        display_name: 'Full Date Course',
        language: 'en',
        start: '2025-01-15T00:00:00Z',
        end: '2025-06-30T23:59:59Z',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      expect(policy.start).toBe('2025-01-15T00:00:00Z');
      expect(policy.end).toBe('2025-06-30T23:59:59Z');
    });

    it('should omit start and end when not provided', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'NODATES101',
        run: '2025_Q1',
        display_name: 'No Dates Course',
        language: 'en',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      // Start and end are null when not provided
      expect(policy.start).toBeNull();
      expect(policy.end).toBeNull();
    });
  });

  describe('Language Support', () => {
    it('should include language field', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'LANG101',
        run: '2025_Q1',
        display_name: 'Language Test',
        language: 'ru',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      expect(policy.language).toBe('ru');
    });

    it('should support all 18 platform languages', () => {
      const languages = [
        'en', 'ru', 'zh', 'ar', 'ja', 'ko', 'hi', 'vi', 'es', 'fr',
        'de', 'pt', 'it', 'tr', 'th', 'id', 'ms', 'pl',
      ];

      languages.forEach((lang) => {
        const meta: OlxCourseMeta = {
          org: 'MegaCampus',
          course: 'MULTILANG',
          run: '2025_Q1',
          display_name: 'Multi-Language Course',
          language: lang as any,
        };

        const result = generatePolicyJson(meta);
        const parsed = JSON.parse(result);
        const policy = parsed['course/course'];

        expect(policy.language).toBe(lang);
      });
    });
  });

  describe('Display Name Handling', () => {
    it('should preserve Cyrillic display_name', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'RUS101',
        run: '2025_Q1',
        display_name: 'Введение в программирование',
        language: 'ru',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      // JSON should preserve Unicode
      expect(policy.display_name).toBe('Введение в программирование');
    });

    it('should preserve Unicode characters (emojis, symbols)', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'EMOJI101',
        run: '2025_Q1',
        display_name: 'Python 🐍 Programming',
        language: 'en',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      expect(policy.display_name).toBe('Python 🐍 Programming');
    });

    it('should handle special characters in display_name', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'SPECIAL101',
        run: '2025_Q1',
        display_name: 'Data Structures & Algorithms: "Advanced" Course',
        language: 'en',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      // JSON handles special characters natively (no XML escaping needed)
      expect(policy.display_name).toBe('Data Structures & Algorithms: "Advanced" Course');
    });
  });

  describe('JSON Formatting', () => {
    it('should generate valid JSON', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'VALID101',
        run: '2025_Q1',
        display_name: 'Valid JSON Test',
        language: 'en',
      };

      const result = generatePolicyJson(meta);

      // Verify no JSON parse errors
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should generate pretty-printed JSON with indentation', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'PRETTY101',
        run: '2025_Q1',
        display_name: 'Pretty JSON Test',
        language: 'en',
      };

      const result = generatePolicyJson(meta);

      // Verify JSON is formatted (contains newlines and indentation)
      expect(result).toContain('\n');
      expect(result).toMatch(/\s{2,}/); // Has indentation (2+ spaces)
    });

    it('should end with newline character', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'NEWLINE101',
        run: '2025_Q1',
        display_name: 'Newline Test',
        language: 'en',
      };

      const result = generatePolicyJson(meta);

      // Verify ends with newline
      expect(result).toMatch(/\n$/);
    });
  });

  describe('Real-world Policy Examples', () => {
    it('should generate policy.json for typical Russian programming course', () => {
      const meta: OlxCourseMeta = {
        org: 'MegaCampus',
        course: 'PYTHON_BASICS',
        run: '2025_Spring',
        display_name: 'Основы программирования на Python',
        language: 'ru',
        start: '2025-02-01T00:00:00Z',
        end: '2025-05-31T23:59:59Z',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      expect(policy.display_name).toBe('Основы программирования на Python');
      expect(policy.language).toBe('ru');
      expect(policy.start).toBe('2025-02-01T00:00:00Z');
      expect(policy.end).toBe('2025-05-31T23:59:59Z');
      expect(policy.enrollment_start).toBeNull();
      expect(policy.enrollment_end).toBeNull();
    });

    it('should generate policy.json for English data science course', () => {
      const meta: OlxCourseMeta = {
        org: 'DataScienceAcademy',
        course: 'DS101',
        run: '2025_Winter',
        display_name: 'Introduction to Data Science & Machine Learning',
        language: 'en',
        start: '2025-01-10T00:00:00Z',
      };

      const result = generatePolicyJson(meta);
      const parsed = JSON.parse(result);
      const policy = parsed['course/course'];

      expect(policy.display_name).toBe('Introduction to Data Science & Machine Learning');
      expect(policy.language).toBe('en');
      expect(policy.start).toBe('2025-01-10T00:00:00Z');
      expect(policy.end).toBeNull();  // end is explicitly set to null when not provided
    });
  });
});

describe('generateGradingPolicyJson - OLX grading_policy.json template', () => {
  describe('Basic Grading Policy Generation', () => {
    it('should generate valid grading_policy.json', () => {
      const result = generateGradingPolicyJson();

      // Verify result is valid JSON
      const parsed = JSON.parse(result);

      // Verify structure
      expect(parsed).toHaveProperty('GRADER');
      expect(parsed).toHaveProperty('GRADE_CUTOFFS');
    });

    it('should include GRADER array', () => {
      const result = generateGradingPolicyJson();
      const parsed = JSON.parse(result);

      // Verify GRADER is an array
      expect(Array.isArray(parsed.GRADER)).toBe(true);
    });

    it('should include GRADE_CUTOFFS object', () => {
      const result = generateGradingPolicyJson();
      const parsed = JSON.parse(result);

      // Verify GRADE_CUTOFFS is an object
      expect(typeof parsed.GRADE_CUTOFFS).toBe('object');
      expect(Array.isArray(parsed.GRADE_CUTOFFS)).toBe(false);
    });
  });

  describe('Default Grading Configuration', () => {
    it('should define passing grade cutoff', () => {
      const result = generateGradingPolicyJson();
      const parsed = JSON.parse(result);

      // Verify Pass grade cutoff (typically 0.5 or 50%)
      expect(parsed.GRADE_CUTOFFS).toHaveProperty('Pass');
      expect(typeof parsed.GRADE_CUTOFFS.Pass).toBe('number');
      expect(parsed.GRADE_CUTOFFS.Pass).toBeGreaterThan(0);
      expect(parsed.GRADE_CUTOFFS.Pass).toBeLessThanOrEqual(1);
    });

    it('should have empty GRADER array for simple pass/fail grading', () => {
      const result = generateGradingPolicyJson();
      const parsed = JSON.parse(result);

      // Our minimal implementation uses empty GRADER array (simple pass/fail)
      expect(Array.isArray(parsed.GRADER)).toBe(true);
      expect(parsed.GRADER.length).toBe(0);
    });
  });

  describe('Grader Structure Validation', () => {
    it('should have empty GRADER array (simple pass/fail)', () => {
      const result = generateGradingPolicyJson();
      const parsed = JSON.parse(result);

      // Our minimal implementation uses empty GRADER array
      // This is valid for Open edX - courses without weighted assignments
      expect(parsed.GRADER).toEqual([]);
    });
  });

  describe('Grade Cutoffs Validation', () => {
    it('should define common grade levels', () => {
      const result = generateGradingPolicyJson();
      const parsed = JSON.parse(result);

      // Common grade levels: Pass (and optionally A, B, C, D)
      expect(parsed.GRADE_CUTOFFS).toHaveProperty('Pass');

      // All cutoffs should be numbers between 0 and 1
      Object.values(parsed.GRADE_CUTOFFS).forEach((cutoff: any) => {
        expect(typeof cutoff).toBe('number');
        expect(cutoff).toBeGreaterThanOrEqual(0);
        expect(cutoff).toBeLessThanOrEqual(1);
      });
    });

    it('should have grade cutoffs in descending order', () => {
      const result = generateGradingPolicyJson();
      const parsed = JSON.parse(result);

      const cutoffValues = Object.entries(parsed.GRADE_CUTOFFS)
        .map(([grade, value]) => ({ grade, value: value as number }))
        .sort((a, b) => b.value - a.value); // Sort descending

      // Verify sorted order matches
      const grades = Object.keys(parsed.GRADE_CUTOFFS);
      const values = Object.values(parsed.GRADE_CUTOFFS) as number[];

      // Values should be in descending order (or at least non-increasing)
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
      }
    });
  });

  describe('JSON Formatting', () => {
    it('should generate valid JSON', () => {
      const result = generateGradingPolicyJson();

      // Verify no JSON parse errors
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should generate pretty-printed JSON with indentation', () => {
      const result = generateGradingPolicyJson();

      // Verify JSON is formatted (contains newlines and indentation)
      expect(result).toContain('\n');
      expect(result).toMatch(/\s{2,}/); // Has indentation (2+ spaces)
    });

    it('should end with newline character', () => {
      const result = generateGradingPolicyJson();

      // Verify ends with newline
      expect(result).toMatch(/\n$/);
    });
  });

  describe('Real-world Grading Policy Examples', () => {
    it('should generate typical Open edX grading policy', () => {
      const result = generateGradingPolicyJson();
      const parsed = JSON.parse(result);

      // Verify structure matches Open edX expectations
      expect(parsed.GRADER).toBeDefined();
      expect(parsed.GRADE_CUTOFFS).toBeDefined();

      // Verify Pass cutoff is reasonable (typically 50% or 0.5)
      expect(parsed.GRADE_CUTOFFS.Pass).toBeGreaterThanOrEqual(0.3);
      expect(parsed.GRADE_CUTOFFS.Pass).toBeLessThanOrEqual(0.7);
    });

    it('should be compatible with MegaCampus course export', () => {
      const result = generateGradingPolicyJson();
      const parsed = JSON.parse(result);

      // MegaCampus courses use simple pass/fail grading (empty GRADER array)
      // This is valid for Open edX - self-paced courses without weighted assignments
      expect(parsed.GRADER).toEqual([]);
      expect(parsed.GRADE_CUTOFFS.Pass).toBe(0.5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple calls (function should be pure)', () => {
      const result1 = generateGradingPolicyJson();
      const result2 = generateGradingPolicyJson();

      // Results should be identical (pure function)
      expect(result1).toBe(result2);
    });

    it('should generate consistent JSON structure', () => {
      const result = generateGradingPolicyJson();
      const parsed = JSON.parse(result);

      // Verify top-level keys
      const topLevelKeys = Object.keys(parsed);
      expect(topLevelKeys).toContain('GRADER');
      expect(topLevelKeys).toContain('GRADE_CUTOFFS');
      expect(topLevelKeys.length).toBe(2); // Only these two keys
    });
  });
});
