import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSupabaseAdmin, mockNotifyCourseCompletion, mockLogger } = vi.hoisted(() => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    mockGetSupabaseAdmin: vi.fn(),
    mockNotifyCourseCompletion: vi.fn().mockResolvedValue(undefined),
    mockLogger: logger,
  };
});

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

vi.mock('@/shared/notifications/course-notifications', () => ({
  notifyCourseCompletion: mockNotifyCourseCompletion,
}));

vi.mock('@/shared/logger', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

import { checkAndSetStage6Complete } from '@/stages/stage6-lesson-content/services/database-service';
import { markForReview } from '@/stages/stage6-lesson-content/services/database-service';

type CourseRow = {
  generation_status: string;
  auto_finalize_after_stage6: boolean;
  generation_progress: Record<string, unknown> | null;
  course_structure: {
    sections: Array<{ lessons: Array<Record<string, unknown>> }>;
  };
};

function createSupabaseAdminMock(options: {
  courseRow: CourseRow;
  lessonContentsRows: Array<{ lesson_id: string; status?: string; created_at?: string }>;
  updateError?: { message: string } | null;
  lessonUpdateError?: { message: string } | null;
  insertError?: { message: string } | null;
}) {
  const courseSelectQuery = {
    eq: vi.fn(function () {
      return courseSelectQuery;
    }),
    single: vi.fn().mockResolvedValue({
      data: options.courseRow,
      error: null,
    }),
  };

  const rowsWithCreatedAt = options.lessonContentsRows.map((row, index) => ({
    created_at: row.created_at ?? `2026-01-01T00:00:${String(index).padStart(2, '0')}Z`,
    ...row,
  }));

  const buildLessonContentsResult = () => ({
    data: rowsWithCreatedAt
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    error: null,
  });

  const lessonContentsQuery = {
    eq: vi.fn(function () {
      return lessonContentsQuery;
    }),
    order: vi.fn().mockImplementation(() => Promise.resolve(buildLessonContentsResult())),
    then: (
      resolve: (v: ReturnType<typeof buildLessonContentsResult>) => unknown,
      reject?: (e: unknown) => unknown
    ) => Promise.resolve(buildLessonContentsResult()).then(resolve, reject),
  };

  const updateResult = { error: options.updateError ?? null };
  const updateQuery = {
    eq: vi.fn(function () {
      return updateQuery;
    }),
    then: (resolve: (v: typeof updateResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(updateResult).then(resolve, reject),
  };

  const coursesTable = {
    select: vi.fn().mockReturnValue(courseSelectQuery),
    update: vi.fn().mockReturnValue(updateQuery),
  };

  const lessonUpdateResult = { error: options.lessonUpdateError ?? null };
  const lessonUpdateQuery = {
    eq: vi.fn(function () {
      return lessonUpdateQuery;
    }),
    then: (resolve: (v: typeof lessonUpdateResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(lessonUpdateResult).then(resolve, reject),
  };

  const lessonsTable = {
    update: vi.fn().mockReturnValue(lessonUpdateQuery),
  };

  const insertResult = { error: options.insertError ?? null };
  const lessonContentsTable = {
    select: vi.fn().mockReturnValue(lessonContentsQuery),
    insert: vi.fn().mockResolvedValue(insertResult),
    upsert: vi.fn().mockResolvedValue(insertResult),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'courses') return coursesTable;
      if (table === 'lessons') return lessonsTable;
      if (table === 'lesson_contents') return lessonContentsTable;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, coursesTable, lessonContentsTable, lessonsTable };
}

function createCourseRow(autoFinalize = true): CourseRow {
  return {
    generation_status: 'stage_6_generating',
    auto_finalize_after_stage6: autoFinalize,
    generation_progress: null,
    course_structure: {
      sections: [{ lessons: [{ lesson_number: 1 }] }, { lessons: [{ lesson_number: 1 }] }],
    },
  };
}

describe('checkAndSetStage6Complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not finalize course when only rejected lesson contents exist', async () => {
    const { supabase, coursesTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [
        { lesson_id: 'lesson-1', status: 'rejected' },
        { lesson_id: 'lesson-2', status: 'rejected' },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await checkAndSetStage6Complete('course-123');

    expect(coursesTable.update).not.toHaveBeenCalled();
    expect(mockNotifyCourseCompletion).not.toHaveBeenCalled();
  });

  it('finalizes course when all expected lessons are completed', async () => {
    const { supabase, coursesTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [
        { lesson_id: 'lesson-1', status: 'completed' },
        { lesson_id: 'lesson-2', status: 'completed' },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await checkAndSetStage6Complete('course-123');

    expect(coursesTable.update).toHaveBeenCalledTimes(1);
    expect(coursesTable.update).toHaveBeenCalledWith(
      expect.objectContaining({ generation_status: 'completed', status: 'published' })
    );
    expect(mockNotifyCourseCompletion).toHaveBeenCalledTimes(1);
  });

  it('moves to stage_6_complete when lessons are terminal but not fully completed', async () => {
    const { supabase, coursesTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [
        { lesson_id: 'lesson-1', status: 'review_required' },
        { lesson_id: 'lesson-2', status: 'failed' },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await checkAndSetStage6Complete('course-123');

    expect(coursesTable.update).toHaveBeenCalledTimes(1);
    const updateArg = coursesTable.update.mock.calls[0][0];
    expect(updateArg).toEqual(expect.objectContaining({ generation_status: 'stage_6_complete' }));
    expect(updateArg).not.toHaveProperty('status');
    expect(mockNotifyCourseCompletion).not.toHaveBeenCalled();
  });

  it('uses latest lesson status when deciding terminal completion', async () => {
    const { supabase, coursesTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [
        // Latest status for lesson-1 is generating -> not terminal.
        { lesson_id: 'lesson-1', status: 'failed', created_at: '2026-01-01T00:00:00Z' },
        { lesson_id: 'lesson-1', status: 'generating', created_at: '2026-01-01T00:00:10Z' },
        { lesson_id: 'lesson-2', status: 'completed', created_at: '2026-01-01T00:00:20Z' },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await checkAndSetStage6Complete('course-123');

    expect(coursesTable.update).not.toHaveBeenCalled();
    expect(mockNotifyCourseCompletion).not.toHaveBeenCalled();
  });
});

describe('markForReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists review_required terminal marker in lesson_contents', async () => {
    const { supabase, lessonContentsTable, lessonsTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await markForReview(
      'course-123',
      'lesson-uuid' as unknown as string,
      '1.1' as unknown as string,
      'Generation failed after retries'
    );

    expect(lessonsTable.update).toHaveBeenCalledTimes(1);
    expect(lessonContentsTable.upsert).toHaveBeenCalledTimes(1);
    expect(lessonContentsTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lesson_id: 'lesson-uuid',
        course_id: 'course-123',
        status: 'review_required',
        metadata: expect.objectContaining({
          lessonLabel: '1.1',
          failureReason: 'Generation failed after retries',
        }),
      }),
      { onConflict: 'lesson_id' }
    );
  });

  it('uses upsert with onConflict on repeated calls for same lesson', async () => {
    const { supabase, lessonContentsTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await markForReview(
      'course-123',
      'lesson-uuid' as unknown as string,
      '1.1' as unknown as string,
      'First failure'
    );

    await markForReview(
      'course-123',
      'lesson-uuid' as unknown as string,
      '1.1' as unknown as string,
      'Second failure'
    );

    expect(lessonContentsTable.upsert).toHaveBeenCalledTimes(2);
    expect(lessonContentsTable.upsert).toHaveBeenNthCalledWith(1, expect.any(Object), {
      onConflict: 'lesson_id',
    });
    expect(lessonContentsTable.upsert).toHaveBeenNthCalledWith(2, expect.any(Object), {
      onConflict: 'lesson_id',
    });
  });

  it('uses regenerateCount for generation_attempt field', async () => {
    const { supabase, lessonContentsTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await markForReview(
      'course-123',
      'lesson-uuid' as unknown as string,
      '1.1' as unknown as string,
      'Generation failed after retries',
      { regenerateCount: 3 }
    );

    expect(lessonContentsTable.upsert).toHaveBeenCalledTimes(1);
    expect(lessonContentsTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_attempt: 4,
      }),
      expect.any(Object)
    );
  });
});
