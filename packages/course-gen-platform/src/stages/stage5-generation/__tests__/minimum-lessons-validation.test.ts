/**
 * Unit tests for FR-015 Minimum Lessons Validation
 *
 * Tests CourseStructureSchema .refine() validation for minimum 10 lessons requirement
 *
 * @see packages/shared-types/src/generation-result.ts (CourseStructureSchema)
 * @see specs/008-generation-generation-json/spec.md (FR-015)
 */

import { describe, it, expect } from 'vitest';
import { CourseStructureSchema } from '@megacampus/shared-types/generation-result';
import type { CourseStructure } from '@megacampus/shared-types/generation-result';

describe('FR-015: Minimum Lessons Validation', () => {
  /**
   * Helper to create valid CourseStructure with specified lesson count
   */
  function createCourseWithLessons(lessonCount: number): CourseStructure {
    // Distribute lessons across sections (3-5 lessons per section)
    const sectionsCount = Math.ceil(lessonCount / 4);
    const lessonsPerSection = Math.floor(lessonCount / sectionsCount);
    const remainder = lessonCount % sectionsCount;

    const sections = [];
    let globalLessonNumber = 1;

    for (let sectionNum = 1; sectionNum <= sectionsCount; sectionNum++) {
      const lessons = [];
      const lessonCountForSection = lessonsPerSection + (sectionNum <= remainder ? 1 : 0);

      for (let lessonNum = 0; lessonNum < lessonCountForSection; lessonNum++) {
        lessons.push({
          lesson_number: globalLessonNumber++,
          lesson_title: `Lesson ${globalLessonNumber - 1} Title`,
          lesson_objectives: [
            'Objective 1',
            'Objective 2',
            'Objective 3',
          ],
          key_topics: ['Topic 1', 'Topic 2', 'Topic 3'],
          estimated_duration_minutes: 15,
          practical_exercises: [
            {
              exercise_type: 'hands_on',
              exercise_title: 'Exercise 1',
              exercise_description: 'Complete the hands-on exercise',
            },
            {
              exercise_type: 'quiz',
              exercise_title: 'Exercise 2',
              exercise_description: 'Answer the quiz questions',
            },
            {
              exercise_type: 'discussion',
              exercise_title: 'Exercise 3',
              exercise_description: 'Participate in the discussion',
            },
          ],
        });
      }

      sections.push({
        section_number: sectionNum,
        section_title: `Section ${sectionNum} Title`,
        section_description: `Description for section ${sectionNum} with sufficient length`,
        learning_objectives: ['Section objective 1', 'Section objective 2'],
        estimated_duration_minutes: lessonCountForSection * 15,
        lessons,
      });
    }

    return {
      course_title: 'Test Course',
      course_description: 'Test course description for FR-015 validation',
      course_overview: 'Comprehensive test course overview covering all topics',
      target_audience: 'Test audience for validation',
      estimated_duration_hours: lessonCount * 0.25, // 15 min per lesson
      difficulty_level: 'intermediate',
      prerequisites: ['Basic knowledge', 'Test prerequisite'],
      learning_outcomes: [
        'Learning outcome 1',
        'Learning outcome 2',
        'Learning outcome 3',
      ],
      assessment_strategy: {
        quiz_per_section: true,
        final_exam: false,
        practical_projects: 2,
        assessment_description: 'Test assessment strategy description',
      },
      course_tags: ['test', 'validation', 'fr-015', 'minimum-lessons', 'course-structure'],
      sections,
    };
  }

  // ============================================================================
  // VALIDATION SUCCESS TESTS (≥10 lessons)
  // ============================================================================

  describe('Valid Courses (≥10 lessons)', () => {
    it('should PASS validation with exactly 10 lessons (FR-015 minimum)', () => {
      const courseWith10Lessons = createCourseWithLessons(10);
      const result = CourseStructureSchema.safeParse(courseWith10Lessons);

      expect(result.success).toBe(true);

      if (result.success) {
        const totalLessons = result.data.sections.reduce(
          (sum, section) => sum + section.lessons.length,
          0
        );
        expect(totalLessons).toBe(10);
      }
    });

    it('should PASS validation with 12 lessons', () => {
      const courseWith12Lessons = createCourseWithLessons(12);
      const result = CourseStructureSchema.safeParse(courseWith12Lessons);

      expect(result.success).toBe(true);

      if (result.success) {
        const totalLessons = result.data.sections.reduce(
          (sum, section) => sum + section.lessons.length,
          0
        );
        expect(totalLessons).toBe(12);
      }
    });

    it('should PASS validation with 20 lessons', () => {
      const courseWith20Lessons = createCourseWithLessons(20);
      const result = CourseStructureSchema.safeParse(courseWith20Lessons);

      expect(result.success).toBe(true);

      if (result.success) {
        const totalLessons = result.data.sections.reduce(
          (sum, section) => sum + section.lessons.length,
          0
        );
        expect(totalLessons).toBe(20);
      }
    });

    it('should PASS validation with 50 lessons (large course)', () => {
      const courseWith50Lessons = createCourseWithLessons(50);
      const result = CourseStructureSchema.safeParse(courseWith50Lessons);

      expect(result.success).toBe(true);

      if (result.success) {
        const totalLessons = result.data.sections.reduce(
          (sum, section) => sum + section.lessons.length,
          0
        );
        expect(totalLessons).toBe(50);
      }
    });
  });

  // ============================================================================
  // VALIDATION FAILURE TESTS (<10 lessons)
  // ============================================================================

  describe('Invalid Courses (<10 lessons)', () => {
    it('should FAIL validation with 0 lessons', () => {
      const courseWith0Lessons = createCourseWithLessons(0);
      const result = CourseStructureSchema.safeParse(courseWith0Lessons);

      expect(result.success).toBe(false);

      if (!result.success) {
        const errors = result.error.format();
        expect(JSON.stringify(errors)).toContain('FR-015');
        expect(JSON.stringify(errors)).toContain('minimum 10 lessons');
      }
    });

    it('should FAIL validation with 5 lessons (50% below minimum)', () => {
      const courseWith5Lessons = createCourseWithLessons(5);
      const result = CourseStructureSchema.safeParse(courseWith5Lessons);

      expect(result.success).toBe(false);

      if (!result.success) {
        const errors = result.error.format();
        expect(JSON.stringify(errors)).toContain('FR-015');
      }
    });

    it('should FAIL validation with 9 lessons (1 below minimum)', () => {
      const courseWith9Lessons = createCourseWithLessons(9);
      const result = CourseStructureSchema.safeParse(courseWith9Lessons);

      expect(result.success).toBe(false);

      if (!result.success) {
        const errors = result.error.format();
        const errorString = JSON.stringify(errors);
        expect(errorString).toContain('FR-015');
        expect(errorString).toContain('minimum 10 lessons');
      }
    });

    it('should FAIL validation with 8 lessons (partial acceptance threshold)', () => {
      const courseWith8Lessons = createCourseWithLessons(8);
      const result = CourseStructureSchema.safeParse(courseWith8Lessons);

      expect(result.success).toBe(false);

      if (!result.success) {
        const totalLessons = courseWith8Lessons.sections.reduce(
          (sum, section) => sum + section.lessons.length,
          0
        );

        expect(totalLessons).toBe(8);

        const errors = result.error.format();
        expect(JSON.stringify(errors)).toContain('FR-015');
      }
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should count lessons across multiple sections correctly', () => {
      const course = createCourseWithLessons(15);

      // Verify lesson count calculation
      const totalLessons = course.sections.reduce(
        (sum, section) => sum + section.lessons.length,
        0
      );

      expect(totalLessons).toBe(15);

      // Verify validation passes
      const result = CourseStructureSchema.safeParse(course);
      expect(result.success).toBe(true);
    });

    it('should validate lesson count with single section containing 10 lessons', () => {
      const course: CourseStructure = {
        course_title: 'Single Section Course',
        course_description: 'Course with all lessons in one section',
        course_overview: 'Comprehensive overview for single section course',
        target_audience: 'Beginners and intermediate learners',
        estimated_duration_hours: 2.5,
        difficulty_level: 'beginner',
        prerequisites: ['Prerequisite'],
        learning_outcomes: ['Learning outcome 1', 'Learning outcome 2', 'Learning outcome 3'],
        assessment_strategy: {
          quiz_per_section: true,
          final_exam: false,
          practical_projects: 1,
          assessment_description: 'Assessment description',
        },
        course_tags: ['test', 'single-section', 'tag3', 'tag4', 'tag5'],
        sections: [
          {
            section_number: 1,
            section_title: 'Single Section Title',
            section_description: 'Only section in the course with sufficient description',
            learning_objectives: ['Section objective'],
            estimated_duration_minutes: 150,
            lessons: Array.from({ length: 10 }, (_, i) => ({
              lesson_number: i + 1,
              lesson_title: `Lesson ${i + 1} Title`,
              lesson_objectives: ['Objective 1', 'Objective 2'],
              key_topics: ['Topic 1', 'Topic 2'],
              estimated_duration_minutes: 15,
              practical_exercises: [
                {
                  exercise_type: 'hands_on',
                  exercise_title: 'Exercise',
                  exercise_description: 'Complete the exercise',
                },
                {
                  exercise_type: 'quiz',
                  exercise_title: 'Quiz Exercise',
                  exercise_description: 'Answer the quiz',
                },
                {
                  exercise_type: 'discussion',
                  exercise_title: 'Discussion',
                  exercise_description: 'Discuss the topic',
                },
              ],
            })),
          },
        ],
      };

      const result = CourseStructureSchema.safeParse(course);
      if (!result.success) {
        console.log('Single section validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
      expect(result.success).toBe(true);
    });

    it('should validate lesson count with uneven distribution across sections', () => {
      const course: CourseStructure = {
        course_title: 'Uneven Distribution Course',
        course_description: 'Course with varying lessons per section',
        course_overview: 'Comprehensive overview for uneven distribution course',
        target_audience: 'Intermediate and advanced learners',
        estimated_duration_hours: 3,
        difficulty_level: 'intermediate',
        prerequisites: ['Prerequisite 1'],
        learning_outcomes: ['Learning outcome 1', 'Learning outcome 2', 'Learning outcome 3'],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: true,
          practical_projects: 2,
          assessment_description: 'Assessment description',
        },
        course_tags: ['test', 'uneven', 'tag3', 'tag4', 'tag5'],
        sections: [
          {
            section_number: 1,
            section_title: 'Section 1 Title (2 lessons)',
            section_description: 'First section with 2 lessons and sufficient description',
            learning_objectives: ['Objective 1'],
            estimated_duration_minutes: 30,
            lessons: Array.from({ length: 2 }, (_, i) => ({
              lesson_number: i + 1,
              lesson_title: `Lesson ${i + 1} Title`,
              lesson_objectives: ['Objective 1', 'Objective 2'],
              key_topics: ['Topic 1', 'Topic 2'],
              estimated_duration_minutes: 15,
              practical_exercises: [
                {
                  exercise_type: 'hands_on',
                  exercise_title: 'Exercise',
                  exercise_description: 'Exercise description',
                },
                {
                  exercise_type: 'quiz',
                  exercise_title: 'Quiz Exercise',
                  exercise_description: 'Quiz description',
                },
                {
                  exercise_type: 'discussion',
                  exercise_title: 'Discussion',
                  exercise_description: 'Discussion description',
                },
              ],
            })),
          },
          {
            section_number: 2,
            section_title: 'Section 2 Title (5 lessons)',
            section_description: 'Second section with 5 lessons and sufficient description',
            learning_objectives: ['Objective 1'],
            estimated_duration_minutes: 75,
            lessons: Array.from({ length: 5 }, (_, i) => ({
              lesson_number: i + 3,
              lesson_title: `Lesson ${i + 3} Title`,
              lesson_objectives: ['Objective 1', 'Objective 2'],
              key_topics: ['Topic 1', 'Topic 2'],
              estimated_duration_minutes: 15,
              practical_exercises: [
                {
                  exercise_type: 'hands_on',
                  exercise_title: 'Exercise',
                  exercise_description: 'Exercise description',
                },
                {
                  exercise_type: 'quiz',
                  exercise_title: 'Quiz Exercise',
                  exercise_description: 'Quiz description',
                },
                {
                  exercise_type: 'self_assessment',
                  exercise_title: 'Self Assessment',
                  exercise_description: 'Assessment description',
                },
              ],
            })),
          },
          {
            section_number: 3,
            section_title: 'Section 3 Title (3 lessons)',
            section_description: 'Third section with 3 lessons and sufficient description',
            learning_objectives: ['Objective 1'],
            estimated_duration_minutes: 45,
            lessons: Array.from({ length: 3 }, (_, i) => ({
              lesson_number: i + 8,
              lesson_title: `Lesson ${i + 8} Title`,
              lesson_objectives: ['Objective 1', 'Objective 2'],
              key_topics: ['Topic 1', 'Topic 2'],
              estimated_duration_minutes: 15,
              practical_exercises: [
                {
                  exercise_type: 'case_study',
                  exercise_title: 'Case Study',
                  exercise_description: 'Study description',
                },
                {
                  exercise_type: 'simulation',
                  exercise_title: 'Simulation',
                  exercise_description: 'Simulation description',
                },
                {
                  exercise_type: 'reflection',
                  exercise_title: 'Reflection',
                  exercise_description: 'Reflection description',
                },
              ],
            })),
          },
        ],
      };

      // Total: 2 + 5 + 3 = 10 lessons
      const totalLessons = course.sections.reduce(
        (sum, section) => sum + section.lessons.length,
        0
      );
      expect(totalLessons).toBe(10);

      const result = CourseStructureSchema.safeParse(course);
      if (!result.success) {
        console.log('Uneven distribution validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // ERROR MESSAGE TESTS
  // ============================================================================

  describe('Error Messages', () => {
    it('should provide clear error message for FR-015 violation', () => {
      const courseWith7Lessons = createCourseWithLessons(7);
      const result = CourseStructureSchema.safeParse(courseWith7Lessons);

      expect(result.success).toBe(false);

      if (!result.success) {
        const errorMessage = JSON.stringify(result.error.format());

        // Check that error message contains FR-015 reference
        expect(errorMessage).toContain('FR-015');

        // Check that error message mentions minimum 10 lessons
        expect(errorMessage).toMatch(/minimum.*10.*lesson/i);

        // Check that error is associated with sections path
        expect(result.error.errors[0].path).toContain('sections');
      }
    });

    it('should include specific error details', () => {
      const courseWith1Lesson = createCourseWithLessons(1);
      const result = CourseStructureSchema.safeParse(courseWith1Lesson);

      expect(result.success).toBe(false);

      if (!result.success) {
        const error = result.error.errors[0];

        // Verify error message
        expect(error.message).toBe('Course must have minimum 10 lessons total across all sections (FR-015)');

        // Verify error path
        expect(error.path).toEqual(['sections']);

        // Verify error code
        expect(error.code).toBe('custom');
      }
    });
  });
});
