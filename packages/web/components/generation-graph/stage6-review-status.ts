import type {
  LessonInspectorData,
  LessonMatrixRow,
  ModuleDashboardAggregates,
  ModuleDashboardData,
  PipelineNodeState,
} from '@megacampus/shared-types/stage6-ui.types'
import type { NodeStatus } from '@megacampus/shared-types/generation-graph'

export type ReviewAwareLessonMatrixRow = LessonMatrixRow & {
  needsReview: boolean
}

export type ReviewAwareModuleDashboardAggregates = ModuleDashboardAggregates & {
  reviewRequiredLessons: number
}

export type ReviewAwareModuleDashboardData = Omit<ModuleDashboardData, 'lessons' | 'aggregates'> & {
  lessons: ReviewAwareLessonMatrixRow[]
  aggregates: ReviewAwareModuleDashboardAggregates
  needsReview: boolean
}

export type ReviewAwareLessonInspectorData = LessonInspectorData & {
  needsReview: boolean
  qualityScore?: number | null
}

export interface ReviewAwareGraphNodeState {
  status: NodeStatus
  visualStatus: NodeStatus
  needsReview: boolean
}

export interface ReviewAwareStage6GraphSummary {
  completedLessons: number
  readyLessons: number
  reviewRequiredLessons: number
  status: NodeStatus
  needsReview: boolean
}

export function isReviewRequiredStatus(status: string | null | undefined): boolean {
  return status?.toLowerCase() === 'review_required'
}

export function mapStage6LessonStatus(status: string): LessonMatrixRow['status'] {
  switch (status.toLowerCase()) {
    case 'approved':
      return 'approved'
    case 'review_required':
    case 'completed':
      return 'completed'
    case 'generating':
    case 'active':
      return 'active'
    case 'failed':
    case 'error':
      return 'error'
    case 'pending':
    default:
      return 'pending'
  }
}

export function getReviewAwareGraphNodeState(
  status: string | null | undefined
): ReviewAwareGraphNodeState {
  const normalizedStatus = status?.toLowerCase() ?? 'pending'

  if (normalizedStatus === 'review_required') {
    return {
      status: 'completed',
      visualStatus: 'awaiting',
      needsReview: true,
    }
  }

  switch (normalizedStatus) {
    case 'approved':
      return { status: 'approved', visualStatus: 'approved', needsReview: false }
    case 'completed':
      return { status: 'completed', visualStatus: 'completed', needsReview: false }
    case 'generating':
    case 'active':
      return { status: 'active', visualStatus: 'active', needsReview: false }
    case 'failed':
    case 'error':
      return { status: 'error', visualStatus: 'error', needsReview: false }
    case 'pending':
    default:
      return { status: 'pending', visualStatus: 'pending', needsReview: false }
  }
}

export function summarizeReviewAwareStage6Statuses(
  statuses: Array<string | null | undefined>
): ReviewAwareStage6GraphSummary {
  const mapped = statuses.map((status) => getReviewAwareGraphNodeState(status))
  const completedLessons = mapped.filter(
    (entry) => !entry.needsReview && (entry.status === 'completed' || entry.status === 'approved')
  ).length
  const readyLessons = mapped.filter(
    (entry) => entry.status === 'completed' || entry.status === 'approved'
  ).length
  const reviewRequiredLessons = mapped.filter((entry) => entry.needsReview).length

  let status: NodeStatus = 'pending'

  if (mapped.some((entry) => entry.status === 'error')) {
    status = 'error'
  } else if (mapped.some((entry) => entry.status === 'active')) {
    status = 'active'
  } else if (mapped.length > 0 && readyLessons === mapped.length) {
    status = 'completed'
  } else if (readyLessons > 0) {
    status = 'active'
  }

  return {
    completedLessons,
    readyLessons,
    reviewRequiredLessons,
    status,
    needsReview: reviewRequiredLessons > 0,
  }
}

