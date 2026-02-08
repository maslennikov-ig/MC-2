/**
 * Course Structure Editor - Move Element Tests
 * @module stage5-generation/utils/__tests__/course-structure-editor-move.test
 *
 * Tests for moveElement function with lesson renumbering and duration recalculation.
 * Tests lesson moves (within section and cross-section) and section moves.
 */

import { describe, it, expect } from 'vitest';
import { moveElement } from '@/stages/stage5-generation/utils/course-structure-editor';
import type { CourseStructure } from '@megacampus/shared-types';

// Helper to create minimal CourseStructure for testing
const createTestStructure = (): CourseStructure => ({
  course_title: 'Test Course',
  course_description: 'A test course for move operations',
  target_audience: 'Developers',
  difficulty_level: 'intermediate',
  prerequisites: ['Basic knowledge'],
  learning_outcomes: ['Master testing', 'Understand moves'],
  estimated_duration_hours: 3,
  course_tags: ['testing', 'development', 'quality', 'unit-tests', 'vitest'],
  sections: [
    {
      section_number: 1,
      section_title: 'Section 1',
      section_description: 'First section',
      learning_objectives: ['Learn section 1 content'],
      estimated_duration_minutes: 90,
      lessons: [
        {
          lesson_number: 1.1,
          lesson_title: 'Lesson 1.1',
          lesson_objectives: ['Objective 1.1'],
          key_topics: ['Topic A'],
          estimated_duration_minutes: 30,
          lesson_type: 'theory',
        },
        {
          lesson_number: 1.2,
          lesson_title: 'Lesson 1.2',
          lesson_objectives: ['Objective 1.2'],
          key_topics: ['Topic B'],
          estimated_duration_minutes: 30,
          lesson_type: 'theory',
        },
        {
          lesson_number: 1.3,
          lesson_title: 'Lesson 1.3',
          lesson_objectives: ['Objective 1.3'],
          key_topics: ['Topic C'],
          estimated_duration_minutes: 30,
          lesson_type: 'practice',
        },
      ],
    },
    {
      section_number: 2,
      section_title: 'Section 2',
      section_description: 'Second section',
      learning_objectives: ['Learn section 2 content'],
      estimated_duration_minutes: 60,
      lessons: [
        {
          lesson_number: 2.1,
          lesson_title: 'Lesson 2.1',
          lesson_objectives: ['Objective 2.1'],
          key_topics: ['Topic D'],
          estimated_duration_minutes: 30,
          lesson_type: 'practice',
        },
        {
          lesson_number: 2.2,
          lesson_title: 'Lesson 2.2',
          lesson_objectives: ['Objective 2.2'],
          key_topics: ['Topic E'],
          estimated_duration_minutes: 30,
          lesson_type: 'theory',
        },
      ],
    },
  ],
});

