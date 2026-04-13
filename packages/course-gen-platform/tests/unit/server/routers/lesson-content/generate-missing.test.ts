import { describe, expect, it } from 'vitest';
import { getLessonIdsWithUsableContent } from '@/server/routers/lesson-content/procedures/generate-missing';

type LessonContentRow = {
  id: string;
  status: string;
  created_at: string;
  content: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

type LessonWithContentRow = {
  order_index: number;
  sections: { order_index: number } | Array<{ order_index: number }> | null;
  lesson_contents: LessonContentRow[] | null;
};

function createLessonContentRow(overrides: Partial<LessonContentRow> = {}): LessonContentRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    status: overrides.status ?? 'completed',
    created_at: overrides.created_at ?? '2026-04-13T10:00:00.000Z',
    content: overrides.content ?? null,
    metadata: overrides.metadata ?? null,
  };
}

function createLessonRow(overrides: Partial<LessonWithContentRow> = {}): LessonWithContentRow {
  return {
    order_index: overrides.order_index ?? 1,
    sections: overrides.sections ?? { order_index: 1 },
    lesson_contents: overrides.lesson_contents ?? null,
  };
}

describe('getLessonIdsWithUsableContent', () => {
  it('treats review-only rows as missing until a usable version exists', () => {
    const lessonIds = getLessonIdsWithUsableContent([
      createLessonRow({
        order_index: 1,
        lesson_contents: [
          createLessonContentRow({
            id: 'review-only',
            status: 'review_required',
            created_at: '2026-04-13T11:00:00.000Z',
            metadata: { markdownContent: '# Needs review' },
          }),
        ],
      }),
      createLessonRow({
        order_index: 2,
        lesson_contents: [
          createLessonContentRow({
            id: 'latest-review-only',
            status: 'review_required',
            created_at: '2026-04-13T11:00:00.000Z',
            metadata: { markdownContent: '# New draft' },
          }),
          createLessonContentRow({
            id: 'older-usable',
            status: 'completed',
            created_at: '2026-04-13T10:00:00.000Z',
            metadata: { markdownContent: '# Stable lesson' },
          }),
        ],
      }),
      createLessonRow({
        order_index: 3,
        lesson_contents: [
          createLessonContentRow({
            id: 'completed',
            status: 'completed',
            created_at: '2026-04-13T09:00:00.000Z',
            metadata: { markdownContent: '# Final lesson' },
          }),
        ],
      }),
    ] as Parameters<typeof getLessonIdsWithUsableContent>[0]);

    expect(Array.from(lessonIds).sort()).toEqual(['1.2', '1.3']);
  });
});
