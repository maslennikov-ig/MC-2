/**
 * Tests for course-nodes/writer.ts
 *
 * Verifies dual-write service behavior: converts nested CourseStructure
 * to flat course_nodes rows and performs idempotent delete-then-insert.
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CourseStructure } from '@megacampus/shared-types';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Mock setup using vi.hoisted() for module-level mocks
// ---------------------------------------------------------------------------

const mockNestedJsonToCourseNodes = vi.hoisted(() => vi.fn());
const mockCourseNodesToNestedJson = vi.hoisted(() => vi.fn());
const mockIsDualWriteEnabled = vi.hoisted(() => vi.fn());
const mockIsStableIdsRequired = vi.hoisted(() => vi.fn());
const mockCheckStructureParity = vi.hoisted(() => vi.fn());

vi.mock('../../../src/shared/course-nodes/converters', () => ({
  nestedJsonToCourseNodes: mockNestedJsonToCourseNodes,
  courseNodesToNestedJson: mockCourseNodesToNestedJson,
}));

vi.mock('../../../src/shared/course-nodes/feature-flags', () => ({
  isDualWriteEnabled: mockIsDualWriteEnabled,
  isStableIdsRequired: mockIsStableIdsRequired,
}));

vi.mock('../../../src/shared/course-nodes/parity-checker', () => ({
  checkStructureParity: mockCheckStructureParity,
}));

// Import after mocks are registered
import { writeCourseNodes } from '../../../src/shared/course-nodes/writer';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_COURSE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function createMockStructure(): CourseStructure {
  return {
    course_title: 'Test Course',
    course_description: 'Test Description',
    estimated_duration_hours: 2,
    difficulty_level: 'intermediate',
    prerequisites: [],
    learning_outcomes: [],
    course_tags: [],
    sections: [
      {
        id: 'sec_aaaaaaaa',
        section_number: 1,
        section_title: 'Section 1',
        section_description: 'Description',
        learning_objectives: [],
        estimated_duration_minutes: 60,
        lessons: [
          {
            id: 'lsn_11111111',
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [],
            key_topics: [],
            estimated_duration_minutes: 30,
            difficulty_level: 'beginner',
          },
        ],
      },
    ],
  } as CourseStructure;
}

function createMockSupabase() {
  const mockEq = vi.fn().mockResolvedValue({ error: null });
  const mockDelete = vi.fn(() => ({ eq: mockEq }));
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockSelect = vi.fn().mockReturnThis();

  const mockFrom = vi.fn(() => ({
    delete: mockDelete,
    insert: mockInsert,
    select: mockSelect,
  }));

  return {
    from: mockFrom,
    _mockDelete: mockDelete,
    _mockInsert: mockInsert,
    _mockSelect: mockSelect,
    _mockEq: mockEq,
  } as unknown as SupabaseClient<Database> & {
    _mockDelete: ReturnType<typeof vi.fn>;
    _mockInsert: ReturnType<typeof vi.fn>;
    _mockSelect: ReturnType<typeof vi.fn>;
    _mockEq: ReturnType<typeof vi.fn>;
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('course-nodes/writer', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockLogger: Logger;
  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockLogger = createMockLogger();
    originalEnv = process.env.COURSE_NODES_PARITY_CHECK_ENABLED;

    // Default: dual-write enabled, stable IDs not required
    mockIsDualWriteEnabled.mockReturnValue(true);
    mockIsStableIdsRequired.mockReturnValue(false);

    // Default: conversion succeeds with 1 node
    mockNestedJsonToCourseNodes.mockReturnValue([
      {
        id: 'sec_aaaaaaaa',
        course_id: TEST_COURSE_ID,
        parent_id: null,
        node_type: 'section',
        order_key: 'a0',
        title: 'Section 1',
        data: {},
      },
    ]);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.COURSE_NODES_PARITY_CHECK_ENABLED = originalEnv;
    } else {
      delete process.env.COURSE_NODES_PARITY_CHECK_ENABLED;
    }
  });

  // -------------------------------------------------------------------------
  // Feature flag gating
  // -------------------------------------------------------------------------
  describe('feature flag gating', () => {
    it('returns early when COURSE_NODES_DUAL_WRITE_ENABLED is false', async () => {
      mockIsDualWriteEnabled.mockReturnValue(false);

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(mockNestedJsonToCourseNodes).not.toHaveBeenCalled();
    });

    it('proceeds with dual-write when COURSE_NODES_DUAL_WRITE_ENABLED is true', async () => {
      mockIsDualWriteEnabled.mockReturnValue(true);

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockSupabase.from).toHaveBeenCalledWith('course_nodes');
      expect(mockNestedJsonToCourseNodes).toHaveBeenCalledWith(TEST_COURSE_ID, structure);
    });
  });

  // -------------------------------------------------------------------------
  // Stable IDs requirement
  // -------------------------------------------------------------------------
  describe('stable IDs requirement', () => {
    it('throws when COURSE_STABLE_IDS_REQUIRED=true and structure lacks stable IDs', async () => {
      mockIsStableIdsRequired.mockReturnValue(true);

      const structureNoIds = createMockStructure();
      // Remove section ID
      delete (structureNoIds.sections[0] as any).id;

      await expect(
        writeCourseNodes(TEST_COURSE_ID, structureNoIds, mockSupabase, mockLogger)
      ).rejects.toThrow(/missing stable IDs.*COURSE_STABLE_IDS_REQUIRED=true/);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { courseId: TEST_COURSE_ID },
        expect.stringContaining('missing stable IDs')
      );
    });

    it('throws when COURSE_STABLE_IDS_REQUIRED=true and lesson lacks stable ID', async () => {
      mockIsStableIdsRequired.mockReturnValue(true);

      const structureNoLessonId = createMockStructure();
      // Remove lesson ID
      delete (structureNoLessonId.sections[0].lessons[0] as any).id;

      await expect(
        writeCourseNodes(TEST_COURSE_ID, structureNoLessonId, mockSupabase, mockLogger)
      ).rejects.toThrow(/missing stable IDs/);
    });

    it('accepts structure with stable IDs when COURSE_STABLE_IDS_REQUIRED=true', async () => {
      mockIsStableIdsRequired.mockReturnValue(true);

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockSupabase.from).toHaveBeenCalledWith('course_nodes');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Conversion errors
  // -------------------------------------------------------------------------
  describe('conversion errors', () => {
    it('returns early and logs warning when nestedJsonToCourseNodes throws', async () => {
      mockNestedJsonToCourseNodes.mockImplementation(() => {
        throw new Error('Conversion failed: missing required field');
      });

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          courseId: TEST_COURSE_ID,
          error: 'Conversion failed: missing required field',
        },
        'course_nodes dual-write: conversion failed'
      );

      // Should not attempt DB operations after conversion error
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Delete-then-insert flow
  // -------------------------------------------------------------------------
  describe('delete-then-insert flow', () => {
    it('deletes existing nodes BEFORE checking if new structure is empty', async () => {
      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockSupabase._mockDelete).toHaveBeenCalledTimes(1);
      expect(mockSupabase._mockEq).toHaveBeenCalledWith('course_id', TEST_COURSE_ID);
    });

    it('returns early with DELETE when nodes.length === 0 after conversion (fixes stale data)', async () => {
      mockNestedJsonToCourseNodes.mockReturnValue([]); // Empty structure

      const emptyStructure: CourseStructure = {
        course_title: 'Empty Course',
        course_description: 'No sections',
        estimated_duration_hours: 0,
        difficulty_level: 'beginner',
        prerequisites: [],
        learning_outcomes: [],
        course_tags: [],
        sections: [],
      };

      await writeCourseNodes(TEST_COURSE_ID, emptyStructure, mockSupabase, mockLogger);

      // DELETE was called
      expect(mockSupabase._mockDelete).toHaveBeenCalled();

      // INSERT was NOT called (because nodes.length === 0)
      expect(mockSupabase._mockInsert).not.toHaveBeenCalled();

      // Logs debug message about empty structure
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { courseId: TEST_COURSE_ID },
        expect.stringContaining('no nodes to write')
      );
    });

    it('inserts nodes after successful delete', async () => {
      const nodes = [
        {
          id: 'sec_aaaaaaaa',
          course_id: TEST_COURSE_ID,
          parent_id: null,
          node_type: 'section',
          order_key: 'a0',
          title: 'Section 1',
          data: {},
        },
      ];
      mockNestedJsonToCourseNodes.mockReturnValue(nodes);

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockSupabase._mockDelete).toHaveBeenCalled();
      expect(mockSupabase._mockInsert).toHaveBeenCalledWith(nodes);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ courseId: TEST_COURSE_ID, nodeCount: 1 }),
        'course_nodes dual-write: success'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error handling (non-fatal)
  // -------------------------------------------------------------------------
  describe('error handling (non-fatal)', () => {
    it('handles delete errors gracefully (logs warning, returns)', async () => {
      // Mock delete().eq() to return error
      mockSupabase._mockEq.mockResolvedValue({
        error: { message: 'DELETE constraint violation' },
      });

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          courseId: TEST_COURSE_ID,
          error: 'DELETE constraint violation',
        },
        'course_nodes dual-write: failed to delete existing nodes'
      );

      // Should NOT proceed to insert after delete error
      expect(mockSupabase._mockInsert).not.toHaveBeenCalled();
    });

    it('handles insert errors gracefully (logs warning, returns)', async () => {
      mockSupabase._mockInsert.mockResolvedValue({
        error: { message: 'INSERT unique constraint violation' },
      });

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: TEST_COURSE_ID,
          error: 'INSERT unique constraint violation',
        }),
        'course_nodes dual-write: failed to insert nodes'
      );

      // No exception thrown (non-fatal)
    });
  });

  // -------------------------------------------------------------------------
  // Parity check (optional)
  // -------------------------------------------------------------------------
  describe('parity check', () => {
    it('skips parity check when COURSE_NODES_PARITY_CHECK_ENABLED is not set', async () => {
      delete process.env.COURSE_NODES_PARITY_CHECK_ENABLED;

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockSupabase._mockSelect).not.toHaveBeenCalled();
      expect(mockCheckStructureParity).not.toHaveBeenCalled();
    });

    it('runs parity check when COURSE_NODES_PARITY_CHECK_ENABLED=true and logs success', async () => {
      process.env.COURSE_NODES_PARITY_CHECK_ENABLED = 'true';

      const writtenNodes = [
        {
          id: 'sec_aaaaaaaa',
          course_id: TEST_COURSE_ID,
          parent_id: null,
          node_type: 'section',
          order_key: 'a0',
          title: 'Section 1',
          data: {},
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      // Mock delete().eq() to return success
      mockSupabase._mockEq.mockResolvedValueOnce({ error: null });

      // Mock select().eq() for parity check to return written nodes
      const mockSelectEq = vi.fn().mockResolvedValue({ data: writtenNodes, error: null });
      mockSupabase._mockSelect.mockReturnValue({ eq: mockSelectEq });

      mockCourseNodesToNestedJson.mockReturnValue({ sections: [] });
      mockCheckStructureParity.mockReturnValue({
        isEqual: true,
        differences: [],
        sectionCount: { original: 1, reconstructed: 1 },
        lessonCount: { original: 1, reconstructed: 1 },
      });

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockCheckStructureParity).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { courseId: TEST_COURSE_ID },
        'course_nodes parity check passed'
      );
    });

    it('logs warning when parity check fails (structure mismatch)', async () => {
      process.env.COURSE_NODES_PARITY_CHECK_ENABLED = 'true';

      const writtenNodes = [
        {
          id: 'sec_aaaaaaaa',
          course_id: TEST_COURSE_ID,
          parent_id: null,
          node_type: 'section',
          order_key: 'a0',
          title: 'Section 1',
          data: {},
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      // Mock delete().eq() to return success
      mockSupabase._mockEq.mockResolvedValueOnce({ error: null });

      // Mock select().eq() for parity check to return written nodes
      const mockSelectEq = vi.fn().mockResolvedValue({ data: writtenNodes, error: null });
      mockSupabase._mockSelect.mockReturnValue({ eq: mockSelectEq });

      mockCourseNodesToNestedJson.mockReturnValue({ sections: [] });
      mockCheckStructureParity.mockReturnValue({
        isEqual: false,
        differences: [{ path: 'sections[0].title', expected: 'Section 1', actual: 'Section 2' }],
        sectionCount: { original: 1, reconstructed: 1 },
        lessonCount: { original: 1, reconstructed: 1 },
      });

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: TEST_COURSE_ID,
          differenceCount: 1,
        }),
        'course_nodes parity check FAILED — structure mismatch after dual-write'
      );
    });

    it('logs debug when parity check throws (non-fatal)', async () => {
      process.env.COURSE_NODES_PARITY_CHECK_ENABLED = 'true';

      // Mock delete().eq() to return success
      mockSupabase._mockEq.mockResolvedValueOnce({ error: null });

      // Mock select().eq() to throw error
      const mockSelectEq = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'SELECT timeout' },
      });
      mockSupabase._mockSelect.mockReturnValue({ eq: mockSelectEq });

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      // No warning about parity check failure, just skips
      expect(mockCheckStructureParity).not.toHaveBeenCalled();
    });

    it('handles parity check errors gracefully (logs debug, does not throw)', async () => {
      process.env.COURSE_NODES_PARITY_CHECK_ENABLED = 'true';

      const writtenNodes = [{ id: 'sec_aaaaaaaa', course_id: TEST_COURSE_ID }];

      // Mock delete().eq() to return success
      mockSupabase._mockEq.mockResolvedValueOnce({ error: null });

      // Mock select().eq() for parity check to return written nodes
      const mockSelectEq = vi.fn().mockResolvedValue({ data: writtenNodes, error: null });
      mockSupabase._mockSelect.mockReturnValue({ eq: mockSelectEq });

      // Mock courseNodesToNestedJson to throw
      mockCourseNodesToNestedJson.mockImplementation(() => {
        throw new Error('Reconstruction failed');
      });

      const structure = createMockStructure();
      await writeCourseNodes(TEST_COURSE_ID, structure, mockSupabase, mockLogger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: TEST_COURSE_ID,
          error: 'Reconstruction failed',
        }),
        'course_nodes parity check skipped (error)'
      );
    });
  });
});
