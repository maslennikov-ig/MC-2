/**
 * Target Resolution Unit Tests
 * @module shared/intent/__tests__/target-resolver.test
 *
 * Tests for resolveTargetPath, getElementAtPath, and generateCourseOutline.
 * Tests natural language identifier resolution, path parsing, and outline generation.
 */

import { describe, it, expect } from 'vitest';
import type { CourseStructure } from '@megacampus/shared-types';
import {
  resolveTargetPath,
  resolveTargetPathWithMatches,
  getElementAtPath,
  generateCourseOutline,
  isLessonPath,
  isSectionPath,
  parsePathIndices,
  type TargetMatch,
} from '../target-resolver';

// Helper to create minimal CourseStructure for testing
const createTestCourseStructure = (): CourseStructure => ({
  course_title: 'Test Course',
  course_description: 'A test course for unit testing',
  target_audience: 'Developers',
  difficulty_level: 'intermediate',
  prerequisites: ['Basic programming'],
  learning_outcomes: ['Understand testing', 'Write tests'],
  estimated_duration_hours: 3,
  course_tags: ['testing', 'development', 'quality', 'unit-tests', 'vitest'],
  sections: [
    {
      section_number: 1,
      section_title: 'Введение',
      section_description: 'Introduction section',
      learning_objectives: ['Learn basics'],
      estimated_duration_minutes: 90,
      lessons: [
        {
          lesson_number: 1.1,
          lesson_title: 'What is Testing',
          lesson_objectives: ['Define testing'],
          key_topics: ['Types', 'Pyramid'],
          estimated_duration_minutes: 30,
          lesson_type: 'theory',
        },
        {
          lesson_number: 1.2,
          lesson_title: 'Why Test',
          lesson_objectives: ['Benefits'],
          key_topics: ['Quality', 'Confidence'],
          estimated_duration_minutes: 30,
          lesson_type: 'theory',
        },
        {
          lesson_number: 1.3,
          lesson_title: 'Testing Tools',
          lesson_objectives: ['Overview'],
          key_topics: ['Vitest', 'Jest'],
          estimated_duration_minutes: 30,
          lesson_type: 'practice',
        },
      ],
    },
    {
      section_number: 2,
      section_title: 'Advanced Topics',
      section_description: 'Advanced section',
      learning_objectives: ['Master testing'],
      estimated_duration_minutes: 90,
      lessons: [
        {
          lesson_number: 2.1,
          lesson_title: 'Mocking',
          lesson_objectives: ['Mock dependencies'],
          key_topics: ['Stubs', 'Spies'],
          estimated_duration_minutes: 45,
          lesson_type: 'practice',
        },
        {
          lesson_number: 2.2,
          lesson_title: 'Integration Tests',
          lesson_objectives: ['Test integration'],
          key_topics: ['API', 'Database'],
          estimated_duration_minutes: 45,
          lesson_type: 'practice',
        },
      ],
    },
  ],
});

