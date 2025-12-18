/**
 * Unit Tests for Field Name Fix Utility (field-name-fix.ts)
 *
 * Tests T025 requirements:
 * 1. fixFieldNames() maps camelCase → snake_case (courseTitle → course_title)
 * 2. fixFieldNames() handles nested objects and arrays (recursive transformation)
 * 3. Explicit mapping support for common field names
 * 4. Edge cases (primitives, null, undefined, arrays)
 *
 * @module tests/unit/stage5/field-name-fix.test
 */

import { describe, it, expect } from 'vitest';
import { fixFieldNames, fixFieldNamesWithLogging } from '@/stages/stage5-generation/utils/field-name-fix';

describe('fixFieldNames - Basic camelCase to snake_case', () => {
  it('should convert courseTitle to course_title', () => {
    const input = { courseTitle: 'Machine Learning Basics' };
    const result = fixFieldNames(input);

    expect(result).toEqual({ course_title: 'Machine Learning Basics' });
  });

  it('should convert targetAudience to target_audience', () => {
    const input = { targetAudience: 'Developers' };
    const result = fixFieldNames(input);

    expect(result).toEqual({ target_audience: 'Developers' });
  });

  it('should convert estimatedDurationMinutes to estimated_duration_minutes', () => {
    const input = { estimatedDurationMinutes: 120 };
    const result = fixFieldNames(input);

    expect(result).toEqual({ estimated_duration_minutes: 120 });
  });

  it('should leave snake_case fields unchanged', () => {
    const input = { course_title: 'ML Course', section_title: 'Intro' };
    const result = fixFieldNames(input);

    expect(result).toEqual({ course_title: 'ML Course', section_title: 'Intro' });
  });

  it('should handle multiple camelCase fields', () => {
    const input = {
      courseTitle: 'ML Course',
      targetAudience: 'Developers',
      difficultyLevel: 'intermediate',
    };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      course_title: 'ML Course',
      target_audience: 'Developers',
      difficulty_level: 'intermediate',
    });
  });
});

describe('fixFieldNames - Explicit field mappings', () => {
  it('should use explicit mapping for courseDescription', () => {
    const input = { courseDescription: 'A comprehensive ML course' };
    const result = fixFieldNames(input);

    expect(result).toEqual({ course_description: 'A comprehensive ML course' });
  });

  it('should use explicit mapping for learningOutcomes', () => {
    const input = { learningOutcomes: ['Learn ML', 'Build models'] };
    const result = fixFieldNames(input);

    expect(result).toEqual({ learning_outcomes: ['Learn ML', 'Build models'] });
  });

  it('should use explicit mapping for assessmentStrategy', () => {
    const input = { assessmentStrategy: 'Quizzes and projects' };
    const result = fixFieldNames(input);

    expect(result).toEqual({ assessment_strategy: 'Quizzes and projects' });
  });

  it('should use explicit mapping for sectionNumber', () => {
    const input = { sectionNumber: 1 };
    const result = fixFieldNames(input);

    expect(result).toEqual({ section_number: 1 });
  });

  it('should use explicit mapping for lessonObjectives', () => {
    const input = { lessonObjectives: ['Understand basics', 'Apply concepts'] };
    const result = fixFieldNames(input);

    expect(result).toEqual({ lesson_objectives: ['Understand basics', 'Apply concepts'] });
  });
});

describe('fixFieldNames - Nested objects', () => {
  it('should recursively fix nested object field names', () => {
    const input = {
      courseTitle: 'ML Course',
      metadata: {
        createdBy: 'User',
        lastModified: '2025-01-01',
      },
    };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      course_title: 'ML Course',
      metadata: {
        created_by: 'User',
        last_modified: '2025-01-01',
      },
    });
  });

  it('should handle deeply nested objects', () => {
    const input = {
      courseData: {
        sectionInfo: {
          lessonDetails: {
            lessonTitle: 'Introduction',
          },
        },
      },
    };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      course_data: {
        section_info: {
          lesson_details: {
            lesson_title: 'Introduction',
          },
        },
      },
    });
  });

  it('should handle multiple nested levels with mixed naming', () => {
    const input = {
      courseTitle: 'ML Course',
      sections: {
        sectionTitle: 'Intro',
        lessons: {
          lessonTitle: 'Basics',
        },
      },
    };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      course_title: 'ML Course',
      sections: {
        section_title: 'Intro',
        lessons: {
          lesson_title: 'Basics',
        },
      },
    });
  });
});

