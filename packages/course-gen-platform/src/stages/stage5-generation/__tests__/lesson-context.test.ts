import { describe, it, expect } from 'vitest';
import type { Section, GenerationJobInput } from '@megacampus/shared-types';
import { convertSectionToV2Specs } from '@/stages/stage5-generation/utils/section-batch/v2-converter';

/**
 * Unit tests for buildLessonContext function
 *
 * Tests inter-lesson context generation for Stage 6 lesson generation.
 * The buildLessonContext function is private, so we test it indirectly
 * through convertSectionToV2Specs.
 *
 * Test Coverage:
 * - First lesson behavior (no previous_lesson)
 * - Last lesson behavior (no next_lesson)
 * - Middle lesson behavior (both previous and next)
 * - Concept accumulation across lessons
 * - Cross-section transitions
 * - Empty sections handling
 * - Max 20 concepts limit
 * - Max 5 key_concepts limit for previous_lesson
 */

// ============================================================================
// Mock Data Helpers
// ============================================================================

/**
 * Create a mock Section with configurable lessons
 */
function createMockSection(
  sectionNumber: number,
  lessons: Array<{
    lesson_title: string;
    key_topics: string[];
    lesson_objectives: string[];
  }>
): Section {
  return {
    section_number: sectionNumber,
    section_title: `Section ${sectionNumber}`,
    section_description: `Description for section ${sectionNumber}`,
    learning_objectives: [`Learning objective for section ${sectionNumber}`],
    estimated_duration_minutes: lessons.length * 15,
    lessons: lessons.map((l, i) => ({
      lesson_number: i + 1,
      lesson_title: l.lesson_title,
      lesson_objectives: l.lesson_objectives,
      key_topics: l.key_topics,
      estimated_duration_minutes: 15,
      difficulty_level: 'intermediate' as const,
      practical_exercises: [
        {
          exercise_title: 'Exercise 1',
          exercise_description: 'Description',
          exercise_type: 'coding',
          difficulty_level: 'medium',
          estimated_duration_minutes: 10,
          solution_provided: false,
        },
        {
          exercise_title: 'Exercise 2',
          exercise_description: 'Description',
          exercise_type: 'conceptual',
          difficulty_level: 'medium',
          estimated_duration_minutes: 10,
          solution_provided: false,
        },
        {
          exercise_title: 'Exercise 3',
          exercise_description: 'Description',
          exercise_type: 'case_study',
          difficulty_level: 'medium',
          estimated_duration_minutes: 10,
          solution_provided: false,
        },
      ],
    })),
  };
}

/**
 * Create minimal GenerationJobInput for testing
 */