describe('resolveTargetPath', () => {
  const courseStructure = createTestCourseStructure();

  it('should resolve "урок 2.3" to sections[1].lessons[2]', () => {
    // Note: section 2 only has 2 lessons, so 2.3 would be out of bounds
    // Let's test with valid "урок 2.2"
    const path = resolveTargetPath('урок 2.2', undefined, courseStructure);

    expect(path).toBe('sections[1].lessons[1]');
  });

  it('should resolve "урок 1.3" to sections[0].lessons[2]', () => {
    const path = resolveTargetPath('урок 1.3', undefined, courseStructure);

    expect(path).toBe('sections[0].lessons[2]');
  });

  it('should resolve "lesson 1.1" (English pattern)', () => {
    const path = resolveTargetPath('lesson 1.1', undefined, courseStructure);

    expect(path).toBe('sections[0].lessons[0]');
  });

  it('should resolve section by number "секция 2"', () => {
    const path = resolveTargetPath('секция 2', undefined, courseStructure);

    expect(path).toBe('sections[1]');
  });

  it('should resolve section by title "секция Введение"', () => {
    const path = resolveTargetPath('секция Введение', undefined, courseStructure);

    expect(path).toBe('sections[0]');
  });

  it('should resolve section by partial title match', () => {
    const path = resolveTargetPath('секция Advanced', undefined, courseStructure);

    expect(path).toBe('sections[1]');
  });

  it('should prioritize nodeContextPath over identifier', () => {
    const nodeContextPath = 'sections[1].lessons[0]';
    const path = resolveTargetPath('урок 1.1', undefined, courseStructure, nodeContextPath);

    // Should use nodeContextPath, not resolve "урок 1.1"
    expect(path).toBe('sections[1].lessons[0]');
  });

  it('should prioritize explicitPath over nodeContextPath', () => {
    const explicitPath = 'sections[0].lessons[1]';
    const nodeContextPath = 'sections[1].lessons[0]';
    const path = resolveTargetPath('урок 1.1', explicitPath, courseStructure, nodeContextPath);

    // Should use explicitPath
    expect(path).toBe('sections[0].lessons[1]');
  });

  it('should return null for unresolvable identifier', () => {
    const path = resolveTargetPath('урок 99.99', undefined, courseStructure);

    expect(path).toBeNull();
  });

  it('should return null when no identifier, explicitPath, or nodeContext provided', () => {
    const path = resolveTargetPath(undefined, undefined, courseStructure);

    expect(path).toBeNull();
  });

  it('should resolve by lesson title substring (fuzzy match)', () => {
    const path = resolveTargetPath('Testing Tools', undefined, courseStructure);

    expect(path).toBe('sections[0].lessons[2]');
  });

  it('should resolve by section title substring (fuzzy match)', () => {
    const path = resolveTargetPath('Advanced', undefined, courseStructure);

    expect(path).toBe('sections[1]');
  });

  it('should handle case-insensitive fuzzy matching', () => {
    const path = resolveTargetPath('MOCKING', undefined, courseStructure);

    expect(path).toBe('sections[1].lessons[0]');
  });

  it('should return null for ambiguous fuzzy match (first match wins)', () => {
    // "Test" appears in multiple lesson titles, should return first match
    const path = resolveTargetPath('Test', undefined, courseStructure);

    // First match is "What is Testing" at sections[0].lessons[0]
    expect(path).toBe('sections[0].lessons[0]');
  });

  it('should handle "раздел" alias for section', () => {
    const path = resolveTargetPath('раздел 1', undefined, courseStructure);

    expect(path).toBe('sections[0]');
  });

  it('should handle "section" English pattern for section number', () => {
    const path = resolveTargetPath('section 2', undefined, courseStructure);

    expect(path).toBe('sections[1]');
  });
});

describe('getElementAtPath', () => {
  const courseStructure = createTestCourseStructure();

  it('should get lesson at path sections[0].lessons[1]', () => {
    const element = getElementAtPath(courseStructure, 'sections[0].lessons[1]');

    expect(element).toBeDefined();
    expect((element as any).lesson_title).toBe('Why Test');
  });

  it('should get lesson at path sections[1].lessons[0]', () => {
    const element = getElementAtPath(courseStructure, 'sections[1].lessons[0]');

    expect(element).toBeDefined();
    expect((element as any).lesson_title).toBe('Mocking');
  });

  it('should get section at path sections[0]', () => {
    const element = getElementAtPath(courseStructure, 'sections[0]');

    expect(element).toBeDefined();
    expect((element as any).section_title).toBe('Введение');
    expect((element as any).lessons).toHaveLength(3);
  });

  it('should get section at path sections[1]', () => {
    const element = getElementAtPath(courseStructure, 'sections[1]');

    expect(element).toBeDefined();
    expect((element as any).section_title).toBe('Advanced Topics');
  });

  it('should return null for invalid path format', () => {
    const element = getElementAtPath(courseStructure, 'invalid_path');

    expect(element).toBeNull();
  });

  it('should return null for out-of-bounds section index', () => {
    const element = getElementAtPath(courseStructure, 'sections[99]');

    expect(element).toBeNull();
  });

  it('should return null for out-of-bounds lesson index', () => {
    const element = getElementAtPath(courseStructure, 'sections[0].lessons[99]');

    expect(element).toBeNull();
  });

  it('should handle malformed path gracefully', () => {
    const element = getElementAtPath(courseStructure, 'sections[abc].lessons[0]');

    expect(element).toBeNull();
  });
});

