/**
 * Tests for course-nodes/structure-resolver.ts
 *
 * Verifies Phase 4 read-path abstraction: resolves CourseStructure from either
 * course_nodes table (when enabled) or legacy JSONB course_structure column.
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CourseStructure } from '@megacampus/shared-types';

// ---------------------------------------------------------------------------
// Mock setup using vi.hoisted() for module-level mocks
// ---------------------------------------------------------------------------

const mockCourseNodesToNestedJson = vi.hoisted(() => vi.fn());
const mockIsReadFromNodesEnabled = vi.hoisted(() => vi.fn());
const mockCheckStructureParity = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());

vi.mock('../../../src/shared/course-nodes/converters', () => ({
  courseNodesToNestedJson: mockCourseNodesToNestedJson,
}));

vi.mock('../../../src/shared/course-nodes/feature-flags', () => ({
  isReadFromNodesEnabled: mockIsReadFromNodesEnabled,
}));

vi.mock('../../../src/shared/course-nodes/parity-checker', () => ({
  checkStructureParity: mockCheckStructureParity,
}));

vi.mock('../../../src/shared/logger/index.js', () => ({
  logger: {
    warn: mockLoggerWarn,
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks are registered
import {
  resolveStructure,
  hasResolvedStructure,
} from '../../../src/shared/course-nodes/structure-resolver';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_COURSE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function createJsonbStructure(): CourseStructure {
  return {
    course_title: 'Introduction to Testing',
    course_description: 'A comprehensive guide to software testing.',
    course_overview: 'This course covers unit and integration testing.',
    target_audience: 'Developers with basic programming experience.',
    estimated_duration_hours: 3,
    difficulty_level: 'intermediate',
    prerequisites: ['Basic programming knowledge'],
    learning_outcomes: [{ id: 'lo-001', text: 'Understand testing fundamentals', language: 'en' }],
    course_tags: ['testing', 'software'],
    sections: [
      {
        id: 'sec_aaaaaaaa',
        section_number: 1,
        section_title: 'Fundamentals',
        section_description: 'Core testing concepts.',
        learning_objectives: ['Define software testing'],
        estimated_duration_minutes: 60,
        lessons: [
          {
            id: 'lsn_11111111',
            lesson_number: 1,
            lesson_title: 'What is Testing',
            lesson_objectives: ['Define testing'],
            key_topics: ['Testing definition'],
            estimated_duration_minutes: 30,
            difficulty_level: 'beginner',
          },
        ],
      },
    ],
  } as CourseStructure;
}

function createMockCourseNodes() {
  return [
    {
      id: 'sec_aaaaaaaa',
      course_id: TEST_COURSE_ID,
      parent_id: null,
      node_type: 'section',
      order_key: 'a0',
      title: 'Fundamentals',
      data: {
        section_number: 1,
        section_description: 'Core testing concepts.',
        learning_objectives: ['Define software testing'],
        estimated_duration_minutes: 60,
      },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'lsn_11111111',
      course_id: TEST_COURSE_ID,
      parent_id: 'sec_aaaaaaaa',
      node_type: 'lesson',
      order_key: 'a0',
      title: 'What is Testing',
      data: {
        lesson_number: 1,
        lesson_objectives: ['Define testing'],
        key_topics: ['Testing definition'],
        estimated_duration_minutes: 30,
        difficulty_level: 'beginner',
      },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ];
}

function createMockSupabase(mockSelectResponse: { data?: unknown; error?: unknown }) {
  const mockEq = vi.fn().mockResolvedValue(mockSelectResponse);
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));

  return {
    from: mockFrom,
    _mockSelect: mockSelect,
    _mockEq: mockEq,
  } as unknown as SupabaseClient<Database> & {
    _mockSelect: ReturnType<typeof vi.fn>;
    _mockEq: ReturnType<typeof vi.fn>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('course-nodes/structure-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: read from nodes disabled
    mockIsReadFromNodesEnabled.mockReturnValue(false);
    mockCheckStructureParity.mockReturnValue({
      isEqual: true,
      differences: [],
      sectionCount: { original: 1, reconstructed: 1 },
      lessonCount: { original: 1, reconstructed: 1 },
    });
  });

  // -------------------------------------------------------------------------
  // hasResolvedStructure
  // -------------------------------------------------------------------------
  describe('hasResolvedStructure', () => {
    it('returns true when course_structure JSONB exists', () => {
      const jsonb = { course_title: 'Test' };
      expect(hasResolvedStructure(jsonb)).toBe(true);
    });

    it('returns false when course_structure JSONB is null', () => {
      expect(hasResolvedStructure(null)).toBe(false);
    });

    it('returns false when course_structure JSONB is undefined', () => {
      expect(hasResolvedStructure(undefined)).toBe(false);
    });

    it('returns true when read-from-nodes is enabled (even with null JSONB)', () => {
      mockIsReadFromNodesEnabled.mockReturnValue(true);
      expect(hasResolvedStructure(null)).toBe(true);
    });

    it('returns true for empty object (edge case)', () => {
      expect(hasResolvedStructure({})).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // resolveStructure - COURSE_NODES_READ_ENABLED=false (legacy JSONB path)
  // -------------------------------------------------------------------------
  describe('resolveStructure when COURSE_NODES_READ_ENABLED=false', () => {
    beforeEach(() => {
      mockIsReadFromNodesEnabled.mockReturnValue(false);
    });

    it('returns parsed JSONB from course_structure column', async () => {
      const mockSupabase = createMockSupabase({ data: null });
      const jsonb = createJsonbStructure();

      const result = await resolveStructure(TEST_COURSE_ID, jsonb, mockSupabase);

      expect(result).toEqual(jsonb);
      expect(mockSupabase.from).not.toHaveBeenCalled(); // No DB query
    });

    it('returns null when JSONB is null', async () => {
      const mockSupabase = createMockSupabase({ data: null });

      const result = await resolveStructure(TEST_COURSE_ID, null, mockSupabase);

      expect(result).toBeNull();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('returns null when JSONB is undefined', async () => {
      const mockSupabase = createMockSupabase({ data: null });

      const result = await resolveStructure(TEST_COURSE_ID, undefined, mockSupabase);

      expect(result).toBeNull();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // resolveStructure - COURSE_NODES_READ_ENABLED=true (read from nodes)
  // -------------------------------------------------------------------------
  describe('resolveStructure when COURSE_NODES_READ_ENABLED=true', () => {
    beforeEach(() => {
      mockIsReadFromNodesEnabled.mockReturnValue(true);
    });

    it('reads from course_nodes table and converts to nested JSON', async () => {
      const jsonb = createJsonbStructure();
      const nodes = createMockCourseNodes();
      const mockSupabase = createMockSupabase({ data: nodes, error: null });

      const reconstructedStructure: CourseStructure = {
        ...jsonb,
        sections: [
          {
            id: 'sec_aaaaaaaa',
            section_number: 1,
            section_title: 'Fundamentals',
            section_description: 'Core testing concepts.',
            learning_objectives: ['Define software testing'],
            estimated_duration_minutes: 60,
            lessons: [
              {
                id: 'lsn_11111111',
                lesson_number: 1,
                lesson_title: 'What is Testing',
                lesson_objectives: ['Define testing'],
                key_topics: ['Testing definition'],
                estimated_duration_minutes: 30,
                difficulty_level: 'beginner',
              },
            ],
          },
        ],
      };

      mockCourseNodesToNestedJson.mockReturnValue(reconstructedStructure);

      const result = await resolveStructure(TEST_COURSE_ID, jsonb, mockSupabase);

      expect(mockSupabase.from).toHaveBeenCalledWith('course_nodes');
      expect(mockSupabase._mockSelect).toHaveBeenCalledWith('*');
      expect(mockSupabase._mockEq).toHaveBeenCalledWith('course_id', TEST_COURSE_ID);

      expect(mockCourseNodesToNestedJson).toHaveBeenCalledWith(nodes, {
        course_title: jsonb.course_title,
        course_description: jsonb.course_description,
        course_overview: jsonb.course_overview,
        target_audience: jsonb.target_audience,
        estimated_duration_hours: jsonb.estimated_duration_hours,
        difficulty_level: jsonb.difficulty_level,
        prerequisites: jsonb.prerequisites,
        learning_outcomes: jsonb.learning_outcomes,
        course_tags: jsonb.course_tags,
      });
      expect(mockCheckStructureParity).toHaveBeenCalledWith(jsonb, reconstructedStructure);

      expect(result).toEqual(reconstructedStructure);
    });

    it('falls back to JSONB when reconstructed structure fails parity check', async () => {
      const jsonb = createJsonbStructure();
      const nodes = createMockCourseNodes();
      const mockSupabase = createMockSupabase({ data: nodes, error: null });

      const reconstructedMismatch = {
        ...jsonb,
        sections: [],
      } as CourseStructure;

      mockCourseNodesToNestedJson.mockReturnValue(reconstructedMismatch);
      mockCheckStructureParity.mockReturnValue({
        isEqual: false,
        differences: [
          {
            path: 'sections.length',
            expected: 1,
            actual: 0,
          },
        ],
        sectionCount: { original: 1, reconstructed: 0 },
        lessonCount: { original: 1, reconstructed: 0 },
      });

      const result = await resolveStructure(TEST_COURSE_ID, jsonb, mockSupabase);

      expect(result).toEqual(jsonb);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: TEST_COURSE_ID,
          differenceCount: 1,
        }),
        'course_nodes read parity mismatch, falling back to JSONB course_structure'
      );
    });

    it('returns null when JSONB is null and no course_nodes exist', async () => {
      const mockSupabase = createMockSupabase({ data: null, error: null });

      const result = await resolveStructure(TEST_COURSE_ID, null, mockSupabase);

      expect(result).toBeNull();
      expect(mockSupabase.from).toHaveBeenCalledWith('course_nodes');
    });

    it('falls back to JSONB when course_nodes query returns error', async () => {
      const jsonb = createJsonbStructure();
      const mockSupabase = createMockSupabase({
        data: null,
        error: { message: 'Database connection failed' },
      });

      const result = await resolveStructure(TEST_COURSE_ID, jsonb, mockSupabase);

      // Graceful fallback: returns JSONB structure
      expect(result).toEqual(jsonb);
      expect(mockCourseNodesToNestedJson).not.toHaveBeenCalled();
    });

    it('falls back to JSONB when no course_nodes exist (empty array)', async () => {
      const jsonb = createJsonbStructure();
      const mockSupabase = createMockSupabase({ data: [], error: null });

      const result = await resolveStructure(TEST_COURSE_ID, jsonb, mockSupabase);

      // Graceful fallback: returns JSONB structure
      expect(result).toEqual(jsonb);
      expect(mockCourseNodesToNestedJson).not.toHaveBeenCalled();
    });

    it('reconstructs from course_nodes when JSONB is null', async () => {
      const nodes = createMockCourseNodes();
      const mockSupabase = createMockSupabase({ data: nodes, error: null });
      const reconstructed = {
        course_title: 'Курс (1 секций)',
        course_description: 'Структура курса восстановлена из course_nodes.',
        estimated_duration_hours: 0.5,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        course_tags: [],
        sections: [],
      } as CourseStructure;
      mockCourseNodesToNestedJson.mockReturnValue(reconstructed);

      const result = await resolveStructure(TEST_COURSE_ID, null, mockSupabase);

      expect(result).toEqual(reconstructed);
      expect(mockCourseNodesToNestedJson).toHaveBeenCalledWith(
        nodes,
        expect.objectContaining({
          course_title: 'Курс (1 секций)',
          course_description: 'Структура курса восстановлена из course_nodes.',
          difficulty_level: 'beginner',
        })
      );
      expect(mockCheckStructureParity).not.toHaveBeenCalled();
    });

    it('falls back to JSONB when course_nodes data is null', async () => {
      const jsonb = createJsonbStructure();
      const mockSupabase = createMockSupabase({ data: null, error: null });

      const result = await resolveStructure(TEST_COURSE_ID, jsonb, mockSupabase);

      expect(result).toEqual(jsonb);
      expect(mockCourseNodesToNestedJson).not.toHaveBeenCalled();
    });

    it('extracts course-level metadata from JSONB for reconstruction', async () => {
      const jsonb = createJsonbStructure();
      const nodes = createMockCourseNodes();
      const mockSupabase = createMockSupabase({ data: nodes, error: null });

      mockCourseNodesToNestedJson.mockReturnValue({ sections: [] } as CourseStructure);

      await resolveStructure(TEST_COURSE_ID, jsonb, mockSupabase);

      const expectedMeta = {
        course_title: 'Introduction to Testing',
        course_description: 'A comprehensive guide to software testing.',
        course_overview: 'This course covers unit and integration testing.',
        target_audience: 'Developers with basic programming experience.',
        estimated_duration_hours: 3,
        difficulty_level: 'intermediate',
        prerequisites: ['Basic programming knowledge'],
        learning_outcomes: [
          { id: 'lo-001', text: 'Understand testing fundamentals', language: 'en' },
        ],
        course_tags: ['testing', 'software'],
      };

      expect(mockCourseNodesToNestedJson).toHaveBeenCalledWith(nodes, expectedMeta);
    });

    it('handles JSONB with missing optional fields (prerequisites, learning_outcomes, course_tags)', async () => {
      const minimalJsonb: CourseStructure = {
        course_title: 'Minimal Course',
        course_description: 'Description',
        estimated_duration_hours: 1,
        difficulty_level: 'beginner',
        sections: [],
      } as CourseStructure;

      const nodes = createMockCourseNodes();
      const mockSupabase = createMockSupabase({ data: nodes, error: null });

      mockCourseNodesToNestedJson.mockReturnValue({ sections: [] } as CourseStructure);

      await resolveStructure(TEST_COURSE_ID, minimalJsonb, mockSupabase);

      const expectedMeta = {
        course_title: 'Minimal Course',
        course_description: 'Description',
        course_overview: undefined,
        target_audience: undefined,
        estimated_duration_hours: 1,
        difficulty_level: 'beginner',
        prerequisites: [], // Defaults to empty array
        learning_outcomes: [], // Defaults to empty array
        course_tags: [], // Defaults to empty array
      };

      expect(mockCourseNodesToNestedJson).toHaveBeenCalledWith(nodes, expectedMeta);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('resolves structure with single section and single lesson', async () => {
      mockIsReadFromNodesEnabled.mockReturnValue(true);

      const jsonb = createJsonbStructure();
      const nodes = [createMockCourseNodes()[0]]; // Single section node
      const mockSupabase = createMockSupabase({ data: nodes, error: null });

      mockCourseNodesToNestedJson.mockReturnValue({
        ...jsonb,
        sections: [
          {
            id: 'sec_aaaaaaaa',
            section_number: 1,
            section_title: 'Fundamentals',
            section_description: 'Core testing concepts.',
            learning_objectives: [],
            estimated_duration_minutes: 0,
            lessons: [],
          },
        ],
      });

      const result = await resolveStructure(TEST_COURSE_ID, jsonb, mockSupabase);

      expect(result).toBeDefined();
      expect(result?.sections).toHaveLength(1);
    });

    it('resolves structure with sections but no lessons (fallback scenario)', async () => {
      mockIsReadFromNodesEnabled.mockReturnValue(true);

      const jsonb = createJsonbStructure();
      const sectionOnlyNode = [createMockCourseNodes()[0]]; // Only section, no lessons
      const mockSupabase = createMockSupabase({ data: sectionOnlyNode, error: null });

      mockCourseNodesToNestedJson.mockReturnValue({
        ...jsonb,
        sections: [
          {
            id: 'sec_aaaaaaaa',
            section_number: 1,
            section_title: 'Fundamentals',
            section_description: 'Core testing concepts.',
            learning_objectives: [],
            estimated_duration_minutes: 0,
            lessons: [], // No lessons
          },
        ],
      });

      const result = await resolveStructure(TEST_COURSE_ID, jsonb, mockSupabase);

      expect(result).toBeDefined();
      expect(result?.sections[0].lessons).toEqual([]);
    });
  });
});