describe('fixFieldNames - Arrays', () => {
  it('should handle arrays of objects', () => {
    const input = {
      sections: [
        { sectionTitle: 'Section 1', sectionNumber: 1 },
        { sectionTitle: 'Section 2', sectionNumber: 2 },
      ],
    };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      sections: [
        { section_title: 'Section 1', section_number: 1 },
        { section_title: 'Section 2', section_number: 2 },
      ],
    });
  });

  it('should handle nested arrays', () => {
    const input = {
      courseSections: [
        {
          sectionTitle: 'Section 1',
          lessonList: [
            { lessonTitle: 'Lesson 1.1' },
            { lessonTitle: 'Lesson 1.2' },
          ],
        },
      ],
    };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      course_sections: [
        {
          section_title: 'Section 1',
          lesson_list: [
            { lesson_title: 'Lesson 1.1' },
            { lesson_title: 'Lesson 1.2' },
          ],
        },
      ],
    });
  });

  it('should handle arrays of primitives (strings)', () => {
    const input = {
      courseTags: ['machine-learning', 'python', 'data-science'],
    };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      course_tags: ['machine-learning', 'python', 'data-science'],
    });
  });

  it('should handle arrays of primitives (numbers)', () => {
    const input = {
      sectionNumbers: [1, 2, 3, 4],
    };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      section_numbers: [1, 2, 3, 4],
    });
  });

  it('should handle empty arrays', () => {
    const input = {
      learningOutcomes: [],
      courseTags: [],
    };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      learning_outcomes: [],
      course_tags: [],
    });
  });
});

describe('fixFieldNames - Primitives and special values', () => {
  it('should handle string values', () => {
    const input = { courseTitle: 'ML Course' };
    const result = fixFieldNames(input);

    expect(result.course_title).toBe('ML Course');
  });

  it('should handle number values', () => {
    const input = { estimatedHours: 10, sectionCount: 5 };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      estimated_hours: 10,
      section_count: 5,
    });
  });

  it('should handle boolean values', () => {
    const input = { isPublished: true, hasCertificate: false };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      is_published: true,
      has_certificate: false,
    });
  });

  it('should handle null values', () => {
    const input = { courseDescription: null };
    const result = fixFieldNames(input);

    expect(result).toEqual({ course_description: null });
  });

  it('should handle undefined values', () => {
    const input = { courseOverview: undefined };
    const result = fixFieldNames(input);

    expect(result).toEqual({ course_overview: undefined });
  });

  it('should return null for null input', () => {
    const result = fixFieldNames(null);

    expect(result).toBeNull();
  });

  it('should return undefined for undefined input', () => {
    const result = fixFieldNames(undefined);

    expect(result).toBeUndefined();
  });

  it('should return primitive values as-is', () => {
    expect(fixFieldNames('string')).toBe('string');
    expect(fixFieldNames(123)).toBe(123);
    expect(fixFieldNames(true)).toBe(true);
  });
});