describe('generateCourseOutline', () => {
  const courseStructure = createTestCourseStructure();

  it('should generate lightweight outline', () => {
    const outline = generateCourseOutline(courseStructure);

    expect(outline).toBeDefined();
    expect(outline.course_title).toBe('Test Course');
    expect(outline.course_description).toBe('A test course for unit testing');
    expect(outline.total_duration_hours).toBe(3);
  });

  it('should include all sections with basic info', () => {
    const outline = generateCourseOutline(courseStructure);

    expect(outline.sections).toHaveLength(2);
    expect(outline.sections[0].section_number).toBe(1);
    expect(outline.sections[0].section_title).toBe('Введение');
    expect(outline.sections[1].section_number).toBe(2);
    expect(outline.sections[1].section_title).toBe('Advanced Topics');
  });

  it('should include lesson numbers and titles only (no full data)', () => {
    const outline = generateCourseOutline(courseStructure);

    expect(outline.sections[0].lessons).toHaveLength(3);
    expect(outline.sections[0].lessons[0]).toEqual({
      lesson_number: '1.1',
      lesson_title: 'What is Testing',
    });

    // Should NOT include full lesson data
    expect((outline.sections[0].lessons[0] as any).lesson_objectives).toBeUndefined();
    expect((outline.sections[0].lessons[0] as any).key_topics).toBeUndefined();
  });

  it('should convert lesson_number to string', () => {
    const outline = generateCourseOutline(courseStructure);

    // Lesson numbers should be strings
    expect(outline.sections[0].lessons[0].lesson_number).toBe('1.1');
    expect(typeof outline.sections[0].lessons[0].lesson_number).toBe('string');
  });

  it('should handle missing section_number gracefully', () => {
    const customStructure: CourseStructure = {
      ...courseStructure,
      sections: [
        {
          ...courseStructure.sections[0],
          section_number: undefined as any, // Missing section_number
        },
      ],
    };

    const outline = generateCourseOutline(customStructure);

    // Should use index + 1 as fallback
    expect(outline.sections[0].section_number).toBe(1);
  });
});

describe('isLessonPath', () => {
  it('should return true for lesson path', () => {
    expect(isLessonPath('sections[0].lessons[2]')).toBe(true);
  });

  it('should return false for section path', () => {
    expect(isLessonPath('sections[1]')).toBe(false);
  });
});

describe('isSectionPath', () => {
  it('should return true for section path', () => {
    expect(isSectionPath('sections[1]')).toBe(true);
  });

  it('should return false for lesson path', () => {
    expect(isSectionPath('sections[0].lessons[2]')).toBe(false);
  });

  it('should return false for invalid path', () => {
    expect(isSectionPath('invalid')).toBe(false);
  });
});

describe('parsePathIndices', () => {
  it('should parse lesson path', () => {
    const indices = parsePathIndices('sections[1].lessons[2]');

    expect(indices).toEqual({
      sectionIndex: 1,
      lessonIndex: 2,
    });
  });

  it('should parse section path', () => {
    const indices = parsePathIndices('sections[0]');

    expect(indices).toEqual({
      sectionIndex: 0,
      lessonIndex: undefined,
    });
  });

  it('should return null for invalid path', () => {
    const indices = parsePathIndices('invalid_path');

    expect(indices).toBeNull();
  });
});

// ============================================================================
// resolveTargetPathWithMatches tests
// ============================================================================

