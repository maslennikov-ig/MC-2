/**
 * Chat Apply Helpers Unit Tests
 * @module tests/unit/chat-apply-helpers
 *
 * Focuses on optimistic locking behavior for course writes:
 * - CONFLICT when update affects 0 rows (stale updated_at)
 * - IS NULL filter branch for legacy rows with null updated_at
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CourseStructure, Json } from '@megacampus/shared-types';
import type { FieldUpdatesProposal } from '@megacampus/shared-types/chat-types';
import {
  applyFieldUpdatesProposal,
  applyStructuralOperationProposal,
} from '../../src/server/routers/generation/editing/chat-apply-helpers.js';

const mockApplyFieldUpdate = vi.hoisted(() => vi.fn());
const mockEnsureStableIdsAndSchemaVersionInMemory = vi.hoisted(() => vi.fn());
const mockEnsureStableIdsInMemory = vi.hoisted(() => vi.fn());
const mockApplySurgicalOperations = vi.hoisted(() => vi.fn());
const mockWriteCourseNodes = vi.hoisted(() => vi.fn());
const mockAssertStableIds = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/stages/stage5-generation/utils/course-structure-editor', () => ({
  applyFieldUpdate: mockApplyFieldUpdate,
  ensureStableIdsAndSchemaVersionInMemory: mockEnsureStableIdsAndSchemaVersionInMemory,
  ensureStableIdsInMemory: mockEnsureStableIdsInMemory,
}));

vi.mock('../../src/server/routers/generation/editing/surgical-operations', () => ({
  applySurgicalOperations: mockApplySurgicalOperations,
}));

vi.mock('../../src/shared/course-nodes/writer', () => ({
  writeCourseNodes: mockWriteCourseNodes,
}));

vi.mock('../../src/shared/course-nodes/feature-flags', () => ({
  assertStableIds: mockAssertStableIds,
}));

type CoursesUpdateResult = {
  data: Array<{ id: string }> | null;
  error: unknown;
};

function createMockSupabase(updateResult: CoursesUpdateResult) {
  const query = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(updateResult),
  };

  const from = vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue(query),
  });

  return {
    from,
    _query: query,
  } as unknown as SupabaseClient<Database> & {
    _query: typeof query;
  };
}

function createStructure(): CourseStructure {
  return {
    course_title: 'Test Course',
    course_description: 'Desc',
    estimated_duration_hours: 1,
    difficulty_level: 'beginner',
    prerequisites: [],
    learning_outcomes: [],
    course_tags: [],
    sections: [
      {
        id: 'sec_1',
        section_number: 1,
        section_title: 'Section 1',
        section_description: '',
        learning_objectives: [],
        estimated_duration_minutes: 30,
        lessons: [
          {
            id: 'lsn_1',
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

describe('chat-apply-helpers optimistic locking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyFieldUpdate.mockImplementation((structure: CourseStructure) => ({
      updatedStructure: structure,
    }));
    mockEnsureStableIdsAndSchemaVersionInMemory.mockImplementation((v: unknown) => v);
    mockEnsureStableIdsInMemory.mockImplementation((v: unknown) => v);
    mockWriteCourseNodes.mockResolvedValue(undefined);
    mockAssertStableIds.mockImplementation(() => undefined);
    mockApplySurgicalOperations.mockReturnValue({
      updatedStructure: createStructure(),
      appliedCount: 1,
      tempIdMap: {},
    });
  });

  it('throws CONFLICT when field_updates write touches 0 rows', async () => {
    const supabase = createMockSupabase({ data: [], error: null });
    const proposal: FieldUpdatesProposal = {
      type: 'field_updates',
      stageId: 'stage_4',
      updates: [{ path: 'topic_analysis.key_concepts', newValue: ['new topic'] }],
      summary: 'update',
    };

    const promise = applyFieldUpdatesProposal(
      supabase,
      'course-1',
      {
        id: 'course-1',
        analysis_result: { topic_analysis: { key_concepts: ['old'] } } as Json,
        course_structure: null,
        updated_at: '2026-02-14T00:00:00.000Z',
      },
      proposal,
      'req-1'
    );

    await expect(promise).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(supabase._query.eq).toHaveBeenCalledWith('updated_at', '2026-02-14T00:00:00.000Z');
  });

  it('uses IS NULL optimistic filter when expected updated_at is null', async () => {
    const supabase = createMockSupabase({ data: [{ id: 'course-1' }], error: null });
    const proposal: FieldUpdatesProposal = {
      type: 'field_updates',
      stageId: 'stage_4',
      updates: [{ path: 'topic_analysis.key_concepts', newValue: ['new topic'] }],
      summary: 'update',
    };

    await applyFieldUpdatesProposal(
      supabase,
      'course-1',
      {
        id: 'course-1',
        analysis_result: { topic_analysis: { key_concepts: ['old'] } } as Json,
        course_structure: null,
        updated_at: null,
      },
      proposal,
      'req-1'
    );

    expect(supabase._query.is).toHaveBeenCalledWith('updated_at', null);
  });

  it('throws CONFLICT when structural_operation write touches 0 rows', async () => {
    const supabase = createMockSupabase({ data: [], error: null });
    const structure = createStructure();

    const promise = applyStructuralOperationProposal(
      supabase,
      'course-1',
      structure,
      {
        type: 'structural_operation',
        operations: [
          {
            type: 'delete_element',
            targetId: 'lsn_1',
          },
        ],
        summary: 'delete',
      },
      'req-2',
      '2026-02-14T00:00:00.000Z'
    );

    await expect(promise).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(supabase._query.eq).toHaveBeenCalledWith('updated_at', '2026-02-14T00:00:00.000Z');
  });
});