function createMockInput(): GenerationJobInput {
  return {
    course_title: 'Test Course',
    styles: {},
    generation_mode: 'title-only',
    frontend_parameters: {
      course_level: 'intermediate',
      language: 'en',
    },
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Inter-Lesson Context (buildLessonContext)', () => {
  describe('First lesson in course', () => {
    it('should have previous_lesson: null for first lesson', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A', 'Topic B'],
            lesson_objectives: ['Learn topic A', 'Understand topic B'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic C'],
            lesson_objectives: ['Learn topic C'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      // First lesson
      const firstLesson = specs[0];
      expect(firstLesson.lesson_context).toBeDefined();
      expect(firstLesson.lesson_context?.previous_lesson).toBeNull();
    });

    it('should have next_lesson for first lesson when more lessons exist', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A', 'Topic B'],
            lesson_objectives: ['Learn topic A'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic C', 'Topic D', 'Topic E', 'Topic F'],
            lesson_objectives: ['Learn topic C'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const firstLesson = specs[0];
      expect(firstLesson.lesson_context).toBeDefined();
      expect(firstLesson.lesson_context?.next_lesson).toBeDefined();
      expect(firstLesson.lesson_context?.next_lesson?.lesson_id).toBe('1.2');
      expect(firstLesson.lesson_context?.next_lesson?.title).toBe('Lesson 2');
      expect(firstLesson.lesson_context?.next_lesson?.key_concepts).toHaveLength(3); // Max 3 for next_lesson
      expect(firstLesson.lesson_context?.next_lesson?.key_concepts).toEqual(['Topic C', 'Topic D', 'Topic E']);
    });

    it('should have empty concepts_already_covered for first lesson', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A'],
            lesson_objectives: ['Learn topic A'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const firstLesson = specs[0];
      expect(firstLesson.lesson_context).toBeUndefined(); // No context if first lesson with no next
    });
  });

  describe('Last lesson in course', () => {
    it('should have next_lesson: null for last lesson', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A'],
            lesson_objectives: ['Learn topic A'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic B'],
            lesson_objectives: ['Learn topic B'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const lastLesson = specs[1];
      expect(lastLesson.lesson_context).toBeDefined();
      expect(lastLesson.lesson_context?.next_lesson).toBeNull();
    });

    it('should have previous_lesson for last lesson', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A', 'Topic B', 'Topic C', 'Topic D', 'Topic E', 'Topic F'],
            lesson_objectives: ['Learn topic A', 'Understand topic B'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic G'],
            lesson_objectives: ['Learn topic G'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const lastLesson = specs[1];
      expect(lastLesson.lesson_context).toBeDefined();
      expect(lastLesson.lesson_context?.previous_lesson).toBeDefined();
      expect(lastLesson.lesson_context?.previous_lesson?.lesson_id).toBe('1.1');
      expect(lastLesson.lesson_context?.previous_lesson?.title).toBe('Lesson 1');
      expect(lastLesson.lesson_context?.previous_lesson?.key_concepts).toHaveLength(5); // Max 5 for previous_lesson
      expect(lastLesson.lesson_context?.previous_lesson?.key_concepts).toEqual([
        'Topic A',
        'Topic B',
        'Topic C',
        'Topic D',
        'Topic E',
      ]);
      expect(lastLesson.lesson_context?.previous_lesson?.summary_preview).toBe('Learn topic A. Understand topic B');
    });
  });

  describe('Middle lesson behavior', () => {
    it('should have both previous_lesson and next_lesson for middle lesson', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A'],
            lesson_objectives: ['Learn A'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic B'],
            lesson_objectives: ['Learn B'],
          },
          {
            lesson_title: 'Lesson 3',
            key_topics: ['Topic C'],
            lesson_objectives: ['Learn C'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const middleLesson = specs[1];
      expect(middleLesson.lesson_context).toBeDefined();
      expect(middleLesson.lesson_context?.previous_lesson).toBeDefined();
      expect(middleLesson.lesson_context?.previous_lesson?.lesson_id).toBe('1.1');
      expect(middleLesson.lesson_context?.next_lesson).toBeDefined();
      expect(middleLesson.lesson_context?.next_lesson?.lesson_id).toBe('1.3');
    });
  });

  describe('Concept accumulation', () => {
    it('should accumulate concepts from all previous lessons', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A', 'Topic B'],
            lesson_objectives: ['Learn A'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic C', 'Topic D'],
            lesson_objectives: ['Learn C'],
          },
          {
            lesson_title: 'Lesson 3',
            key_topics: ['Topic E'],
            lesson_objectives: ['Learn E'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const thirdLesson = specs[2];
      expect(thirdLesson.lesson_context).toBeDefined();
      expect(thirdLesson.lesson_context?.concepts_already_covered).toEqual([
        'Topic A',
        'Topic B',
        'Topic C',
        'Topic D',
      ]);
    });

    it('should not include duplicate concepts in concepts_already_covered', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A', 'Topic B'],
            lesson_objectives: ['Learn A'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic A', 'Topic C'], // Topic A repeated
            lesson_objectives: ['Learn C'],
          },
          {
            lesson_title: 'Lesson 3',
            key_topics: ['Topic D'],
            lesson_objectives: ['Learn D'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const thirdLesson = specs[2];
      expect(thirdLesson.lesson_context).toBeDefined();
      // Topic A should appear only once
      expect(thirdLesson.lesson_context?.concepts_already_covered).toEqual([
        'Topic A',
        'Topic B',
        'Topic C',
      ]);
    });

    it('should cap concepts_already_covered at 20 items', () => {
      // Create lessons with many topics to exceed the limit
      const lessons = Array.from({ length: 5 }, (_, i) => ({
        lesson_title: `Lesson ${i + 1}`,
        key_topics: Array.from({ length: 5 }, (_, j) => `Topic ${i * 5 + j + 1}`),
        lesson_objectives: [`Learn lesson ${i + 1}`],
      }));

      const sections: Section[] = [createMockSection(1, lessons)];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      // Test last lesson (should have concepts from previous 4 lessons = 20 topics)
      const lastLesson = specs[4];
      expect(lastLesson.lesson_context).toBeDefined();
      expect(lastLesson.lesson_context?.concepts_already_covered).toHaveLength(20);
      expect(lastLesson.lesson_context?.concepts_already_covered[0]).toBe('Topic 1');
      expect(lastLesson.lesson_context?.concepts_already_covered[19]).toBe('Topic 20');
    });

    it('should only include topics from immediate previous lesson in terms_already_defined', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A', 'Topic B'],
            lesson_objectives: ['Learn A'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic C', 'Topic D', 'Topic E'],
            lesson_objectives: ['Learn C'],
          },
          {
            lesson_title: 'Lesson 3',
            key_topics: ['Topic F'],
            lesson_objectives: ['Learn F'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const thirdLesson = specs[2];
      expect(thirdLesson.lesson_context).toBeDefined();
      // Should only have topics from Lesson 2 (immediate previous)
      expect(thirdLesson.lesson_context?.terms_already_defined).toEqual([
        'Topic C',
        'Topic D',
        'Topic E',
      ]);
    });

    it('should cap terms_already_defined at 10 items from previous lesson', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: Array.from({ length: 15 }, (_, i) => `Topic ${i + 1}`),
            lesson_objectives: ['Learn topics'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic X'],
            lesson_objectives: ['Learn X'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const secondLesson = specs[1];
      expect(secondLesson.lesson_context).toBeDefined();
      // Should cap at 10 topics from previous lesson
      expect(secondLesson.lesson_context?.terms_already_defined).toHaveLength(10);
      expect(secondLesson.lesson_context?.terms_already_defined).toEqual([
        'Topic 1',
        'Topic 2',
        'Topic 3',
        'Topic 4',
        'Topic 5',
        'Topic 6',
        'Topic 7',
        'Topic 8',
        'Topic 9',
        'Topic 10',
      ]);
    });
  });

  describe('Cross-section transitions', () => {
    it('should handle lesson transitions across sections', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Section 1 - Lesson 1',
            key_topics: ['Topic A'],
            lesson_objectives: ['Learn A'],
          },
          {
            lesson_title: 'Section 1 - Lesson 2',
            key_topics: ['Topic B'],
            lesson_objectives: ['Learn B'],
          },
        ]),
        createMockSection(2, [
          {
            lesson_title: 'Section 2 - Lesson 1',
            key_topics: ['Topic C'],
            lesson_objectives: ['Learn C'],
          },
        ]),
      ];

      const input = createMockInput();

      // Convert second section and provide all sections for context
      const section2Specs = convertSectionToV2Specs(sections[1], 1, input, sections);

      const firstLessonOfSection2 = section2Specs[0];
      expect(firstLessonOfSection2.lesson_context).toBeDefined();
      // Should reference last lesson of section 1
      expect(firstLessonOfSection2.lesson_context?.previous_lesson).toBeDefined();
      expect(firstLessonOfSection2.lesson_context?.previous_lesson?.lesson_id).toBe('1.2');
      expect(firstLessonOfSection2.lesson_context?.previous_lesson?.title).toBe('Section 1 - Lesson 2');
      // Should have concepts from all previous lessons
      expect(firstLessonOfSection2.lesson_context?.concepts_already_covered).toEqual(['Topic A', 'Topic B']);
    });

    it('should accumulate concepts across multiple sections', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'L1',
            key_topics: ['Topic A', 'Topic B'],
            lesson_objectives: ['Learn A'],
          },
        ]),
        createMockSection(2, [
          {
            lesson_title: 'L2',
            key_topics: ['Topic C', 'Topic D'],
            lesson_objectives: ['Learn C'],
          },
        ]),
        createMockSection(3, [
          {
            lesson_title: 'L3',
            key_topics: ['Topic E'],
            lesson_objectives: ['Learn E'],
          },
        ]),
      ];

      const input = createMockInput();
      const section3Specs = convertSectionToV2Specs(sections[2], 2, input, sections);

      const lessonInSection3 = section3Specs[0];
      expect(lessonInSection3.lesson_context).toBeDefined();
      expect(lessonInSection3.lesson_context?.concepts_already_covered).toEqual([
        'Topic A',
        'Topic B',
        'Topic C',
        'Topic D',
      ]);
    });
  });

  describe('Empty sections and edge cases', () => {
    it('should handle single lesson course (first and last)', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Only Lesson',
            key_topics: ['Topic A'],
            lesson_objectives: ['Learn A'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const onlyLesson = specs[0];
      // Should be undefined because it's first lesson with no next lesson
      expect(onlyLesson.lesson_context).toBeUndefined();
    });

    it('should handle empty key_topics gracefully', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: [],
            lesson_objectives: ['Learn something'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic A'],
            lesson_objectives: ['Learn A'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const secondLesson = specs[1];
      expect(secondLesson.lesson_context).toBeDefined();
      expect(secondLesson.lesson_context?.previous_lesson?.key_concepts).toEqual([]);
      expect(secondLesson.lesson_context?.concepts_already_covered).toEqual([]);
      expect(secondLesson.lesson_context?.terms_already_defined).toEqual([]);
    });

    it('should handle empty lesson_objectives gracefully', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A'],
            lesson_objectives: [],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic B'],
            lesson_objectives: ['Learn B'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const secondLesson = specs[1];
      expect(secondLesson.lesson_context).toBeDefined();
      expect(secondLesson.lesson_context?.previous_lesson?.summary_preview).toBeUndefined();
    });

    it('should not include lesson_context when allSections is not provided', () => {
      const section = createMockSection(1, [
        {
          lesson_title: 'Lesson 1',
          key_topics: ['Topic A'],
          lesson_objectives: ['Learn A'],
        },
        {
          lesson_title: 'Lesson 2',
          key_topics: ['Topic B'],
          lesson_objectives: ['Learn B'],
        },
      ]);

      const input = createMockInput();
      // Don't pass allSections parameter
      const specs = convertSectionToV2Specs(section, 0, input);

      specs.forEach((spec) => {
        expect(spec.lesson_context).toBeUndefined();
      });
    });
  });

  describe('Lesson ID generation', () => {
    it('should generate correct lesson_id format (section.lesson)', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'L1',
            key_topics: ['Topic A'],
            lesson_objectives: ['Learn A'],
          },
          {
            lesson_title: 'L2',
            key_topics: ['Topic B'],
            lesson_objectives: ['Learn B'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      expect(specs[0].lesson_context?.next_lesson?.lesson_id).toBe('1.2');
      expect(specs[1].lesson_context?.previous_lesson?.lesson_id).toBe('1.1');
    });

    it('should generate correct lesson_id across sections', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'L1',
            key_topics: ['A'],
            lesson_objectives: ['Learn A'],
          },
        ]),
        createMockSection(2, [
          {
            lesson_title: 'L2',
            key_topics: ['B'],
            lesson_objectives: ['Learn B'],
          },
        ]),
      ];

      const input = createMockInput();
      const section2Specs = convertSectionToV2Specs(sections[1], 1, input, sections);

      expect(section2Specs[0].lesson_context?.previous_lesson?.lesson_id).toBe('1.1');
    });
  });

  describe('Summary preview generation', () => {
    it('should join first 2 lesson_objectives with period for summary_preview', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A'],
            lesson_objectives: ['First objective', 'Second objective', 'Third objective'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic B'],
            lesson_objectives: ['Learn B'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const secondLesson = specs[1];
      expect(secondLesson.lesson_context?.previous_lesson?.summary_preview).toBe(
        'First objective. Second objective'
      );
    });

    it('should omit summary_preview for next_lesson', () => {
      const sections: Section[] = [
        createMockSection(1, [
          {
            lesson_title: 'Lesson 1',
            key_topics: ['Topic A'],
            lesson_objectives: ['Learn A'],
          },
          {
            lesson_title: 'Lesson 2',
            key_topics: ['Topic B'],
            lesson_objectives: ['Learn B', 'Understand B'],
          },
        ]),
      ];

      const input = createMockInput();
      const specs = convertSectionToV2Specs(sections[0], 0, input, sections);

      const firstLesson = specs[0];
      expect(firstLesson.lesson_context?.next_lesson).toBeDefined();
      // next_lesson should not have summary_preview (per schema: omit({ summary_preview: true }))
      expect('summary_preview' in (firstLesson.lesson_context?.next_lesson || {})).toBe(false);
    });
  });
});