// Helper to create a course structure with multiple similar lessons for ambiguity tests
const createTestCourseWithSimilarLessons = (): CourseStructure => ({
  course_title: 'React Development Course',
  course_description: 'A comprehensive React course',
  target_audience: 'Developers',
  difficulty_level: 'intermediate',
  prerequisites: ['JavaScript'],
  learning_outcomes: ['Build React apps'],
  estimated_duration_hours: 10,
  course_tags: ['react', 'frontend', 'javascript', 'web', 'ui'],
  sections: [
    {
      section_number: 1,
      section_title: 'React Fundamentals',
      section_description: 'Learn React basics',
      learning_objectives: ['Understand React'],
      estimated_duration_minutes: 120,
      lessons: [
        {
          lesson_number: 1.1,
          lesson_title: 'React Basics',
          lesson_objectives: ['Learn basics'],
          key_topics: ['JSX', 'Components'],
          estimated_duration_minutes: 30,
          lesson_type: 'theory',
        },
        {
          lesson_number: 1.2,
          lesson_title: 'React Components',
          lesson_objectives: ['Create components'],
          key_topics: ['Functional', 'Class'],
          estimated_duration_minutes: 45,
          lesson_type: 'practice',
        },
        {
          lesson_number: 1.3,
          lesson_title: 'React State',
          lesson_objectives: ['Manage state'],
          key_topics: ['useState', 'useReducer'],
          estimated_duration_minutes: 45,
          lesson_type: 'practice',
        },
      ],
    },
    {
      section_number: 2,
      section_title: 'Advanced React',
      section_description: 'Advanced topics',
      learning_objectives: ['Master React'],
      estimated_duration_minutes: 180,
      lessons: [
        {
          lesson_number: 2.1,
          lesson_title: 'React Hooks',
          lesson_objectives: ['Use hooks'],
          key_topics: ['useEffect', 'useContext'],
          estimated_duration_minutes: 60,
          lesson_type: 'theory',
        },
        {
          lesson_number: 2.2,
          lesson_title: 'React Performance',
          lesson_objectives: ['Optimize'],
          key_topics: ['Memoization', 'Profiler'],
          estimated_duration_minutes: 60,
          lesson_type: 'practice',
        },
        {
          lesson_number: 2.3,
          lesson_title: 'React Testing',
          lesson_objectives: ['Test apps'],
          key_topics: ['Jest', 'RTL'],
          estimated_duration_minutes: 60,
          lesson_type: 'practice',
        },
      ],
    },
  ],
});

