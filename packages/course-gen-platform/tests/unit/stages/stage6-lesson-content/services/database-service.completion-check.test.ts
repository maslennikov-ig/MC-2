import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSupabaseAdmin, mockNotifyCourseCompletion, mockNotifyCourseError, mockLogger } =
  vi.hoisted(() => {
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
      mockNotifyCourseError: vi.fn().mockResolvedValue(undefined),
      mockLogger: logger,
    };
  });

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

vi.mock('@/shared/notifications/course-notifications', () => ({
  notifyCourseCompletion: mockNotifyCourseCompletion,
  notifyCourseError: mockNotifyCourseError,
}));

vi.mock('@/shared/logger', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

import {
  checkAndSetStage6Complete,
  failStage6Course,
  isStage6CourseActive,
  markForReview,
} from '@/stages/stage6-lesson-content/services/database-service';

type CourseRow = {
  generation_status: string;
  auto_finalize_after_stage6: boolean;
  generation_progress: Record<string, unknown> | null;
  target_audience?: string | null;
  course_structure: {
    sections: Array<{ lessons: Array<Record<string, unknown>> }>;
  };
};

function createSupabaseAdminMock(options: {
  courseRow: CourseRow;
  lessonContentsRows: Array<{
    lesson_id: string;
    status?: string;
    created_at?: string;
    content?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }>;
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
    target_audience: 'novice',
    course_structure: {
      sections: [{ lessons: [{ lesson_number: 1 }] }, { lessons: [{ lesson_number: 1 }] }],
    },
  };
}

describe('checkAndSetStage6Complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FEATURE_STAGE6_COURSE_AUDIT;
    delete process.env.FEATURE_STAGE6_QUALITY_ALERTS;
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

  it('downgrades auto-finalization to stage_6_complete when course audit flags cross-lesson repeats', async () => {
    process.env.FEATURE_STAGE6_COURSE_AUDIT = 'true';
    process.env.FEATURE_STAGE6_QUALITY_ALERTS = 'true';

    const repeatedAnalogy = `## Введение
Корпоративная социальная сеть похожа на чертеж здания: сначала проектируют каркас, потом заполняют его жизнью.

## Упражнения
Опишите первый шаг запуска сообщества.`;

    const { supabase, coursesTable, lessonContentsTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [
        {
          lesson_id: 'lesson-1',
          status: 'completed',
          metadata: {
            lessonLabel: '1.1',
            markdownContent: repeatedAnalogy,
            qaSignals: { version: 1, lesson_counters: { callout_count: 0, code_block_count: 0 } },
          },
          content: {
            metadata: {
              archetype_used: 'concept_explainer',
            },
          },
        },
        {
          lesson_id: 'lesson-2',
          status: 'completed',
          metadata: {
            lessonLabel: '1.2',
            markdownContent: repeatedAnalogy,
            qaSignals: { version: 1, lesson_counters: { callout_count: 0, code_block_count: 0 } },
          },
          content: {
            metadata: {
              archetype_used: 'concept_explainer',
            },
          },
        },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await checkAndSetStage6Complete('course-123');

    expect(coursesTable.update).toHaveBeenCalledTimes(1);
    expect(coursesTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_status: 'stage_6_complete',
      })
    );
    expect(lessonContentsTable.insert).toHaveBeenCalledTimes(2);
    expect(mockNotifyCourseCompletion).not.toHaveBeenCalled();
    expect(mockNotifyCourseError).toHaveBeenCalledTimes(1);
  });

  it('passes real target_audience into course audit instead of falling back to novice', async () => {
    process.env.FEATURE_STAGE6_COURSE_AUDIT = 'true';

    const { supabase, coursesTable, lessonContentsTable } = createSupabaseAdminMock({
      courseRow: {
        ...createCourseRow(true),
        target_audience: 'technical experts',
      },
      lessonContentsRows: [
        {
          lesson_id: 'lesson-1',
          status: 'completed',
          metadata: {
            lessonLabel: '1.1',
            markdownContent: '## Intro\n\n```python\nprint("a")\n```\n\n```json\n{"ok": true}\n```',
            qaSignals: { version: 1, lesson_counters: { callout_count: 0, code_block_count: 4 } },
          },
          content: {
            metadata: {
              archetype_used: 'concept_explainer',
            },
          },
        },
        {
          lesson_id: 'lesson-2',
          status: 'completed',
          metadata: {
            lessonLabel: '1.2',
            markdownContent: '## Intro\n\n```python\nprint("b")\n```\n\n```json\n{"ok": true}\n```',
            qaSignals: { version: 1, lesson_counters: { callout_count: 0, code_block_count: 3 } },
          },
          content: {
            metadata: {
              archetype_used: 'concept_explainer',
            },
          },
        },
      ],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await checkAndSetStage6Complete('course-123');

    expect(coursesTable.update).toHaveBeenCalledTimes(1);
    expect(coursesTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_status: 'completed',
        status: 'published',
      })
    );
    expect(lessonContentsTable.insert).not.toHaveBeenCalled();
    expect(mockNotifyCourseError).not.toHaveBeenCalled();
    expect(mockNotifyCourseCompletion).toHaveBeenCalledTimes(1);
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
    expect(lessonContentsTable.insert).toHaveBeenCalledTimes(1);
    expect(lessonContentsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        lesson_id: 'lesson-uuid',
        course_id: 'course-123',
        status: 'review_required',
        metadata: expect.objectContaining({
          lessonLabel: '1.1',
          failureReason: 'Generation failed after retries',
        }),
      })
    );
  });

  it('creates separate rows on repeated calls for same lesson', async () => {
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

    expect(lessonContentsTable.insert).toHaveBeenCalledTimes(2);
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

    expect(lessonContentsTable.insert).toHaveBeenCalledTimes(1);
    expect(lessonContentsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_attempt: 4,
      })
    );
  });

  it('persists quality ladder history in the final review_required marker', async () => {
    const { supabase, lessonContentsTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await markForReview(
      'course-123',
      'lesson-uuid' as unknown as string,
      '1.1' as unknown as string,
      'Automatic ladder exhausted',
      {
        qualityRecovery: {
          mode: 'automatic',
          attempts: [
            {
              sequence_index: 0,
              phase_name: 'stage_6_simple',
              mode: 'automatic',
              is_initial_rung: true,
              max_regeneration_retries: 1,
              rung_attempt_index: 0,
              outcome: 'quality_retryable',
              selected_model: 'stage_6_simple-primary',
              fallback_model: 'stage_6_simple-fallback',
              model_used: 'stage_6_simple-primary',
              quality_score: 0.41,
              errors: [],
              review_reasons: ['Low quality score'],
            },
            {
              sequence_index: 3,
              phase_name: 'stage_6_auto_last_chance',
              mode: 'automatic',
              is_initial_rung: false,
              promoted_from_phase_name: 'stage_6_complex',
              max_regeneration_retries: 0,
              rung_attempt_index: 0,
              outcome: 'quality_retryable',
              selected_model: 'z-ai/glm-5',
              fallback_model: 'qwen/qwen3.5-plus-02-15',
              model_used: 'z-ai/glm-5',
              quality_score: 0.52,
              errors: [],
              review_reasons: ['Still below threshold'],
            },
          ],
          final_disposition: {
            outcome: 'review_required',
            terminal_phase_name: 'stage_6_auto_last_chance',
            terminal_mode: 'automatic',
            human_review_required: true,
          },
        },
      }
    );

    expect(lessonContentsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          qualityRecovery: expect.objectContaining({
            mode: 'automatic',
            final_disposition: expect.objectContaining({
              terminal_phase_name: 'stage_6_auto_last_chance',
            }),
          }),
        }),
      })
    );
  });

  it('persists selected model phase/source in review_required metadata', async () => {
    const { supabase, lessonContentsTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await markForReview(
      'course-123',
      'lesson-uuid' as unknown as string,
      '1.1' as unknown as string,
      'Automatic ladder exhausted',
      {
        selectedModel: 'z-ai/glm-5',
        selectedModelPhase: 'stage_6_auto_last_chance',
        selectedModelSource: 'database',
      }
    );

    expect(lessonContentsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          selectedModel: 'z-ai/glm-5',
          selectedModelPhase: 'stage_6_auto_last_chance',
          selectedModelSource: 'database',
        }),
      })
    );
  });
});

