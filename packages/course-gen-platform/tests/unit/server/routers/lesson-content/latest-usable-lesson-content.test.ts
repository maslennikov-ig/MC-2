import { describe, it, expect } from 'vitest';
import { getLatestUsableLessonContent } from '../../../../../src/server/routers/lesson-content/procedures/latest-usable-lesson-content';

type LessonContentRowFixture = {
  id: string;
  status: string;
  created_at: string;
  content: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

function createLessonContentRow(
  overrides: Partial<LessonContentRowFixture> = {}
): LessonContentRowFixture {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    status: overrides.status ?? 'completed',
    created_at: overrides.created_at ?? new Date().toISOString(),
    content: overrides.content ?? null,
    metadata: overrides.metadata ?? null,
  };
}

describe('getLatestUsableLessonContent', () => {
  it('returns the latest row when it is already usable', () => {
    const older = createLessonContentRow({
      id: 'older',
      created_at: '2026-04-05T10:00:00.000Z',
      metadata: { markdownContent: '# Older lesson' },
    });
    const latest = createLessonContentRow({
      id: 'latest',
      created_at: '2026-04-05T11:00:00.000Z',
      metadata: { markdownContent: '# Latest lesson' },
    });

    const selected = getLatestUsableLessonContent([latest, older]);

    expect(selected?.id).toBe('latest');
  });

  it('falls back to an older usable row when the latest row is empty or unusable', () => {
    const latestEmpty = createLessonContentRow({
      id: 'latest-empty',
      status: 'review_required',
      created_at: '2026-04-05T11:00:00.000Z',
      content: null,
      metadata: null,
    });
    const olderUsable = createLessonContentRow({
      id: 'older-usable',
      status: 'completed',
      created_at: '2026-04-05T10:00:00.000Z',
      metadata: { markdownContent: '# Stable lesson content' },
    });

    const selected = getLatestUsableLessonContent([latestEmpty, olderUsable]);

    expect(selected?.id).toBe('older-usable');
  });

  it('skips latest review_required rows even when they contain markdown', () => {
    const latestReviewOnly = createLessonContentRow({
      id: 'latest-review-only',
      status: 'review_required',
      created_at: '2026-04-05T11:00:00.000Z',
      metadata: { markdownContent: '# Review-only draft' },
    });
    const olderCompleted = createLessonContentRow({
      id: 'older-completed',
      status: 'completed',
      created_at: '2026-04-05T10:00:00.000Z',
      metadata: { markdownContent: '# Stable published lesson' },
    });

    const selected = getLatestUsableLessonContent([latestReviewOnly, olderCompleted]);

    expect(selected?.id).toBe('older-completed');
  });

  it('returns null when no usable lesson content rows exist', () => {
    const latestEmpty = createLessonContentRow({
      id: 'latest-empty',
      status: 'review_required',
      created_at: '2026-04-05T11:00:00.000Z',
      content: null,
      metadata: null,
    });
    const olderPending = createLessonContentRow({
      id: 'older-pending',
      status: 'pending',
      created_at: '2026-04-05T10:00:00.000Z',
      content: {},
      metadata: {},
    });

    const selected = getLatestUsableLessonContent([latestEmpty, olderPending]);

    expect(selected).toBeNull();
  });
});