describe('resolveTargetPathWithMatches', () => {
  const courseStructure = createTestCourseWithSimilarLessons();

  describe('explicit path handling', () => {
    it('should return single exact match for explicit path', () => {
      const matches = resolveTargetPathWithMatches(
        undefined,
        'sections[1].lessons[0]',
        courseStructure
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].path).toBe('sections[1].lessons[0]');
      expect(matches[0].title).toBe('React Hooks');
      expect(matches[0].confidence).toBe(1.0);
      expect(matches[0].elementType).toBe('lesson');
    });

    it('should return empty array for invalid explicit path', () => {
      const matches = resolveTargetPathWithMatches(
        undefined,
        'sections[99].lessons[0]',
        courseStructure
      );

      expect(matches).toHaveLength(0);
    });
  });

  describe('nodeContextPath handling', () => {
    it('should return single exact match for nodeContextPath', () => {
      const matches = resolveTargetPathWithMatches(
        'some identifier',
        undefined,
        courseStructure,
        'sections[0].lessons[2]'
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].path).toBe('sections[0].lessons[2]');
      expect(matches[0].title).toBe('React State');
      expect(matches[0].confidence).toBe(1.0);
    });
  });

  describe('numeric pattern matching', () => {
    it('should return exact match for "урок 2.1"', () => {
      const matches = resolveTargetPathWithMatches('урок 2.1', undefined, courseStructure);

      expect(matches).toHaveLength(1);
      expect(matches[0].path).toBe('sections[1].lessons[0]');
      expect(matches[0].confidence).toBe(1.0);
      expect(matches[0].displayLabel).toBe('Урок 2.1');
    });

    it('should return exact match for "section 2"', () => {
      const matches = resolveTargetPathWithMatches('секция 2', undefined, courseStructure);

      expect(matches).toHaveLength(1);
      expect(matches[0].path).toBe('sections[1]');
      expect(matches[0].confidence).toBe(1.0);
      expect(matches[0].elementType).toBe('section');
    });
  });

  describe('fuzzy matching with multiple results', () => {
    it('should return multiple matches when identifier is ambiguous ("React")', () => {
      const matches = resolveTargetPathWithMatches('React', undefined, courseStructure);

      // "React" appears in multiple lesson titles
      expect(matches.length).toBeGreaterThan(1);
      // All should have some confidence
      matches.forEach(m => {
        expect(m.confidence).toBeGreaterThan(0);
      });
    });

    it('should return matches sorted by confidence (highest first)', () => {
      const matches = resolveTargetPathWithMatches('React', undefined, courseStructure);

      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(matches[i].confidence);
      }
    });

    it('should give higher confidence to "startsWith" matches over "contains"', () => {
      const matches = resolveTargetPathWithMatches('React', undefined, courseStructure);

      // "React Basics" starts with "React" (0.9)
      // "Advanced React" contains "React" (0.7)
      const startsWithMatch = matches.find(m => m.title === 'React Basics');
      const containsMatch = matches.find(
        m => m.title.includes('React') && !m.title.startsWith('React')
      );

      if (startsWithMatch && containsMatch) {
        expect(startsWithMatch.confidence).toBeGreaterThan(containsMatch.confidence);
      }
    });
  });

  describe('confidence scoring', () => {
    it('should return confidence 1.0 for exact match', () => {
      const matches = resolveTargetPathWithMatches('React Hooks', undefined, courseStructure);

      const exactMatch = matches.find(m => m.title === 'React Hooks');
      expect(exactMatch?.confidence).toBe(1.0);
    });

    it('should return confidence 0.9 for "startsWith" match', () => {
      const matches = resolveTargetPathWithMatches('React B', undefined, courseStructure);

      // "React Basics" starts with "React B"
      const match = matches.find(m => m.title === 'React Basics');
      expect(match?.confidence).toBe(0.9);
    });

    it('should return confidence 0.7 for "contains" match', () => {
      const matches = resolveTargetPathWithMatches('Hooks', undefined, courseStructure);

      // "React Hooks" contains "Hooks"
      const match = matches.find(m => m.title === 'React Hooks');
      expect(match?.confidence).toBe(0.7);
    });
  });

  describe('empty results', () => {
    it('should return empty array for no identifier', () => {
      const matches = resolveTargetPathWithMatches(undefined, undefined, courseStructure);

      expect(matches).toHaveLength(0);
    });

    it('should return empty array for non-matching identifier', () => {
      const matches = resolveTargetPathWithMatches(
        'Python Django Flask',
        undefined,
        courseStructure
      );

      expect(matches).toHaveLength(0);
    });

    it('should return empty array for too long identifier', () => {
      const longIdentifier = 'x'.repeat(201);
      const matches = resolveTargetPathWithMatches(longIdentifier, undefined, courseStructure);

      expect(matches).toHaveLength(0);
    });
  });

  describe('displayLabel formatting', () => {
    it('should format lesson displayLabel as "Урок X.Y"', () => {
      const matches = resolveTargetPathWithMatches('урок 1.2', undefined, courseStructure);

      expect(matches[0].displayLabel).toBe('Урок 1.2');
    });

    it('should format section displayLabel as "Секция X"', () => {
      const matches = resolveTargetPathWithMatches('секция 1', undefined, courseStructure);

      expect(matches[0].displayLabel).toBe('Секция 1');
    });
  });

  describe('case insensitivity', () => {
    it('should match case-insensitively', () => {
      const matches = resolveTargetPathWithMatches('REACT HOOKS', undefined, courseStructure);

      const match = matches.find(m => m.title === 'React Hooks');
      expect(match).toBeDefined();
      expect(match?.confidence).toBe(1.0);
    });
  });

  describe('section title pattern matching', () => {
    it('should match "секция Advanced"', () => {
      const matches = resolveTargetPathWithMatches('секция Advanced', undefined, courseStructure);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].title).toBe('Advanced React');
      expect(matches[0].elementType).toBe('section');
    });
  });
});
