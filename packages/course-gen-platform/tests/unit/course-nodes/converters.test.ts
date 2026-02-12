/**
 * Tests for course-nodes/converters.ts
 *
 * Verifies bidirectional conversion between nested CourseStructure JSONB
 * and flat course_nodes rows with fractional-indexing order keys.
 */

import { describe, it, expect } from 'vitest';
import {
  nestedJsonToCourseNodes,
  courseNodesToNestedJson,
  type CourseMetaFields,
} from '../../../src/shared/course-nodes/converters';
import type { CourseNodeRow } from '../../../src/shared/course-nodes/types';
import type { CourseStructure } from '@megacampus/shared-types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createCourseMeta(): CourseMetaFields {
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
      {
        id: 'lo-003',
        text: 'Apply test-driven development methodology in projects',
        language: 'en',
      },
    ],
    course_tags: ['testing', 'software', 'quality', 'unit-tests', 'tdd'],
  };
}

function createStructureWithIds(): CourseStructure {
  const meta = createCourseMeta();
  return {
    ...meta,
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
        estimated_duration_minutes: 75,
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
          {
            id: 'lsn_44444444',
            lesson_number: 2.2,
            lesson_title: 'Writing Assertions',
            lesson_objectives: ['Use assertion libraries to verify expected outcomes'],
            key_topics: ['expect API', 'Matchers', 'Custom assertions'],
            estimated_duration_minutes: 25,
            difficulty_level: 'intermediate',
          },
          {
            id: 'lsn_55555555',
            lesson_number: 2.3,
            lesson_title: 'Mocking Dependencies',
            lesson_objectives: ['Create mocks and stubs for external dependencies'],
            key_topics: ['vi.fn()', 'vi.spyOn()', 'Module mocking'],
            estimated_duration_minutes: 25,
            difficulty_level: 'advanced',
          },
        ],
      },
      {
        id: 'sec_cccccccc',
        section_number: 3,
        section_title: 'Test-Driven Development',
        section_description: 'Applying TDD workflow: red-green-refactor cycle.',
        learning_objectives: ['Apply TDD methodology to real-world problems'],
        estimated_duration_minutes: 30,
        lessons: [
          {
            id: 'lsn_66666666',
            lesson_number: 3.1,
            lesson_title: 'The Red-Green-Refactor Cycle',
            lesson_objectives: ['Execute the TDD cycle on a practical example'],
            key_topics: ['Red phase', 'Green phase', 'Refactor phase'],
            estimated_duration_minutes: 30,
            difficulty_level: 'intermediate',
          },
        ],
      },
    ],
  } as CourseStructure;
}