export function calculateReviewAwareAggregates(
  lessons: ReviewAwareLessonMatrixRow[]
): ReviewAwareModuleDashboardAggregates {
  const totalLessons = lessons.length
  const completedLessons = lessons.filter((l) => l.status === 'completed' && !l.needsReview).length
  const approvedLessons = lessons.filter((l) => l.status === 'approved').length
  const activeLessons = lessons.filter((l) => l.status === 'active').length
  const errorLessons = lessons.filter((l) => l.status === 'error').length
  const pendingLessons = lessons.filter((l) => l.status === 'pending').length
  const reviewRequiredLessons = lessons.filter((l) => l.needsReview).length

  const totalCostUsd = lessons.reduce((sum, l) => sum + l.costUsd, 0)
  const totalTokens = lessons.reduce((sum, l) => sum + (l.totalTokens || 0), 0)

  const doneWithQuality = lessons.filter(
    (l) => (l.status === 'completed' || l.status === 'approved') && l.qualityScore !== null
  )
  const avgQualityScore =
    doneWithQuality.length > 0
      ? doneWithQuality.reduce((sum, l) => sum + (l.qualityScore || 0), 0) / doneWithQuality.length
      : null

  const totalDurationMs = lessons.reduce((sum, l) => sum + (l.durationMs || 0), 0)

  const doneWithDuration = lessons.filter(
    (l) =>
      (l.status === 'completed' || l.status === 'approved') &&
      l.durationMs !== null &&
      l.durationMs > 0
  )
  const avgDurationPerLesson =
    doneWithDuration.length > 0
      ? doneWithDuration.reduce((sum, l) => sum + (l.durationMs || 0), 0) / doneWithDuration.length
      : null

  const remainingLessons = pendingLessons + activeLessons
  const estimatedTimeRemainingMs =
    avgDurationPerLesson !== null && remainingLessons > 0
      ? avgDurationPerLesson * remainingLessons
      : null

  return {
    totalLessons,
    completedLessons,
    approvedLessons,
    activeLessons,
    errorLessons,
    pendingLessons,
    reviewRequiredLessons,
    totalCostUsd,
    avgQualityScore,
    totalDurationMs,
    estimatedTimeRemainingMs,
    totalTokens,
  }
}

export function getReviewAwareModuleStatus(
  lessons: ReviewAwareLessonMatrixRow[]
): ModuleDashboardData['status'] {
  if (lessons.length === 0) return 'pending'
  if (lessons.some((l) => l.status === 'error')) return 'error'
  if (lessons.some((l) => l.status === 'active')) return 'active'
  if (lessons.every((l) => l.status === 'completed' || l.status === 'approved')) {
    return 'completed'
  }
  return 'pending'
}

interface DeriveLessonInspectorStatusOptions {
  contentStatus: string | null | undefined
  pipelineNodes: Pick<PipelineNodeState, 'status'>[]
  hasContent: boolean
  hasFinishTrace: boolean
  hasErrorTrace: boolean
  hasTraces: boolean
}

export function deriveLessonInspectorStatus({
  contentStatus,
  pipelineNodes,
  hasContent,
  hasFinishTrace,
  hasErrorTrace,
  hasTraces,
}: DeriveLessonInspectorStatusOptions): Pick<
  ReviewAwareLessonInspectorData,
  'status' | 'needsReview'
> {
  const normalizedStatus = contentStatus?.toLowerCase() ?? null
  const needsReview = normalizedStatus === 'review_required'

  if (needsReview) {
    return { status: 'completed', needsReview: true }
  }

  if (normalizedStatus === 'approved' || normalizedStatus === 'completed') {
    return { status: 'completed', needsReview: false }
  }

  if (normalizedStatus === 'failed' || normalizedStatus === 'error') {
    return { status: 'error', needsReview: false }
  }

  if (normalizedStatus === 'generating' || normalizedStatus === 'active') {
    return { status: 'active', needsReview: false }
  }

  if (normalizedStatus === 'pending') {
    return { status: 'pending', needsReview: false }
  }

  if (pipelineNodes.length > 0) {
    if (pipelineNodes.some((node) => node.status === 'error')) {
      return { status: 'error', needsReview: false }
    }

    if (pipelineNodes.some((node) => node.status === 'active')) {
      return { status: 'active', needsReview: false }
    }

    if (pipelineNodes.every((node) => node.status === 'completed')) {
      return { status: 'completed', needsReview: false }
    }
  }

  if (!hasContent) {
    return { status: 'pending', needsReview: false }
  }

  if (hasErrorTrace) {
    return { status: 'error', needsReview: false }
  }

  if (hasFinishTrace) {
    return { status: 'completed', needsReview: false }
  }

  if (hasTraces) {
    return { status: 'active', needsReview: false }
  }

  return { status: 'pending', needsReview: false }
}