describe('fixFieldNames - Real-world LLM output scenarios', () => {
  it('should fix complete course structure with camelCase fields', () => {
    const llmOutput = {
      courseTitle: 'Machine Learning Basics',
      courseDescription: 'Introduction to ML',
      targetAudience: 'Developers',
      estimatedDurationHours: 20,
      difficultyLevel: 'intermediate',
      prerequisites: ['Python', 'Math'],
      sections: [
        {
          sectionTitle: 'Introduction',
          sectionDescription: 'Getting started',
          estimatedDurationMinutes: 60,
          lessons: [
            {
              lessonTitle: 'What is ML?',
              lessonObjectives: ['Understand ML basics'],
              keyTopics: ['Supervised learning', 'Unsupervised learning'],
            },
          ],
        },
      ],
    };

    const result = fixFieldNames(llmOutput);

    expect(result).toEqual({
      course_title: 'Machine Learning Basics',
      course_description: 'Introduction to ML',
      target_audience: 'Developers',
      estimated_duration_hours: 20,
      difficulty_level: 'intermediate',
      prerequisites: ['Python', 'Math'],
      sections: [
        {
          section_title: 'Introduction',
          section_description: 'Getting started',
          estimated_duration_minutes: 60,
          lessons: [
            {
              lesson_title: 'What is ML?',
              lesson_objectives: ['Understand ML basics'],
              key_topics: ['Supervised learning', 'Unsupervised learning'],
            },
          ],
        },
      ],
    });
  });

  it('should fix metadata with nested assessment strategy', () => {
    const llmOutput = {
      courseTitle: 'Test Course',
      assessmentStrategy: {
        quizPerSection: true,
        finalExam: true,
        practicalProjects: 3,
        assessmentDescription: 'Comprehensive assessment',
      },
    };

    const result = fixFieldNames(llmOutput);

    expect(result).toEqual({
      course_title: 'Test Course',
      assessment_strategy: {
        quiz_per_section: true,
        final_exam: true,
        practical_projects: 3,
        assessment_description: 'Comprehensive assessment',
      },
    });
  });

  it('should handle partially camelCase output (mixed naming)', () => {
    const mixedOutput = {
      courseTitle: 'ML Course', // camelCase
      course_description: 'Description', // already snake_case
      targetAudience: 'Developers', // camelCase
      difficulty_level: 'intermediate', // already snake_case
    };

    const result = fixFieldNames(mixedOutput);

    expect(result).toEqual({
      course_title: 'ML Course',
      course_description: 'Description',
      target_audience: 'Developers',
      difficulty_level: 'intermediate',
    });
  });

  it('should handle LLM output with exercise fields', () => {
    const llmOutput = {
      exercises: [
        {
          exerciseType: 'coding',
          exerciseTitle: 'Build a classifier',
          exerciseDescription: 'Implement a decision tree',
          practicalExercises: ['Exercise 1', 'Exercise 2'],
        },
      ],
    };

    const result = fixFieldNames(llmOutput);

    expect(result).toEqual({
      exercises: [
        {
          exercise_type: 'coding',
          exercise_title: 'Build a classifier',
          exercise_description: 'Implement a decision tree',
          practical_exercises: ['Exercise 1', 'Exercise 2'],
        },
      ],
    });
  });
});

describe('fixFieldNames - Edge cases', () => {
  it('should handle empty object', () => {
    const input = {};
    const result = fixFieldNames(input);

    expect(result).toEqual({});
  });

  it('should handle single character keys', () => {
    const input = { a: 1, b: 2 };
    const result = fixFieldNames(input);

    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('should handle keys with numbers', () => {
    const input = { section1Title: 'Section 1', lesson2Content: 'Content' };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      section1_title: 'Section 1',
      lesson2_content: 'Content',
    });
  });

  it('should handle keys starting with uppercase', () => {
    const input = { CourseTitle: 'ML Course' };
    const result = fixFieldNames(input);

    expect(result).toEqual({ course_title: 'ML Course' });
  });

  it('should handle consecutive uppercase letters', () => {
    const input = { URLPath: '/course', HTTPMethod: 'GET' };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      u_r_l_path: '/course',
      h_t_t_p_method: 'GET',
    });
  });

  it('should handle already snake_case fields without modification', () => {
    const input = {
      course_title: 'ML Course',
      section_title: 'Introduction',
      lesson_objectives: ['Learn', 'Apply'],
    };
    const result = fixFieldNames(input);

    expect(result).toEqual({
      course_title: 'ML Course',
      section_title: 'Introduction',
      lesson_objectives: ['Learn', 'Apply'],
    });
  });

  it('should preserve field order', () => {
    const input = {
      courseTitle: 'Course',
      targetAudience: 'Audience',
      difficultyLevel: 'Level',
    };
    const result = fixFieldNames(input);
    const keys = Object.keys(result);

    expect(keys).toEqual(['course_title', 'target_audience', 'difficulty_level']);
  });
});