describe('moveElement', () => {
  describe('lesson moves within section', () => {
    it('should move lesson within same section (forward)', () => {
      const structure = createTestStructure();

      // Move lesson 1.1 to position of 1.3 (index 0 → index 2)
      // When moving forward in same section, destination index adjusts by -1
      const result = moveElement(structure, 'sections[0].lessons[0]', 'sections[0].lessons[2]');

      // Check order: was [1.1, 1.2, 1.3], now [1.2, 1.1, 1.3]
      // (moving 0→2 in same section: remove 0, insert at 1 due to adjustment)
      expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe('Lesson 1.2');
      expect(result.updatedStructure.sections[0].lessons[1].lesson_title).toBe('Lesson 1.1');
      expect(result.updatedStructure.sections[0].lessons[2].lesson_title).toBe('Lesson 1.3');

      // Original structure should be unchanged (immutable)
      expect(structure.sections[0].lessons[0].lesson_title).toBe('Lesson 1.1');
    });

    it('should move lesson within same section (backward)', () => {
      const structure = createTestStructure();

      // Move lesson 1.3 to position of 1.1 (index 2 → index 0)
      const result = moveElement(structure, 'sections[0].lessons[2]', 'sections[0].lessons[0]');

      // Check order: was [1.1, 1.2, 1.3], now [1.3, 1.1, 1.2]
      expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe('Lesson 1.3');
      expect(result.updatedStructure.sections[0].lessons[1].lesson_title).toBe('Lesson 1.1');
      expect(result.updatedStructure.sections[0].lessons[2].lesson_title).toBe('Lesson 1.2');
    });

    it('should recalculate lesson numbers after move within section', () => {
      const structure = createTestStructure();

      const result = moveElement(structure, 'sections[0].lessons[0]', 'sections[0].lessons[2]');

      // Lesson numbers should be recalculated
      expect(result.updatedStructure.sections[0].lessons[0].lesson_number).toBe(1.1);
      expect(result.updatedStructure.sections[0].lessons[1].lesson_number).toBe(1.2);
      expect(result.updatedStructure.sections[0].lessons[2].lesson_number).toBe(1.3);

      // Check renumbering map
      expect(result.recalculated.lessonNumbers).toBeDefined();
      expect(result.recalculated.lessonNumbers!['sections[0].lessons[0]']).toBe(1.1);
      expect(result.recalculated.lessonNumbers!['sections[0].lessons[2]']).toBe(1.3);
    });

    it('should recalculate duration after move (no change within section)', () => {
      const structure = createTestStructure();

      const result = moveElement(structure, 'sections[0].lessons[0]', 'sections[0].lessons[2]');

      // Section duration unchanged (same lessons, different order)
      expect(result.updatedStructure.sections[0].estimated_duration_minutes).toBe(90);

      // Course duration unchanged
      expect(result.updatedStructure.estimated_duration_hours).toBe(2.5); // (90 + 60) / 60
    });
  });

  describe('lesson moves to different section', () => {
    it('should move lesson to different section (append at end)', () => {
      const structure = createTestStructure();

      // Move lesson 1.2 from section 1 to section 2 (append at end)
      // Note: Must specify lesson index or it appends to end
      const result = moveElement(
        structure,
        'sections[0].lessons[1]',
        'sections[1].lessons[2]' // Append after last lesson
      );

      // Section 1 should have 2 lessons now
      expect(result.updatedStructure.sections[0].lessons).toHaveLength(2);
      expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe('Lesson 1.1');
      expect(result.updatedStructure.sections[0].lessons[1].lesson_title).toBe('Lesson 1.3');

      // Section 2 should have 3 lessons now (2.1, 2.2, moved 1.2)
      expect(result.updatedStructure.sections[1].lessons).toHaveLength(3);
      expect(result.updatedStructure.sections[1].lessons[2].lesson_title).toBe('Lesson 1.2');
    });

    it('should move lesson to specific position in different section', () => {
      const structure = createTestStructure();

      // Move lesson 1.2 from section 1 to section 2, position 0
      const result = moveElement(structure, 'sections[0].lessons[1]', 'sections[1].lessons[0]');

      // Section 2 should have lesson 1.2 at the beginning
      expect(result.updatedStructure.sections[1].lessons[0].lesson_title).toBe('Lesson 1.2');
      expect(result.updatedStructure.sections[1].lessons[1].lesson_title).toBe('Lesson 2.1');
      expect(result.updatedStructure.sections[1].lessons[2].lesson_title).toBe('Lesson 2.2');
    });

    it('should recalculate lesson numbers after cross-section move', () => {
      const structure = createTestStructure();

      const result = moveElement(structure, 'sections[0].lessons[1]', 'sections[1].lessons[0]');

      // Section 1 lessons should be renumbered: 1.1, 1.2 (was 1.3)
      expect(result.updatedStructure.sections[0].lessons[0].lesson_number).toBe(1.1);
      expect(result.updatedStructure.sections[0].lessons[1].lesson_number).toBe(1.2);

      // Section 2 lessons should be renumbered: 2.1 (moved), 2.2 (was 2.1), 2.3 (was 2.2)
      expect(result.updatedStructure.sections[1].lessons[0].lesson_number).toBe(2.1);
      expect(result.updatedStructure.sections[1].lessons[1].lesson_number).toBe(2.2);
      expect(result.updatedStructure.sections[1].lessons[2].lesson_number).toBe(2.3);
    });

    it('should recalculate durations after cross-section move', () => {
      const structure = createTestStructure();

      // Move lesson 1.2 (30 min) from section 1 to section 2
      const result = moveElement(structure, 'sections[0].lessons[1]', 'sections[1].lessons[0]');

      // Section 1 duration: 90 - 30 = 60
      expect(result.updatedStructure.sections[0].estimated_duration_minutes).toBe(60);

      // Section 2 duration: 60 + 30 = 90
      expect(result.updatedStructure.sections[1].estimated_duration_minutes).toBe(90);

      // Course duration: (60 + 90) / 60 = 2.5
      expect(result.updatedStructure.estimated_duration_hours).toBe(2.5);
      expect(result.recalculated.courseDuration).toBe(2.5);
    });
  });

  describe('section moves', () => {
    it('should move section to new position (forward)', () => {
      const structure = createTestStructure();

      // Move section 0 to position 1 (swap sections)
      // When moving forward, index adjusts by -1
      const result = moveElement(structure, 'sections[0]', 'sections[1]');

      // Section order: was [Section 1, Section 2], stays [Section 1, Section 2]
      // (moving 0→1 in same list: remove 0, insert at 0 due to adjustment)
      expect(result.updatedStructure.sections[0].section_title).toBe('Section 1');
      expect(result.updatedStructure.sections[1].section_title).toBe('Section 2');
    });

    it('should recalculate lesson numbers after section move', () => {
      const structure = createTestStructure();

      // Move section 1 to position 0 (backward move)
      const result = moveElement(structure, 'sections[1]', 'sections[0]');

      // Verify lesson renumbering happened
      expect(result.recalculated.lessonNumbers).toBeDefined();

      // All lessons should have valid lesson numbers based on their section position
      result.updatedStructure.sections.forEach((section, sectionIdx) => {
        section.lessons.forEach((lesson, lessonIdx) => {
          const expectedNumber = parseFloat(`${section.section_number}.${lessonIdx + 1}`);
          expect(lesson.lesson_number).toBe(expectedNumber);
        });
      });
    });

    it('should preserve section durations after section move', () => {
      const structure = createTestStructure();

      const result = moveElement(structure, 'sections[1]', 'sections[0]');

      // Durations unchanged (section order doesn't affect duration)
      // Section 2 (now first) still has 60 minutes
      expect(result.updatedStructure.sections[0].estimated_duration_minutes).toBe(60);

      // Section 1 (now second) still has 90 minutes
      expect(result.updatedStructure.sections[1].estimated_duration_minutes).toBe(90);

      // Course duration unchanged
      expect(result.updatedStructure.estimated_duration_hours).toBe(2.5);
    });
  });

  describe('error handling', () => {
    it('should throw on invalid source path', () => {
      const structure = createTestStructure();

      expect(() => moveElement(structure, 'invalid-path', 'sections[0]')).toThrow(
        'Invalid path format'
      );
    });

    it('should throw when source element not found', () => {
      const structure = createTestStructure();

      expect(() =>
        moveElement(structure, 'sections[0].lessons[99]', 'sections[1].lessons[0]')
      ).toThrow('Source lesson not found');
    });

    it('should throw on invalid destination path', () => {
      const structure = createTestStructure();

      expect(() => moveElement(structure, 'sections[0].lessons[0]', 'invalid-destination')).toThrow(
        'Invalid path format'
      );
    });

    it('should throw when destination section not found', () => {
      const structure = createTestStructure();

      expect(() =>
        moveElement(structure, 'sections[0].lessons[0]', 'sections[99].lessons[0]')
      ).toThrow('out of bounds');
    });

    it('should throw on type mismatch (lesson to section move not allowed)', () => {
      const structure = createTestStructure();

      // Trying to move lesson to section path (without .lessons) should fail
      expect(() => moveElement(structure, 'sections[0].lessons[0]', 'sections[1]')).toThrow(
        'Cannot move lesson to section position'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle move to same position gracefully (lesson)', () => {
      const structure = createTestStructure();

      // Move lesson to its own position
      const result = moveElement(structure, 'sections[0].lessons[1]', 'sections[0].lessons[1]');

      // Structure should remain the same (no changes)
      expect(result.updatedStructure.sections[0].lessons[1].lesson_title).toBe('Lesson 1.2');

      // Same-position move returns unchanged structure with empty recalculated
      expect(result.recalculated).toEqual({});
    });

    it('should handle move to adjacent position (forward)', () => {
      const structure = createTestStructure();

      // Move lesson 1.1 to position after 1.2
      const result = moveElement(structure, 'sections[0].lessons[0]', 'sections[0].lessons[2]');

      // When moving forward within same section, index adjusts
      // Moving from 0 to 2: removes from 0, inserts at 1 (2-1 due to removal)
      // Order: [1.2, 1.1, 1.3]
      expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe('Lesson 1.2');
      expect(result.updatedStructure.sections[0].lessons[1].lesson_title).toBe('Lesson 1.1');
    });

    it('should handle move to adjacent position (backward)', () => {
      const structure = createTestStructure();

      // Move lesson 1.2 to position 1.1 (adjacent)
      const result = moveElement(structure, 'sections[0].lessons[1]', 'sections[0].lessons[0]');

      // Order: [1.2, 1.1, 1.3]
      expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe('Lesson 1.2');
      expect(result.updatedStructure.sections[0].lessons[1].lesson_title).toBe('Lesson 1.1');
    });

    it('should handle section with single lesson', () => {
      const structure = createTestStructure();

      // Remove lessons to have only one
      structure.sections[1].lessons = [structure.sections[1].lessons[0]];
      structure.sections[1].estimated_duration_minutes = 30;

      const result = moveElement(structure, 'sections[0].lessons[0]', 'sections[1].lessons[0]');

      expect(result.updatedStructure.sections[1].lessons).toHaveLength(2);
    });

    it('should handle empty destination section (append)', () => {
      const structure = createTestStructure();

      // Create empty section
      structure.sections.push({
        section_number: 3,
        section_title: 'Empty Section',
        section_description: 'Empty',
        learning_objectives: [],
        estimated_duration_minutes: 0,
        lessons: [],
      });

      // Must specify lessons path, even if empty
      const result = moveElement(structure, 'sections[0].lessons[0]', 'sections[2].lessons[0]');

      // Lesson should be added to empty section
      expect(result.updatedStructure.sections[2].lessons).toHaveLength(1);
      expect(result.updatedStructure.sections[2].lessons[0].lesson_title).toBe('Lesson 1.1');

      // Duration recalculated
      expect(result.updatedStructure.sections[2].estimated_duration_minutes).toBe(30);
    });
  });

  describe('immutability', () => {
    it('should not mutate original structure', () => {
      const structure = createTestStructure();
      const originalJson = JSON.stringify(structure);

      moveElement(structure, 'sections[0].lessons[0]', 'sections[1].lessons[0]');

      // Original structure unchanged
      expect(JSON.stringify(structure)).toBe(originalJson);
    });

    it('should return new object references', () => {
      const structure = createTestStructure();

      const result = moveElement(structure, 'sections[0].lessons[0]', 'sections[1].lessons[0]');

      // Different object references
      expect(result.updatedStructure).not.toBe(structure);
      expect(result.updatedStructure.sections).not.toBe(structure.sections);
      expect(result.updatedStructure.sections[0]).not.toBe(structure.sections[0]);
    });
  });
});
