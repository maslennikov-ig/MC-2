import { describe, it, expect } from 'vitest'
import {
  calculateReviewAwareAggregates,
  deriveLessonInspectorStatus,
  getReviewAwareGraphNodeState,
  getReviewAwareModuleStatus,
  mapStage6LessonStatus,
  summarizeReviewAwareStage6Statuses,
  type ReviewAwareLessonMatrixRow,
} from '../../stage6-review-status'

function createMockLesson(
  overrides: Partial<ReviewAwareLessonMatrixRow> = {}
): ReviewAwareLessonMatrixRow {
  return {
    lessonId: '1.1',
    lessonNumber: 1,
    title: 'Test Lesson',
    status: 'pending',
    pipelineState: { nodes: [] },
    qualityScore: null,
    costUsd: 0,
    durationMs: null,
    retryCount: 0,
    canRetry: false,
    totalTokens: null,
    needsReview: false,
    ...overrides,
  }
}

describe('mapStage6LessonStatus', () => {
  it('maps review_required to completed base status instead of pending', () => {
    expect(mapStage6LessonStatus('review_required')).toBe('completed')
  })

  it('keeps existing approved mapping intact', () => {
    expect(mapStage6LessonStatus('approved')).toBe('approved')
  })
})

describe('calculateReviewAwareAggregates', () => {
  it('counts review-required lessons separately without degrading them to pending', () => {
    const lessons: ReviewAwareLessonMatrixRow[] = [
      createMockLesson({ status: 'completed', needsReview: true, qualityScore: 0.72 }),
      createMockLesson({ lessonId: '1.2', lessonNumber: 2, status: 'completed' }),
      createMockLesson({ lessonId: '1.3', lessonNumber: 3, status: 'pending' }),
    ]

    const aggregates = calculateReviewAwareAggregates(lessons)

    expect(aggregates.reviewRequiredLessons).toBe(1)
    expect(aggregates.completedLessons).toBe(1)
    expect(aggregates.pendingLessons).toBe(1)
  })

  it('treats review-required lessons as done for quality and remaining-time math', () => {
    const lessons: ReviewAwareLessonMatrixRow[] = [
      createMockLesson({
        status: 'completed',
        needsReview: true,
        qualityScore: 0.7,
        durationMs: 1_000,
      }),
      createMockLesson({
        lessonId: '1.2',
        lessonNumber: 2,
        status: 'completed',
        qualityScore: 0.9,
        durationMs: 3_000,
      }),
      createMockLesson({ lessonId: '1.3', lessonNumber: 3, status: 'active' }),
    ]

    const aggregates = calculateReviewAwareAggregates(lessons)

    expect(aggregates.avgQualityScore).toBe(0.8)
    expect(aggregates.estimatedTimeRemainingMs).toBe(2_000)
  })
})

describe('getReviewAwareModuleStatus', () => {
  it('marks a module as completed when all lessons are completed/approved/review-required', () => {
    const lessons: ReviewAwareLessonMatrixRow[] = [
      createMockLesson({ status: 'completed', needsReview: true }),
      createMockLesson({ lessonId: '1.2', lessonNumber: 2, status: 'approved' }),
    ]

    expect(getReviewAwareModuleStatus(lessons)).toBe('completed')
  })
})

describe('deriveLessonInspectorStatus', () => {
  it('surfaces review_required as completed content that still needs manual review', () => {
    const state = deriveLessonInspectorStatus({
      contentStatus: 'review_required',
      pipelineNodes: [{ node: 'judge', status: 'completed' }],
      hasContent: true,
      hasFinishTrace: true,
      hasErrorTrace: false,
      hasTraces: true,
    })

    expect(state).toEqual({
      status: 'completed',
      needsReview: true,
    })
  })

  it('falls back to pipeline state when lesson-content status is absent', () => {
    const state = deriveLessonInspectorStatus({
      contentStatus: null,
      pipelineNodes: [{ node: 'generator', status: 'active' }],
      hasContent: false,
      hasFinishTrace: false,
      hasErrorTrace: false,
      hasTraces: true,
    })

    expect(state).toEqual({
      status: 'active',
      needsReview: false,
    })
  })

  it('treats rejected lesson content as a failed inspector state', () => {
    const state = deriveLessonInspectorStatus({
      contentStatus: 'rejected',
      pipelineNodes: [{ node: 'judge', status: 'completed' }],
      hasContent: true,
      hasFinishTrace: true,
      hasErrorTrace: false,
      hasTraces: true,
    })

    expect(state).toEqual({
      status: 'error',
      needsReview: false,
    })
  })
})

describe('getReviewAwareGraphNodeState', () => {
  it('keeps review_required lessons semantically completed but visually review-needed', () => {
    expect(getReviewAwareGraphNodeState('review_required')).toEqual({
      status: 'completed',
      visualStatus: 'awaiting',
      needsReview: true,
    })
  })
})

describe('summarizeReviewAwareStage6Statuses', () => {
  it('counts review-required lessons as ready while preserving a module-level review flag', () => {
    expect(
      summarizeReviewAwareStage6Statuses(['completed', 'review_required', 'pending'])
    ).toEqual({
      completedLessons: 1,
      readyLessons: 2,
      reviewRequiredLessons: 1,
      status: 'active',
      needsReview: true,
    })
  })

  it('treats fully review-required batches as completed progress with review-needed state', () => {
    expect(summarizeReviewAwareStage6Statuses(['review_required', 'review_required'])).toEqual({
      completedLessons: 0,
      readyLessons: 2,
      reviewRequiredLessons: 2,
      status: 'completed',
      needsReview: true,
    })
  })
})