describe('fixFieldNames - Type preservation', () => {
  it('should preserve number types', () => {
    const input = { estimatedHours: 10, sectionCount: 5, price: 99.99 };
    const result = fixFieldNames(input);

    expect(typeof result.estimated_hours).toBe('number');
    expect(typeof result.section_count).toBe('number');
    expect(typeof result.price).toBe('number');
  });

  it('should preserve boolean types', () => {
    const input = { isPublished: true, hasCertificate: false };
    const result = fixFieldNames(input);

    expect(typeof result.is_published).toBe('boolean');
    expect(typeof result.has_certificate).toBe('boolean');
  });

  it('should preserve array types', () => {
    const input = { courseTags: ['tag1', 'tag2'], sectionNumbers: [1, 2, 3] };
    const result = fixFieldNames(input);

    expect(Array.isArray(result.course_tags)).toBe(true);
    expect(Array.isArray(result.section_numbers)).toBe(true);
  });

  it('should preserve object types', () => {
    const input = {
      metadata: { createdBy: 'User' },
      assessmentStrategy: { quizPerSection: true },
    };
    const result = fixFieldNames(input);

    expect(typeof result.metadata).toBe('object');
    expect(typeof result.assessment_strategy).toBe('object');
  });
});

describe('fixFieldNamesWithLogging - Logging functionality', () => {
  it('should transform fields same as fixFieldNames', () => {
    const input = { courseTitle: 'ML Course', targetAudience: 'Developers' };
    const result = fixFieldNamesWithLogging(input);

    expect(result).toEqual({
      course_title: 'ML Course',
      target_audience: 'Developers',
    });
  });

  it('should handle nested objects with logging', () => {
    const input = {
      courseTitle: 'ML Course',
      sections: [{ sectionTitle: 'Intro' }],
    };
    const result = fixFieldNamesWithLogging(input, 'metadata');

    expect(result).toEqual({
      course_title: 'ML Course',
      sections: [{ section_title: 'Intro' }],
    });
  });

  it('should handle already snake_case with logging', () => {
    const input = { course_title: 'ML Course', section_title: 'Intro' };
    const result = fixFieldNamesWithLogging(input, 'no-changes');

    expect(result).toEqual({
      course_title: 'ML Course',
      section_title: 'Intro',
    });
  });
});

describe('fixFieldNames - Performance and stress tests', () => {
  it('should handle large objects efficiently', () => {
    const largeObject: any = {};
    for (let i = 0; i < 1000; i++) {
      largeObject[`fieldName${i}`] = `value${i}`;
    }

    const result = fixFieldNames(largeObject);

    expect(Object.keys(result)).toHaveLength(1000);
    expect(result.field_name0).toBe('value0');
    expect(result.field_name999).toBe('value999');
  });

  it('should handle deeply nested structures (10 levels)', () => {
    const deepNested = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: {
                  level7: {
                    level8: {
                      level9: {
                        level10: { deepValue: 'value' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = fixFieldNames(deepNested);

    expect(result.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.deep_value).toBe(
      'value'
    );
  });

  it('should handle large arrays of objects', () => {
    const largeArray = {
      sections: Array(100)
        .fill(null)
        .map((_, i) => ({
          sectionTitle: `Section ${i}`,
          sectionNumber: i,
        })),
    };

    const result = fixFieldNames(largeArray);

    expect(result.sections).toHaveLength(100);
    expect(result.sections[0]).toEqual({
      section_title: 'Section 0',
      section_number: 0,
    });
    expect(result.sections[99]).toEqual({
      section_title: 'Section 99',
      section_number: 99,
    });
  });
});
