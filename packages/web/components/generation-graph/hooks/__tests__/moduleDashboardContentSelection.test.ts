import { describe, expect, it } from 'vitest'

import {
  selectLatestLessonContentRows,
  selectLatestLessonContentStatusLabels,
} from '../moduleDashboardContentSelection'

type LessonContentFixture = {
  id: string
  lesson_id: string
  status: string
  created_at: string
}

const oldCompleted: LessonContentFixture = {
  id: 'old-completed',
  lesson_id: 'lesson-1',
  status: 'completed',
  created_at: '2026-04-13T08:23:54.000Z',
}

const newReviewRequired: LessonContentFixture = {
  id: 'new-review-required',
  lesson_id: 'lesson-1',
  status: 'review_required',
  created_at: '2026-04-30T12:26:11.000Z',
}

describe('selectLatestLessonContentRows', () => {
  it('keeps the newest lesson_contents row even when an older completed row appears first', () => {
    const selected = selectLatestLessonContentRows([oldCompleted, newReviewRequired])

    expect(selected.get('lesson-1')?.status).toBe('review_required')
    expect(selected.get('lesson-1')?.id).toBe('new-review-required')
  })

  it('uses id as a deterministic tie-breaker when created_at matches', () => {
    const selected = selectLatestLessonContentRows([
      { ...oldCompleted, id: 'a-row', created_at: '2026-04-30T12:26:11.000Z' },
      { ...newReviewRequired, id: 'z-row' },
    ])

    expect(selected.get('lesson-1')?.id).toBe('z-row')
  })
})

describe('selectLatestLessonContentStatusLabels', () => {
  it('preserves review-required labels as ready but review-needed for graph rendering', () => {
    const selected = selectLatestLessonContentStatusLabels(
      [oldCompleted, newReviewRequired],
      new Map([['lesson-1', '1.1']])
    )

    expect(selected.completedLabels).toEqual(['1.1'])
    expect(selected.reviewRequiredLabels).toEqual(['1.1'])
  })
})
