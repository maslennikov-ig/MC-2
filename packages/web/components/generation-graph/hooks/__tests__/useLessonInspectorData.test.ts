import { describe, expect, it } from 'vitest'
import { selectLessonInspectorContentRows } from '../useLessonInspectorData'

type LessonContentRowFixture = {
  id: string
  status: string | null
  created_at: string
  content: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

function createLessonContentRow(
  overrides: Partial<LessonContentRowFixture> = {}
): LessonContentRowFixture {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    status: overrides.status ?? 'completed',
    created_at: overrides.created_at ?? new Date().toISOString(),
    content: overrides.content ?? null,
    metadata: overrides.metadata ?? null,
  }
}

describe('selectLessonInspectorContentRows', () => {
  it('keeps an empty latest review_required row as review-needed without falling back to older preview', () => {
    const latestReviewRequired = createLessonContentRow({
      id: 'latest-review-required',
      status: 'review_required',
      created_at: '2026-04-06T12:00:00.000Z',
      content: null,
      metadata: null,
    })
    const olderCompleted = createLessonContentRow({
      id: 'older-completed',
      status: 'completed',
      created_at: '2026-04-06T11:00:00.000Z',
      metadata: { markdownContent: '# Older lesson preview' },
    })

    const selection = selectLessonInspectorContentRows([latestReviewRequired, olderCompleted])

    expect(selection.statusRow?.id).toBe('latest-review-required')
    expect(selection.previewRow).toBeNull()
  })

  it('uses the latest review_required row when it still has usable preview content', () => {
    const latestReviewRequired = createLessonContentRow({
      id: 'latest-review-required',
      status: 'review_required',
      created_at: '2026-04-06T12:00:00.000Z',
      metadata: { markdownContent: '# Latest review preview' },
    })
    const olderCompleted = createLessonContentRow({
      id: 'older-completed',
      status: 'completed',
      created_at: '2026-04-06T11:00:00.000Z',
      metadata: { markdownContent: '# Older lesson preview' },
    })

    const selection = selectLessonInspectorContentRows([latestReviewRequired, olderCompleted])

    expect(selection.statusRow?.id).toBe('latest-review-required')
    expect(selection.previewRow?.id).toBe('latest-review-required')
  })
})
