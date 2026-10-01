import { beforeEach, describe, expect, it, vi } from 'vitest';
import { router, type UserContext } from '@/server/trpc';
import { fieldUpdateRouter } from '@/server/routers/generation/editing/field-update.router';

const { getAdmin, writeNodes, metadataUpdate, log } = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  writeNodes: vi.fn(),
  metadataUpdate: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/shared/supabase/admin', () => ({ getSupabaseAdmin: getAdmin }));
vi.mock('@/shared/logger/index.js', () => ({ logger: log, default: log }));
vi.mock('@/shared/course-nodes/writer', () => ({ writeCourseNodes: writeNodes }));
vi.mock('@/server/routers/generation/editing/structural-quality-metadata', () => ({
  buildStage5StructuralQualityMetadataUpdate: metadataUpdate,
}));
vi.mock('@/integrations/helixa/scheduler', () => ({
  isKnowledgeSyncContractV2Enabled: () => process.env.HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2 === 'true',
}));
vi.mock('@/server/middleware/rate-limit.js', () => ({
  createRateLimiter: () => vi.fn(({ next }) => next()),
}));
vi.mock('@/server/routers/generation/_shared/helpers', async () => {
  const { setNestedValue } = await import('@/shared/workspace-utils');
  return {
    setNestedValue,
    normalizePathForValidation: (path: string) => path.replace(/\[\d+\]/g, '[*]'),
  };
});

const COURSE_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const SECTION_ID = '44444444-4444-4444-8444-444444444444';
const LESSON_ID = '55555555-5555-4555-8555-555555555555';

function fixture() {
  return {
    id: COURSE_ID,
    user_id: USER_ID,
    organization_id: ORG_ID,
    updated_at: '2026-09-30T10:00:00.000Z',
    analysis_result: { topic_analysis: { determined_topic: 'Old topic' } },
    generation_metadata: { quality_scores: { other: 1 } },
    course_structure: {
      course_title: 'Old title',
      estimated_duration_hours: 1 / 3,
      sections: [
        {
          id: 'sec_existing',
          section_title: 'Section',
          estimated_duration_minutes: 20,
          lessons: [
            {
              id: 'lsn_existing',
              lesson_title: 'Lesson',
              estimated_duration_minutes: 20,
            },
          ],
        },
      ],
    },
  };
}

function database(course = fixture()) {
  const mutations: Array<{ table: string; operation: string; payload?: unknown }> = [];
  const filters: Array<{ table: string; column: string; value: unknown }> = [];
  const rpc = vi.fn().mockResolvedValue({
    data: {
      deletedLessonsCount: 1,
      deletedSectionsCount: 1,
      deletedStructure: true,
      fieldApplied: true,
    },
    error: null,
  });
  const from = vi.fn((table: string) => {
    let operation = 'select';
    const response = () => ({
      data:
        operation === 'update'
          ? null
          : table === 'sections'
            ? [{ id: SECTION_ID }]
            : table === 'lessons'
              ? [{ id: LESSON_ID }]
              : [],
      error: null,
    });
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ table, column, value });
        return query;
      }),
      in: vi.fn(() => query),
      delete: vi.fn(() => {
        operation = 'delete';
        mutations.push({ table, operation });
        return query;
      }),
      update: vi.fn((payload: unknown) => {
        operation = 'update';
        mutations.push({ table, operation, payload });
        return query;
      }),
      single: vi.fn().mockResolvedValue({ data: course, error: null }),
      then: (resolve: (value: ReturnType<typeof response>) => unknown) =>
        Promise.resolve(response()).then(resolve),
    };
    return query;
  });
  return { rpc, from, mutations, filters };
}

const testRouter = router(fieldUpdateRouter);
const caller = (
  user: Omit<UserContext, 'email'> = { id: USER_ID, role: 'instructor', organizationId: ORG_ID }
) =>
  testRouter.createCaller({
    user: { ...user, email: 'test@example.invalid' },
    req: new Request('http://localhost'),
  });

