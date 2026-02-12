/**
 * Tests for course-nodes/parity-checker.ts
 *
 * Verifies that the parity checker correctly detects structural differences
 * between an original CourseStructure and a reconstructed one (from course_nodes).
 */

import { describe, it, expect } from 'vitest';
import {
  checkStructureParity,
  type ParityResult,
} from '../../../src/shared/course-nodes/parity-checker';
import type { CourseStructure } from '@megacampus/shared-types';

// ---------------------------------------------------------------------------
// Test fixtures — mirrors converters.test.ts pattern
// ---------------------------------------------------------------------------

function makeCourseStructure(): CourseStructure {
  return {
    course_title: 'Introduction to Software Testing',
    course_description:
      'A comprehensive guide to software testing methodologies and best practices.',
    course_overview:
      'This course covers unit testing, integration testing, and end-to-end testing patterns.',
    target_audience: 'Developers with basic programming experience who want to improve quality.',
    estimated_duration_hours: 3,
    difficulty_level: 'intermediate',
    prerequisites: ['Basic programming knowledge in any language'],
    learning_outcomes: [
      { id: 'lo-001', text: 'Understand the testing pyramid and its layers', language: 'en' },
      { id: 'lo-002', text: 'Write effective unit tests with proper assertions', language: 'en' },
    ],
    course_tags: ['testing', 'software', 'quality'],
    sections: [
      {
        id: 'sec_aaaaaaaa',
        section_number: 1,
        section_title: 'Fundamentals of Testing',
        section_description: 'Core concepts and terminology of software testing.',
        learning_objectives: ['Define software testing concepts clearly'],
        estimated_duration_minutes: 50,
        lessons: [
          {
            id: 'lsn_11111111',
            lesson_number: 1.1,
            lesson_title: 'What is Software Testing',
            lesson_objectives: ['Define software testing and its purpose'],
            key_topics: ['Testing definition', 'Quality assurance vs testing'],
            estimated_duration_minutes: 20,
            difficulty_level: 'beginner',
          },
          {
            id: 'lsn_22222222',
            lesson_number: 1.2,
            lesson_title: 'Types of Tests',
            lesson_objectives: ['Classify different types of software tests'],
            key_topics: ['Unit tests', 'Integration tests', 'E2E tests'],
            estimated_duration_minutes: 30,
            difficulty_level: 'beginner',
          },
        ],
      },
      {
        id: 'sec_bbbbbbbb',
        section_number: 2,
        section_title: 'Unit Testing in Practice',
        section_description: 'Hands-on unit testing with modern frameworks and assertions.',
        learning_objectives: ['Write unit tests using a modern testing framework'],
        estimated_duration_minutes: 25,
        lessons: [
          {
            id: 'lsn_33333333',
            lesson_number: 2.1,
            lesson_title: 'Setting Up a Test Runner',
            lesson_objectives: ['Configure Vitest for a TypeScript project'],
            key_topics: ['Vitest configuration', 'Test runner setup'],
            estimated_duration_minutes: 25,
            difficulty_level: 'intermediate',
          },
        ],
      },
    ],
  } as CourseStructure;
}