describe('isStage6CourseActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows full generation only while stage_6_generating', async () => {
    const { supabase } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await expect(isStage6CourseActive('course-123', 'full_generation')).resolves.toBe(true);
    await expect(isStage6CourseActive('course-123', 'partial_regeneration')).resolves.toBe(true);
  });

  it('allows remediation contexts on completed courses but rejects full generation', async () => {
    const { supabase } = createSupabaseAdminMock({
      courseRow: {
        ...createCourseRow(true),
        generation_status: 'completed',
      },
      lessonContentsRows: [],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await expect(isStage6CourseActive('course-123', 'full_generation')).resolves.toBe(false);
    await expect(isStage6CourseActive('course-123', 'partial_regeneration')).resolves.toBe(true);
    await expect(isStage6CourseActive('course-123', 'manual_regeneration')).resolves.toBe(true);
  });
});

describe('failStage6Course', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the course as failed and sends a Stage 6 error notification', async () => {
    const { supabase, coursesTable } = createSupabaseAdminMock({
      courseRow: createCourseRow(true),
      lessonContentsRows: [],
    });
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    await failStage6Course('course-123', 'Required RAG documents unavailable');

    expect(coursesTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_status: 'failed',
        failed_at_stage: 6,
        generation_metadata: expect.objectContaining({
          failed_phase: 'stage_6',
          error_message: 'Required RAG documents unavailable',
        }),
      })
    );
    expect(mockNotifyCourseError).toHaveBeenCalledWith(
      'course-123',
      6,
      'Required RAG documents unavailable'
    );
  });
});
