import { describe, it, expect } from 'vitest'
import {
  getLatestLessonContentRow,
  getLatestUsableLessonContent,
  getLessonInspectorContentPresentation,
} from '../lessonInspectorContent'

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

describe('lessonInspectorContent helpers', () => {
  it('resolves the latest status row by created_at even when rows arrive unsorted', () => {
    const older = createLessonContentRow({
      id: 'older',
      status: 'completed',
      created_at: '2026-04-05T10:00:00.000Z',
      metadata: { markdownContent: '# Older lesson' },
    })
    const latest = createLessonContentRow({
      id: 'latest',
      status: 'review_required',
      created_at: '2026-04-05T11:00:00.000Z',
      content: null,
      metadata: null,
    })

    expect(getLatestLessonContentRow([older, latest])?.id).toBe('latest')
  })

  it('uses the latest row when it is already usable for preview', () => {
    const older = createLessonContentRow({
      id: 'older',
      created_at: '2026-04-05T10:00:00.000Z',
      metadata: { markdownContent: '# Older lesson' },
    })
    const latest = createLessonContentRow({
      id: 'latest',
      created_at: '2026-04-05T11:00:00.000Z',
      metadata: { markdownContent: '# Latest lesson' },
    })

    const selected = getLatestUsableLessonContent([latest, older])
    const presentation = getLessonInspectorContentPresentation(selected)

    expect(selected?.id).toBe('latest')
    expect(presentation.rawMarkdown).toBe('# Latest lesson')
  })

  it('falls back to an older usable row when the latest row is empty or unusable', () => {
    const latestEmpty = createLessonContentRow({
      id: 'latest-empty',
      status: 'review_required',
      created_at: '2026-04-05T11:00:00.000Z',
      content: null,
      metadata: null,
    })
    const olderUsable = createLessonContentRow({
      id: 'older-usable',
      status: 'completed',
      created_at: '2026-04-05T10:00:00.000Z',
      content: {
        intro: 'Older intro',
        sections: [
          {
            title: 'Section',
            content: 'Stable content body',
          },
        ],
      },
      metadata: {},
    })

    const selected = getLatestUsableLessonContent([olderUsable, latestEmpty])
    const presentation = getLessonInspectorContentPresentation(selected)

    expect(selected?.id).toBe('older-usable')
    expect(presentation.rawMarkdown).toContain('Stable content body')
  })

  it('returns an honest empty presentation when no usable rows exist', () => {
    const latestEmpty = createLessonContentRow({
      id: 'latest-empty',
      status: 'review_required',
      created_at: '2026-04-05T11:00:00.000Z',
      content: null,
      metadata: null,
    })
    const olderPending = createLessonContentRow({
      id: 'older-pending',
      status: 'pending',
      created_at: '2026-04-05T10:00:00.000Z',
      content: {},
      metadata: {},
    })

    const selected = getLatestUsableLessonContent([latestEmpty, olderPending])
    const presentation = getLessonInspectorContentPresentation(selected)

    expect(selected).toBeNull()
    expect(presentation.rawMarkdown).toBeNull()
    expect(presentation.content).toBeNull()
  })
})
