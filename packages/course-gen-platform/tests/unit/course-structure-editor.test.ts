/**
 * Tests for course-structure-editor.ts
 *
 * Covers setAtPath fix for array access on first level of object.
 * @see https://github.com/maslennikov-ig/MC-2/issues/mc2-ejcy
 */

import { describe, it, expect } from 'vitest';
import { applyFieldUpdate } from '../../src/stages/stage5-generation/utils/course-structure-editor';
import type { CourseStructure } from '@megacampus/shared-types';

// Minimal valid CourseStructure for testing
const createMinimalStructure = (): CourseStructure => ({
  course_title: 'Test Course Title Here',
  course_description: 'This is a test course description that is long enough.',
  target_audience: 'Developers who want to learn testing',
  difficulty_level: 'intermediate',
  prerequisites: ['Basic programming knowledge'],
  learning_outcomes: [
    'Understand testing fundamentals',
    'Write effective unit tests',
    'Apply TDD principles',
  ],
  estimated_duration_hours: 2,
  course_tags: ['testing', 'development', 'quality', 'unit-tests', 'tdd'],
  sections: [
    {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Introduction to testing concepts',
      learning_objectives: ['Understand why testing matters'],
      estimated_duration_minutes: 60,
      lessons: [
        {
          lesson_number: 1.1,
          lesson_title: 'What is Testing',
          lesson_objectives: ['Define software testing'],
          key_topics: ['Types of tests', 'Testing pyramid'],
          estimated_duration_minutes: 30,
          lesson_type: 'theory',
        },
        {
          lesson_number: 1.2,
          lesson_title: 'Why Test',
          lesson_objectives: ['Explain benefits of testing'],
          key_topics: ['Bug prevention', 'Confidence'],
          estimated_duration_minutes: 30,
          lesson_type: 'theory',
        },
      ],
    },
    {
      section_number: 2,
      section_title: 'Advanced Topics',
      section_description: 'Advanced testing strategies',
      learning_objectives: ['Apply advanced testing patterns'],
      estimated_duration_minutes: 60,
      lessons: [
        {
          lesson_number: 2.1,
          lesson_title: 'Mocking',
          lesson_objectives: ['Understand mocking techniques'],
          key_topics: ['Stubs', 'Spies', 'Mocks'],
          estimated_duration_minutes: 30,
          lesson_type: 'practice',
        },
      ],
    },
  ],
});

describe('course-structure-editor', () => {
  describe('applyFieldUpdate', () => {
    it('should update nested lesson field via sections[0].lessons[1].lesson_title path', () => {
      const structure = createMinimalStructure();
      const newTitle = 'Updated Lesson Title';

      const result = applyFieldUpdate(structure, 'sections[0].lessons[1].lesson_title', newTitle);

      expect(result.updatedStructure.sections[0].lessons[1].lesson_title).toBe(newTitle);
      // Original should be unchanged (immutable)
      expect(structure.sections[0].lessons[1].lesson_title).toBe('Why Test');
    });

    it('should update section field via sections[0].section_title path', () => {
      const structure = createMinimalStructure();
      const newTitle = 'Updated Section Title';

      const result = applyFieldUpdate(structure, 'sections[0].section_title', newTitle);

      expect(result.updatedStructure.sections[0].section_title).toBe(newTitle);
      expect(structure.sections[0].section_title).toBe('Introduction');
    });

    it('should update deeply nested key_topics array', () => {
      const structure = createMinimalStructure();
      const newTopics = ['New Topic 1', 'New Topic 2', 'New Topic 3'];

      const result = applyFieldUpdate(structure, 'sections[0].lessons[0].key_topics', newTopics);

      expect(result.updatedStructure.sections[0].lessons[0].key_topics).toEqual(newTopics);
    });

    it('should update second section via sections[1] path', () => {
      const structure = createMinimalStructure();
      const newDescription = 'New advanced section description';

      const result = applyFieldUpdate(structure, 'sections[1].section_description', newDescription);

      expect(result.updatedStructure.sections[1].section_description).toBe(newDescription);
      // First section should be unchanged
      expect(result.updatedStructure.sections[0].section_description).toBe(
        'Introduction to testing concepts'
      );
    });

    it('should recalculate durations when updating estimated_duration_minutes', () => {
      const structure = createMinimalStructure();

      const result = applyFieldUpdate(
        structure,
        'sections[0].lessons[0].estimated_duration_minutes',
        45
      );

      // Lesson duration updated
      expect(result.updatedStructure.sections[0].lessons[0].estimated_duration_minutes).toBe(45);

      // Section duration recalculated (45 + 30 = 75)
      expect(result.updatedStructure.sections[0].estimated_duration_minutes).toBe(75);
      expect(result.recalculated.sectionDuration).toBe(75);

      // Course duration recalculated ((75 + 60) / 60 = 2.25)
      expect(result.updatedStructure.estimated_duration_hours).toBe(2.25);
      expect(result.recalculated.courseDuration).toBe(2.25);
    });

    it('should update top-level course_title field', () => {
      const structure = createMinimalStructure();
      const newTitle = 'Brand New Course Title';

      const result = applyFieldUpdate(structure, 'course_title', newTitle);

      expect(result.updatedStructure.course_title).toBe(newTitle);
    });

    it('should throw error for invalid array path on non-object', () => {
      const structure = createMinimalStructure();

      // Try to access array index on a string (course_title)
      expect(() => applyFieldUpdate(structure, 'course_title[0]', 'value')).toThrow();
    });

    it('should throw error when expected array is not an array', () => {
      // Create structure with sections as non-array (invalid but for testing)
      const invalidStructure = {
        ...createMinimalStructure(),
        sections: 'not an array',
      } as unknown as CourseStructure;

      expect(() =>
        applyFieldUpdate(invalidStructure, 'sections[0].section_title', 'value')
      ).toThrow('Expected array at "sections"');
    });
  });
});
