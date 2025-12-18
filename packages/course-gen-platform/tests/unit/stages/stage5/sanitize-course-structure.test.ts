/**
 * Unit tests for sanitizeCourseStructure (FR-008 XSS Prevention)
 *
 * Tests XSS sanitization for CourseStructure using DOMPurify
 *
 * @see packages/course-gen-platform/src/services/stage5/sanitize-course-structure.ts
 * @see specs/008-generation-generation-json/spec.md (FR-008)
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeCourseStructure,
  sanitizeCourseStructureWithLogging,
} from '../../../src/stages/stage5-generation/utils/sanitize-course-structure';
import type { CourseStructure } from '@megacampus/shared-types/generation-result';

describe('sanitizeCourseStructure (FR-008 XSS Prevention)', () => {
  // ============================================================================
  // BASIC SANITIZATION TESTS
  // ============================================================================

  describe('Basic XSS Vector Removal', () => {
    it('should remove <script> tags from course_title', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: "<script>alert('XSS')</script>Machine Learning Course",
        course_description: 'Learn ML basics',
        course_overview: 'Comprehensive overview',
        target_audience: 'Developers',
        estimated_duration_hours: 10,
        difficulty_level: 'intermediate',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructure(malicious as CourseStructure);

      expect(clean.course_title).toBe('Machine Learning Course');
      expect(clean.course_title).not.toContain('<script>');
      expect(clean.course_title).not.toContain('alert');
    });

    it('should remove <img> with onerror from course_description', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: 'ML Course',
        course_description: '<img src=x onerror=alert(1)>Learn machine learning',
        course_overview: 'Overview',
        target_audience: 'Students',
        estimated_duration_hours: 10,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructure(malicious as CourseStructure);

      expect(clean.course_description).toBe('Learn machine learning');
      expect(clean.course_description).not.toContain('<img');
      expect(clean.course_description).not.toContain('onerror');
    });

    it('should remove onclick handlers from course_overview', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: 'Python Course',
        course_description: 'Learn Python',
        course_overview: "<p onclick='evilFunction()'>Comprehensive Python course</p>",
        target_audience: 'Beginners',
        estimated_duration_hours: 20,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructure(malicious as CourseStructure);

      expect(clean.course_overview).toBe('Comprehensive Python course');
      expect(clean.course_overview).not.toContain('<p>');
      expect(clean.course_overview).not.toContain('onclick');
    });

    it('should remove javascript: protocol from links', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: 'JS Course',
        course_description: 'Learn JavaScript',
        course_overview: '<a href="javascript:alert(1)">Click here</a> to start',
        target_audience: 'Developers',
        estimated_duration_hours: 15,
        difficulty_level: 'intermediate',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructure(malicious as CourseStructure);

      expect(clean.course_overview).toBe('Click here to start');
      expect(clean.course_overview).not.toContain('javascript:');
      expect(clean.course_overview).not.toContain('<a');
    });
  });

  // ============================================================================
  // NESTED STRUCTURE SANITIZATION
  // ============================================================================

  describe('Nested Structure Sanitization', () => {
    it('should sanitize section titles and descriptions', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: 'Course',
        course_description: 'Description',
        course_overview: 'Overview',
        target_audience: 'Target',
        estimated_duration_hours: 10,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [
          {
            section_number: 1,
            section_title: "<script>alert('section')</script>Introduction",
            section_description: '<b>Bold</b> description <script>evil</script>',
            learning_objectives: [],
            estimated_duration_minutes: 60,
            lessons: [],
          },
        ],
      };

      const clean = sanitizeCourseStructure(malicious as CourseStructure);

      expect(clean.sections[0].section_title).toBe('Introduction');
      expect(clean.sections[0].section_description).toBe('Bold description ');
      expect(clean.sections[0].section_title).not.toContain('<script>');
    });

    it('should sanitize lesson titles and objectives', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: 'Course',
        course_description: 'Description',
        course_overview: 'Overview',
        target_audience: 'Target',
        estimated_duration_hours: 10,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [
          {
            section_number: 1,
            section_title: 'Introduction',
            section_description: 'Section description',
            learning_objectives: [],
            estimated_duration_minutes: 60,
            lessons: [
              {
                lesson_number: 1,
                lesson_title: '<img src=x onerror=alert(1)>ML Basics',
                lesson_objectives: [
                  "<p onclick='x()'>Understand ML</p>",
                  '<script>alert()</script>Apply algorithms',
                ],
                key_topics: ['<b>Topic</b> 1', '<script>evil</script>Topic 2'],
                estimated_duration_minutes: 15,
                practical_exercises: [],
              },
            ],
          },
        ],
      };

      const clean = sanitizeCourseStructure(malicious as CourseStructure);

      const lesson = clean.sections[0].lessons[0];
      expect(lesson.lesson_title).toBe('ML Basics');
      expect(lesson.lesson_objectives[0]).toBe('Understand ML');
      expect(lesson.lesson_objectives[1]).toBe('Apply algorithms');
      expect(lesson.key_topics[0]).toBe('Topic 1');
      expect(lesson.key_topics[1]).toBe('Topic 2');
    });

    it('should sanitize exercise descriptions', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: 'Course',
        course_description: 'Description',
        course_overview: 'Overview',
        target_audience: 'Target',
        estimated_duration_hours: 10,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [
          {
            section_number: 1,
            section_title: 'Section',
            section_description: 'Comprehensive section description with details',
            learning_objectives: [],
            estimated_duration_minutes: 60,
            lessons: [
              {
                lesson_number: 1,
                lesson_title: 'Lesson',
                lesson_objectives: ['Objective'],
                key_topics: ['Topic 1', 'Topic 2'],
                estimated_duration_minutes: 15,
                practical_exercises: [
                  {
                    exercise_type: 'hands_on',
                    exercise_title: '<script>alert()</script>Exercise 1',
                    exercise_description: '<img src=x onerror=alert(1)>Complete the task',
                  },
                  {
                    exercise_type: 'quiz',
                    exercise_title: "<p onclick='x()'>Exercise 2</p>",
                    exercise_description: '<b>Answer</b> the <script>evil</script> questions',
                  },
                ],
              },
            ],
          },
        ],
      };

      const clean = sanitizeCourseStructure(malicious as CourseStructure);

      const exercises = clean.sections[0].lessons[0].practical_exercises;
      expect(exercises[0].exercise_title).toBe('Exercise 1');
      expect(exercises[0].exercise_description).toBe('Complete the task');
      expect(exercises[1].exercise_title).toBe('Exercise 2');
      expect(exercises[1].exercise_description).toBe('Answer the  questions');
    });
  });

  // ============================================================================
  // ARRAY SANITIZATION
  // ============================================================================

  describe('Array Sanitization', () => {
    it('should sanitize prerequisites array', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: 'Course',
        course_description: 'Description',
        course_overview: 'Overview',
        target_audience: 'Target',
        estimated_duration_hours: 10,
        difficulty_level: 'beginner',
        prerequisites: [
          '<script>alert()</script>Basic Python',
          '<img src=x onerror=alert(1)>Statistics',
          "<p onclick='x()'>Linear Algebra</p>",
        ],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructure(malicious as CourseStructure);

      expect(clean.prerequisites[0]).toBe('Basic Python');
      expect(clean.prerequisites[1]).toBe('Statistics');
      expect(clean.prerequisites[2]).toBe('Linear Algebra');
    });

    it('should sanitize learning_outcomes array', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: 'Course',
        course_description: 'Description',
        course_overview: 'Overview',
        target_audience: 'Target',
        estimated_duration_hours: 10,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [
          '<b>Implement</b> ML <script>alert()</script> algorithms',
          '<img src=x onerror=alert(1)>Build neural networks',
          "<p onclick='x()'>Evaluate model performance</p>",
        ],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructure(malicious as CourseStructure);

      expect(clean.learning_outcomes[0]).toBe('Implement ML  algorithms');
      expect(clean.learning_outcomes[1]).toBe('Build neural networks');
      expect(clean.learning_outcomes[2]).toBe('Evaluate model performance');
    });

    it('should sanitize course_tags array', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: 'Course',
        course_description: 'Description',
        course_overview: 'Overview',
        target_audience: 'Target',
        estimated_duration_hours: 10,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [
          '<script>machine-learning</script>',
          '<img src=x onerror=alert(1)>python',
          "<p onclick='x()'>data-science</p>",
        ],
        sections: [],
      };

      const clean = sanitizeCourseStructure(malicious as CourseStructure);

      // <script> tags are security risks - DOMPurify removes them AND their content
      // This is the correct security-first behavior
      expect(clean.course_tags[0]).toBe('');
      expect(clean.course_tags[1]).toBe('python');
      expect(clean.course_tags[2]).toBe('data-science');
    });
  });

  // ============================================================================
  // PRESERVATION TESTS
  // ============================================================================

  describe('Content Preservation', () => {
    it('should preserve non-HTML text content', () => {
      const clean: Partial<CourseStructure> = {
        course_title: 'Machine Learning Course',
        course_description: 'Learn the fundamentals of machine learning',
        course_overview: 'A comprehensive introduction',
        target_audience: 'Developers and data scientists',
        estimated_duration_hours: 10,
        difficulty_level: 'intermediate',
        prerequisites: ['Basic Python', 'Statistics'],
        learning_outcomes: ['Implement algorithms', 'Evaluate models'],
        assessment_strategy: {
          quiz_per_section: true,
          final_exam: false,
          practical_projects: 3,
          assessment_description: 'Hands-on projects and quizzes',
        },
        course_tags: ['machine-learning', 'python', 'data-science'],
        sections: [],
      };

      const sanitized = sanitizeCourseStructure(clean as CourseStructure);

      expect(sanitized.course_title).toBe(clean.course_title);
      expect(sanitized.course_description).toBe(clean.course_description);
      expect(sanitized.prerequisites).toEqual(clean.prerequisites);
      expect(sanitized.learning_outcomes).toEqual(clean.learning_outcomes);
    });

    it('should preserve numbers and booleans', () => {
      const input: Partial<CourseStructure> = {
        course_title: 'Course',
        course_description: 'Description',
        course_overview: 'Overview',
        target_audience: 'Target',
        estimated_duration_hours: 42.5,
        difficulty_level: 'advanced',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: true,
          final_exam: false,
          practical_projects: 5,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructure(input as CourseStructure);

      expect(clean.estimated_duration_hours).toBe(42.5);
      expect(clean.assessment_strategy.quiz_per_section).toBe(true);
      expect(clean.assessment_strategy.final_exam).toBe(false);
      expect(clean.assessment_strategy.practical_projects).toBe(5);
    });
  });

  // ============================================================================
  // IMMUTABILITY TESTS
  // ============================================================================

  describe('Immutability', () => {
    it('should return a new object (not mutate original)', () => {
      const original: Partial<CourseStructure> = {
        course_title: '<script>alert()</script>ML Course',
        course_description: 'Description',
        course_overview: 'Overview',
        target_audience: 'Target',
        estimated_duration_hours: 10,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const originalTitle = original.course_title;
      const clean = sanitizeCourseStructure(original as CourseStructure);

      // Original should remain unchanged
      expect(original.course_title).toBe(originalTitle);
      expect(original.course_title).toContain('<script>');

      // Cleaned should be different
      expect(clean.course_title).not.toBe(original.course_title);
      expect(clean.course_title).not.toContain('<script>');
    });
  });

  // ============================================================================
  // LOGGING VARIANT TESTS
  // ============================================================================

  describe('sanitizeCourseStructureWithLogging', () => {
    it('should sanitize and log when XSS vectors are present', () => {
      const malicious: Partial<CourseStructure> = {
        course_title: "<script>alert('XSS')</script>ML Course",
        course_description: 'Learn ML',
        course_overview: 'Overview',
        target_audience: 'Developers',
        estimated_duration_hours: 10,
        difficulty_level: 'intermediate',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructureWithLogging(malicious as CourseStructure);

      expect(clean.course_title).toBe('ML Course');
      expect(clean.course_title).not.toContain('<script>');
    });

    it('should work with clean input', () => {
      const clean: Partial<CourseStructure> = {
        course_title: 'ML Course',
        course_description: 'Learn ML',
        course_overview: 'Overview',
        target_audience: 'Developers',
        estimated_duration_hours: 10,
        difficulty_level: 'intermediate',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const sanitized = sanitizeCourseStructureWithLogging(clean as CourseStructure);

      expect(sanitized.course_title).toBe('ML Course');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const input: Partial<CourseStructure> = {
        course_title: '',
        course_description: 'Description',
        course_overview: 'Overview',
        target_audience: '',
        estimated_duration_hours: 10,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: '',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructure(input as CourseStructure);

      expect(clean.course_title).toBe('');
      expect(clean.target_audience).toBe('');
      expect(clean.assessment_strategy.assessment_description).toBe('');
    });

    it('should handle empty arrays', () => {
      const input: Partial<CourseStructure> = {
        course_title: 'Course',
        course_description: 'Description',
        course_overview: 'Overview',
        target_audience: 'Target',
        estimated_duration_hours: 10,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructure(input as CourseStructure);

      expect(clean.prerequisites).toEqual([]);
      expect(clean.learning_outcomes).toEqual([]);
      expect(clean.course_tags).toEqual([]);
      expect(clean.sections).toEqual([]);
    });

    it('should handle special characters', () => {
      const input: Partial<CourseStructure> = {
        course_title: 'ML & AI: 50% Theory + 50% Practice',
        course_description: 'Learn ML/AI with hands-on examples (2025)',
        course_overview: 'Overview with <angle brackets> and "quotes"',
        target_audience: 'Developers',
        estimated_duration_hours: 10,
        difficulty_level: 'intermediate',
        prerequisites: [],
        learning_outcomes: [],
        assessment_strategy: {
          quiz_per_section: false,
          final_exam: false,
          practical_projects: 0,
          assessment_description: 'Assessment',
        },
        course_tags: [],
        sections: [],
      };

      const clean = sanitizeCourseStructure(input as CourseStructure);

      // DOMPurify should preserve safe special characters
      expect(clean.course_title).toContain('&');
      expect(clean.course_title).toContain('%');
      expect(clean.course_description).toContain('(2025)');
      expect(clean.course_overview).toContain('"quotes"');
    });
  });
});