describe('deleteDownstreamStages: atomic logical edit behind Helixa v2 flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2', 'true');
    vi.stubEnv('COURSE_NODES_READ_ENABLED', 'false');
    vi.stubEnv('COURSE_NODES_DUAL_WRITE_ENABLED', 'false');
    writeNodes.mockResolvedValue(undefined);
    metadataUpdate.mockResolvedValue({ quality_scores: { other: 1, structure: { score: 1 } } });
  });

  it('sends the final stage 4 edit and downstream deletion in one scoped transaction', async () => {
    const course = fixture();
    const db = database(course);
    getAdmin.mockReturnValue(db);

    const result = await caller().deleteDownstreamStages({
      courseId: COURSE_ID,
      fromStage: 4,
      pendingEdit: { fieldPath: 'topic_analysis.determined_topic', value: 'New topic' },
    });

    expect(db.rpc).toHaveBeenCalledExactlyOnceWith('delete_helixa_course_downstream_v2', {
      p_course_id: COURSE_ID,
      p_organization_id: ORG_ID,
      p_from_stage: 4,
      p_course_patch: { analysis_result: { topic_analysis: { determined_topic: 'New topic' } } },
      p_expected_course_state: {
        updated_at: course.updated_at,
        analysis_result: course.analysis_result,
        course_structure: course.course_structure,
        generation_metadata: course.generation_metadata,
      },
    });
    expect(db.mutations).toEqual([]);
    expect(course.analysis_result.topic_analysis.determined_topic).toBe('Old topic');
    expect(result).toMatchObject({
      success: true,
      fieldApplied: true,
      deletedLessonsCount: 1,
      deletedSectionsCount: 1,
    });
  });

  it('normalizes stage 5 IDs, recalculates durations, and keeps quality metadata in the same patch', async () => {
    const db = database();
    getAdmin.mockReturnValue(db);

    const result = await caller().deleteDownstreamStages({
      courseId: COURSE_ID,
      fromStage: 5,
      pendingEdit: { fieldPath: 'sections[0].lessons[0].estimated_duration_minutes', value: 60 },
    });

    expect(db.rpc).toHaveBeenCalledOnce();
    const patch = db.rpc.mock.calls[0][1].p_course_patch;
    expect(patch.course_structure).toMatchObject({
      schema_version: 2,
      estimated_duration_hours: 1,
      sections: [
        {
          id: 'sec_existing',
          estimated_duration_minutes: 60,
          lessons: [{ id: 'lsn_existing', estimated_duration_minutes: 60 }],
        },
      ],
    });
    expect(patch.generation_metadata).toEqual({
      quality_scores: { other: 1, structure: { score: 1 } },
    });
    expect(metadataUpdate).toHaveBeenCalledOnce();
    expect(db.mutations).toEqual([]);
    expect(writeNodes).toHaveBeenCalledWith(COURSE_ID, patch.course_structure, db, log);
    expect(result).toMatchObject({
      fieldApplied: true,
      recalculated: { sectionDuration: 60, courseDuration: 1 },
    });
  });

  it.each([
    [4, 'user_id'],
    [5, 'sections[99].lessons[0].lesson_title'],
  ] as const)('rejects invalid stage %s field %s before deletion', async (fromStage, fieldPath) => {
    const db = database();
    getAdmin.mockReturnValue(db);

    await expect(
      caller().deleteDownstreamStages({
        courseId: COURSE_ID,
        fromStage,
        pendingEdit: { fieldPath, value: 'Invalid' },
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.mutations).toEqual([]);
  });

  it('does not delete if stage 5 metadata validation fails', async () => {
    const db = database();
    getAdmin.mockReturnValue(db);
    metadataUpdate.mockRejectedValueOnce(new Error('Invalid structural quality inputs'));

    await expect(
      caller().deleteDownstreamStages({
        courseId: COURSE_ID,
        fromStage: 5,
        pendingEdit: { fieldPath: 'course_title', value: 'New title' },
      })
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.mutations).toEqual([]);
  });

  it('rejects unauthorized owners before any service RPC or deletion', async () => {
    const course = fixture();
    course.user_id = '66666666-6666-4666-8666-666666666666';
    const db = database(course);
    getAdmin.mockReturnValue(db);
    await expect(
      caller().deleteDownstreamStages({
        courseId: COURSE_ID,
        fromStage: 4,
        pendingEdit: { fieldPath: 'topic_analysis.determined_topic', value: 'New topic' },
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.mutations).toEqual([]);
  });

  it('returns a conflict for an optimistic-state mismatch without a second save', async () => {
    const db = database();
    getAdmin.mockReturnValue(db);
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '40001', message: 'Course state changed' },
    });
    await expect(
      caller().deleteDownstreamStages({
        courseId: COURSE_ID,
        fromStage: 4,
        pendingEdit: { fieldPath: 'topic_analysis.determined_topic', value: 'New topic' },
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(db.mutations).toEqual([]);
  });

  it('keeps the flag-off cascade-only flow and leaves the pending edit for legacy save', async () => {
    vi.stubEnv('HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2', 'false');
    const db = database();
    getAdmin.mockReturnValue(db);

    const result = await caller().deleteDownstreamStages({
      courseId: COURSE_ID,
      fromStage: 4,
      pendingEdit: { fieldPath: 'topic_analysis.determined_topic', value: 'New topic' },
    });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.mutations.map(({ table, operation }) => `${table}:${operation}`)).toEqual([
      'lesson_contents:delete',
      'lessons:delete',
      'sections:delete',
      'courses:update',
    ]);
    expect(db.mutations[3].payload).toMatchObject({ course_structure: null });
    expect(result.fieldApplied).not.toBe(true);
    expect(metadataUpdate).not.toHaveBeenCalled();
  });

  it('supports v2 cascade-only callers without applying or reporting a field edit', async () => {
    const db = database();
    db.rpc.mockResolvedValueOnce({
      data: { deletedLessonsCount: 1, deletedSectionsCount: 0, deletedStructure: false },
      error: null,
    });
    getAdmin.mockReturnValue(db);

    const result = await caller().deleteDownstreamStages({ courseId: COURSE_ID, fromStage: 5 });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith('delete_helixa_course_downstream_v2', {
      p_course_id: COURSE_ID,
      p_organization_id: ORG_ID,
      p_from_stage: 5,
    });
    expect(result.fieldApplied).toBeUndefined();
    expect(metadataUpdate).not.toHaveBeenCalled();
    expect(db.mutations).toEqual([]);
  });

  it('keeps standalone updateField validation and persistence after preparation is shared', async () => {
    vi.stubEnv('HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2', 'false');
    const db = database();
    getAdmin.mockReturnValue(db);

    const result = await caller().updateField({
      courseId: COURSE_ID,
      stageId: 'stage_5',
      fieldPath: 'course_title',
      value: 'Standalone title',
    });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.mutations).toHaveLength(1);
    expect(db.mutations[0]).toMatchObject({
      table: 'courses',
      operation: 'update',
      payload: {
        course_structure: {
          course_title: 'Standalone title',
          schema_version: 2,
          sections: [{ id: 'sec_existing', lessons: [{ id: 'lsn_existing' }] }],
        },
        generation_metadata: { quality_scores: { other: 1, structure: { score: 1 } } },
      },
    });
    expect(result).toMatchObject({ success: true, fieldPath: 'course_title' });
  });

  it('rejects an administrator from another organization before invoking the service RPC', async () => {
    const db = database();
    getAdmin.mockReturnValue(db);
    await expect(
      caller({
        id: '66666666-6666-4666-8666-666666666666',
        role: 'admin',
        organizationId: '77777777-7777-4777-8777-777777777777',
      }).deleteDownstreamStages({
        courseId: COURSE_ID,
        fromStage: 4,
        pendingEdit: { fieldPath: 'topic_analysis.determined_topic', value: 'New topic' },
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.mutations).toEqual([]);
  });
});