/** Deep-clone a structure to allow safe mutations in individual tests */
function cloneStructure(s: CourseStructure): CourseStructure {
  return JSON.parse(JSON.stringify(s)) as CourseStructure;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('course-nodes/parity-checker', () => {
  // -------------------------------------------------------------------------
  // Identical structures
  // -------------------------------------------------------------------------
  describe('identical structures', () => {
    it('returns isEqual: true with no differences for identical structures', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(true);
      expect(result.differences).toHaveLength(0);
    });

    it('reports correct section and lesson counts for identical structures', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);

      const result = checkStructureParity(original, reconstructed);

      expect(result.sectionCount).toEqual({ original: 2, reconstructed: 2 });
      expect(result.lessonCount).toEqual({ original: 3, reconstructed: 3 });
    });
  });

  // -------------------------------------------------------------------------
  // Section-level differences
  // -------------------------------------------------------------------------
  describe('section-level differences', () => {
    it('detects different section title', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      reconstructed.sections[0].section_title = 'Changed Section Title';

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0]).toEqual({
        path: 'sections[0].section_title',
        expected: 'Fundamentals of Testing',
        actual: 'Changed Section Title',
      });
    });

    it('detects different section description', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      reconstructed.sections[1].section_description = 'A completely different description.';

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toBe('sections[1].section_description');
    });

    it('detects different section count', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      reconstructed.sections.pop(); // Remove last section

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences.some(d => d.path === 'sections.length')).toBe(true);
      expect(result.sectionCount).toEqual({ original: 2, reconstructed: 1 });
    });

    it('detects different section ID', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      reconstructed.sections[0].id = 'sec_zzzzzzzz';

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toContainEqual({
        path: 'sections[0].id',
        expected: 'sec_aaaaaaaa',
        actual: 'sec_zzzzzzzz',
      });
    });

    it('detects different learning objectives', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      reconstructed.sections[0].learning_objectives = ['A different objective entirely'];

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toContainEqual({
        path: 'sections[0].learning_objectives',
        expected: ['Define software testing concepts clearly'],
        actual: ['A different objective entirely'],
      });
    });
  });

  // -------------------------------------------------------------------------
  // Lesson-level differences
  // -------------------------------------------------------------------------
  describe('lesson-level differences', () => {
    it('detects different lesson count within a section', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      // Remove second lesson from first section
      reconstructed.sections[0].lessons.pop();

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences.some(d => d.path === 'sections[0].lessons.length')).toBe(true);
      expect(result.lessonCount).toEqual({ original: 3, reconstructed: 2 });
    });

    it('detects different lesson title', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      reconstructed.sections[0].lessons[1].lesson_title = 'Renamed Lesson';

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toContainEqual({
        path: 'sections[0].lessons[1].lesson_title',
        expected: 'Types of Tests',
        actual: 'Renamed Lesson',
      });
    });

    it('detects different lesson ID', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      reconstructed.sections[0].lessons[0].id = 'lsn_replaced1';

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toContainEqual({
        path: 'sections[0].lessons[0].id',
        expected: 'lsn_11111111',
        actual: 'lsn_replaced1',
      });
    });

    it('detects different estimated_duration_minutes', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      reconstructed.sections[1].lessons[0].estimated_duration_minutes = 99;

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toContainEqual({
        path: 'sections[1].lessons[0].estimated_duration_minutes',
        expected: 25,
        actual: 99,
      });
    });

    it('detects different lesson_objectives', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      reconstructed.sections[0].lessons[0].lesson_objectives = ['Changed objective'];

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toContainEqual({
        path: 'sections[0].lessons[0].lesson_objectives',
        expected: ['Define software testing and its purpose'],
        actual: ['Changed objective'],
      });
    });

    it('detects different key_topics', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      reconstructed.sections[0].lessons[1].key_topics = ['Topic A', 'Topic B'];

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toContainEqual({
        path: 'sections[0].lessons[1].key_topics',
        expected: ['Unit tests', 'Integration tests', 'E2E tests'],
        actual: ['Topic A', 'Topic B'],
      });
    });
  });

  // -------------------------------------------------------------------------
  // Multiple differences
  // -------------------------------------------------------------------------
  describe('multiple differences', () => {
    it('accumulates all differences in a single result', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);

      // Introduce three differences
      reconstructed.sections[0].section_title = 'Changed Title';
      reconstructed.sections[0].lessons[0].lesson_title = 'Changed Lesson';
      reconstructed.sections[1].lessons[0].estimated_duration_minutes = 5;

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles structures with empty sections arrays', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);
      original.sections = [];
      reconstructed.sections = [];

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(true);
      expect(result.sectionCount).toEqual({ original: 0, reconstructed: 0 });
      expect(result.lessonCount).toEqual({ original: 0, reconstructed: 0 });
    });

    it('compares only up to the shorter section array and reports length difference', () => {
      const original = makeCourseStructure();
      const reconstructed = cloneStructure(original);

      // Add an extra section to reconstructed
      const extraSection = cloneStructure(original).sections[0];
      extraSection.id = 'sec_extra001';
      reconstructed.sections.push(extraSection);

      const result = checkStructureParity(original, reconstructed);

      expect(result.isEqual).toBe(false);
      expect(result.differences.some(d => d.path === 'sections.length')).toBe(true);
      expect(result.sectionCount).toEqual({ original: 2, reconstructed: 3 });
    });
  });
});