const TEST_COURSE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('course-nodes/converters', () => {
  // -----------------------------------------------------------------------
  // nestedJsonToCourseNodes
  // -----------------------------------------------------------------------
  describe('nestedJsonToCourseNodes', () => {
    it('converts a structure with 3 sections and 6 lessons into 9 node rows', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);

      // 3 sections + 2 + 3 + 1 lessons = 9
      expect(nodes).toHaveLength(9);
    });

    it('assigns correct node_type and parent_id for sections and lessons', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);

      const sections = nodes.filter(n => n.node_type === 'section');
      const lessons = nodes.filter(n => n.node_type === 'lesson');

      expect(sections).toHaveLength(3);
      expect(lessons).toHaveLength(6);

      // Sections have null parent_id
      for (const s of sections) {
        expect(s.parent_id).toBeNull();
      }

      // Lessons have parent_id pointing to their section
      const sec1Lessons = lessons.filter(l => l.parent_id === 'sec_aaaaaaaa');
      const sec2Lessons = lessons.filter(l => l.parent_id === 'sec_bbbbbbbb');
      const sec3Lessons = lessons.filter(l => l.parent_id === 'sec_cccccccc');

      expect(sec1Lessons).toHaveLength(2);
      expect(sec2Lessons).toHaveLength(3);
      expect(sec3Lessons).toHaveLength(1);
    });

    it('populates section data fields correctly', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);

      const sectionNode = nodes.find(n => n.id === 'sec_aaaaaaaa')!;
      expect(sectionNode).toBeDefined();
      expect(sectionNode.title).toBe('Fundamentals of Testing');
      expect(sectionNode.course_id).toBe(TEST_COURSE_ID);

      const data = sectionNode.data as unknown as Record<string, unknown>;
      expect(data.section_description).toBe('Core concepts and terminology of software testing.');
      expect(data.learning_objectives).toEqual(['Define software testing concepts clearly']);
      expect(data.estimated_duration_minutes).toBe(50);
      expect(data.section_number).toBe(1);
    });

    it('populates lesson data fields correctly', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);

      const lessonNode = nodes.find(n => n.id === 'lsn_55555555')!;
      expect(lessonNode).toBeDefined();
      expect(lessonNode.title).toBe('Mocking Dependencies');
      expect(lessonNode.parent_id).toBe('sec_bbbbbbbb');

      const data = lessonNode.data as unknown as Record<string, unknown>;
      expect(data.lesson_objectives).toEqual(['Create mocks and stubs for external dependencies']);
      expect(data.key_topics).toEqual(['vi.fn()', 'vi.spyOn()', 'Module mocking']);
      expect(data.estimated_duration_minutes).toBe(25);
      expect(data.difficulty_level).toBe('advanced');
    });

    it('generates order keys in ascending lexicographic order for sections', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);

      const sectionKeys = nodes.filter(n => n.node_type === 'section').map(n => n.order_key);

      expect(sectionKeys).toHaveLength(3);
      for (let i = 1; i < sectionKeys.length; i++) {
        expect(sectionKeys[i] > sectionKeys[i - 1]).toBe(true);
      }
    });

    it('generates order keys in ascending lexicographic order for lessons within a section', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);

      const sec2LessonKeys = nodes
        .filter(n => n.node_type === 'lesson' && n.parent_id === 'sec_bbbbbbbb')
        .map(n => n.order_key);

      expect(sec2LessonKeys).toHaveLength(3);
      for (let i = 1; i < sec2LessonKeys.length; i++) {
        expect(sec2LessonKeys[i] > sec2LessonKeys[i - 1]).toBe(true);
      }
    });

    it('throws when a section is missing an id', () => {
      const structure = createStructureWithIds();
      // Remove id from first section
      delete (structure.sections[0] as Record<string, unknown>).id;

      expect(() => nestedJsonToCourseNodes(TEST_COURSE_ID, structure)).toThrow(
        /Section at index 0.*missing a stable id/
      );
    });

    it('throws when a lesson is missing an id', () => {
      const structure = createStructureWithIds();
      // Remove id from second lesson in first section
      delete (structure.sections[0].lessons[1] as Record<string, unknown>).id;

      expect(() => nestedJsonToCourseNodes(TEST_COURSE_ID, structure)).toThrow(
        /Lesson at index 1.*missing a stable id/
      );
    });

    it('returns empty array for structure with no sections', () => {
      const meta = createCourseMeta();
      const structure = { ...meta, sections: [] } as CourseStructure;
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);
      expect(nodes).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // courseNodesToNestedJson
  // -----------------------------------------------------------------------
  describe('courseNodesToNestedJson', () => {
    it('reconstructs sections and lessons from flat nodes', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);

      // Convert node inserts to "rows" (simulate DB read)
      const rows = nodes.map(toRow);
      const meta = createCourseMeta();
      const result = courseNodesToNestedJson(rows, meta);

      expect(result.sections).toHaveLength(3);
      expect(result.sections[0].lessons).toHaveLength(2);
      expect(result.sections[1].lessons).toHaveLength(3);
      expect(result.sections[2].lessons).toHaveLength(1);
    });

    it('preserves course-level metadata from CourseMetaFields', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);
      const rows = nodes.map(toRow);
      const meta = createCourseMeta();
      const result = courseNodesToNestedJson(rows, meta);

      expect(result.course_title).toBe(meta.course_title);
      expect(result.course_description).toBe(meta.course_description);
      expect(result.course_overview).toBe(meta.course_overview);
      expect(result.target_audience).toBe(meta.target_audience);
      expect(result.difficulty_level).toBe(meta.difficulty_level);
      expect(result.prerequisites).toEqual(meta.prerequisites);
      expect(result.learning_outcomes).toEqual(meta.learning_outcomes);
      expect(result.course_tags).toEqual(meta.course_tags);
    });

    it('recalculates section duration as sum of lesson durations', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);
      const rows = nodes.map(toRow);
      const meta = createCourseMeta();
      const result = courseNodesToNestedJson(rows, meta);

      // Section 1: 20 + 30 = 50
      expect(result.sections[0].estimated_duration_minutes).toBe(50);
      // Section 2: 25 + 25 + 25 = 75
      expect(result.sections[1].estimated_duration_minutes).toBe(75);
      // Section 3: 30
      expect(result.sections[2].estimated_duration_minutes).toBe(30);
    });

    it('recalculates estimated_duration_hours from total lesson durations', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);
      const rows = nodes.map(toRow);
      const meta = createCourseMeta();
      const result = courseNodesToNestedJson(rows, meta);

      // Total: 50 + 75 + 30 = 155 minutes = 2.58... hours
      const expectedHours = Math.round((155 / 60) * 100) / 100;
      expect(result.estimated_duration_hours).toBe(expectedHours);
    });

    it('assigns sequential section_number starting from 1', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);
      const rows = nodes.map(toRow);
      const meta = createCourseMeta();
      const result = courseNodesToNestedJson(rows, meta);

      expect(result.sections[0].section_number).toBe(1);
      expect(result.sections[1].section_number).toBe(2);
      expect(result.sections[2].section_number).toBe(3);
    });

    it('assigns lesson_number as section.lesson format', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);
      const rows = nodes.map(toRow);
      const meta = createCourseMeta();
      const result = courseNodesToNestedJson(rows, meta);

      // Section 1 lessons
      expect(result.sections[0].lessons[0].lesson_number).toBe(1.1);
      expect(result.sections[0].lessons[1].lesson_number).toBe(1.2);
      // Section 2 lessons
      expect(result.sections[1].lessons[0].lesson_number).toBe(2.1);
      expect(result.sections[1].lessons[1].lesson_number).toBe(2.2);
      expect(result.sections[1].lessons[2].lesson_number).toBe(2.3);
      // Section 3 lessons
      expect(result.sections[2].lessons[0].lesson_number).toBe(3.1);
    });

    it('sorts nodes by order_key even when input is shuffled', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);
      // Reverse the array to simulate unordered DB results
      const shuffledRows = nodes.map(toRow).reverse();
      const meta = createCourseMeta();
      const result = courseNodesToNestedJson(shuffledRows, meta);

      // Sections must still be in correct order
      expect(result.sections[0].section_title).toBe('Fundamentals of Testing');
      expect(result.sections[1].section_title).toBe('Unit Testing in Practice');
      expect(result.sections[2].section_title).toBe('Test-Driven Development');

      // Lessons within section 2 must still be in correct order
      expect(result.sections[1].lessons[0].lesson_title).toBe('Setting Up a Test Runner');
      expect(result.sections[1].lessons[1].lesson_title).toBe('Writing Assertions');
      expect(result.sections[1].lessons[2].lesson_title).toBe('Mocking Dependencies');
    });

    it('handles section with a single lesson', () => {
      const structure = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, structure);
      const rows = nodes.map(toRow);
      const meta = createCourseMeta();
      const result = courseNodesToNestedJson(rows, meta);

      // Section 3 has exactly 1 lesson
      const sec3 = result.sections[2];
      expect(sec3.lessons).toHaveLength(1);
      expect(sec3.lessons[0].lesson_title).toBe('The Red-Green-Refactor Cycle');
      expect(sec3.estimated_duration_minutes).toBe(30);
    });
  });

  // -----------------------------------------------------------------------
  // Round-trip (nested -> nodes -> nested)
  // -----------------------------------------------------------------------
  describe('round-trip conversion', () => {
    it('preserves key fields through nested -> nodes -> nested conversion', () => {
      const original = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, original);
      const rows = nodes.map(toRow);
      const meta = createCourseMeta();
      const reconstructed = courseNodesToNestedJson(rows, meta);

      // Course-level fields
      expect(reconstructed.course_title).toBe(original.course_title);
      expect(reconstructed.course_description).toBe(original.course_description);
      expect(reconstructed.difficulty_level).toBe(original.difficulty_level);
      expect(reconstructed.course_tags).toEqual(original.course_tags);

      // Section-level fields
      expect(reconstructed.sections).toHaveLength(original.sections.length);
      for (let si = 0; si < original.sections.length; si++) {
        const origSec = original.sections[si];
        const reconSec = reconstructed.sections[si];

        expect(reconSec.id).toBe(origSec.id);
        expect(reconSec.section_title).toBe(origSec.section_title);
        expect(reconSec.section_description).toBe(origSec.section_description);
        expect(reconSec.learning_objectives).toEqual(origSec.learning_objectives);

        // Lesson-level fields
        expect(reconSec.lessons).toHaveLength(origSec.lessons.length);
        for (let li = 0; li < origSec.lessons.length; li++) {
          const origLesson = origSec.lessons[li];
          const reconLesson = reconSec.lessons[li];

          expect(reconLesson.id).toBe(origLesson.id);
          expect(reconLesson.lesson_title).toBe(origLesson.lesson_title);
          expect(reconLesson.lesson_objectives).toEqual(origLesson.lesson_objectives);
          expect(reconLesson.key_topics).toEqual(origLesson.key_topics);
          expect(reconLesson.estimated_duration_minutes).toBe(
            origLesson.estimated_duration_minutes
          );
          expect(reconLesson.difficulty_level).toBe(origLesson.difficulty_level);
        }
      }
    });

    it('recalculated section durations match sum of lesson durations', () => {
      const original = createStructureWithIds();
      const nodes = nestedJsonToCourseNodes(TEST_COURSE_ID, original);
      const rows = nodes.map(toRow);
      const meta = createCourseMeta();
      const reconstructed = courseNodesToNestedJson(rows, meta);

      for (const section of reconstructed.sections) {
        const expectedDuration = section.lessons.reduce(
          (sum, l) => sum + l.estimated_duration_minutes,
          0
        );
        expect(section.estimated_duration_minutes).toBe(expectedDuration);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a CourseNodeInsert to a CourseNodeRow (simulates DB read with defaults) */
function toRow(insert: ReturnType<typeof nestedJsonToCourseNodes>[number]): CourseNodeRow {
  return {
    id: insert.id,
    course_id: insert.course_id,
    parent_id: insert.parent_id ?? null,
    node_type: insert.node_type,
    order_key: insert.order_key,
    title: insert.title,
    data: insert.data ?? {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
