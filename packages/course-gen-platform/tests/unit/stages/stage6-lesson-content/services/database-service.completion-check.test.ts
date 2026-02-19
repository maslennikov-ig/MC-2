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
  lessonContentsRows: Array<{ lesson_id: string; status?: string }>;
  updateError?: { message: string } | null;
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

  let lessonContentsStatusFilter: string | null = null;
  const buildLessonContentsResult = () => ({
    data:
      lessonContentsStatusFilter === null
        ? options.lessonContentsRows
        : options.lessonContentsRows.filter(row => row.status === lessonContentsStatusFilter),
    error: null,
  });

  const lessonContentsQuery = {
    eq: vi.fn(function (column: string, value: string) {
      if (column === 'status') {
        lessonContentsStatusFilter = value;
      }
      return lessonContentsQuery;
    }),
    not: vi.fn().mockImplementation(() => Promise.resolve(buildLessonContentsResult())),
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

  const lessonContentsTable = {
    select: vi.fn().mockReturnValue(lessonContentsQuery),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'courses') return coursesTable;
      if (table === 'lesson_contents') return lessonContentsTable;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, coursesTable, lessonContentsQuery };
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
    expect(mockNotifyCourseCompletion).toHaveBeenCalledTimes(1);
  });
});
