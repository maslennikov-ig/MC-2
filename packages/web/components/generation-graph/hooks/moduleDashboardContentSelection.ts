type LessonContentSelectionRow = {
  id: string
  lesson_id: string
  created_at: string | null
}

type LessonContentStatusSelectionRow = LessonContentSelectionRow & {
  status: string | null
}

export type LessonContentStatusLabels = {
  completedLabels: string[]
  reviewRequiredLabels: string[]
}

function getCreatedAtMs(row: LessonContentSelectionRow): number {
  if (!row.created_at) return Number.NEGATIVE_INFINITY

  const timestamp = Date.parse(row.created_at)
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

function isNewerLessonContentRow(
  candidate: LessonContentSelectionRow,
  current: LessonContentSelectionRow
): boolean {
  const candidateCreatedAt = getCreatedAtMs(candidate)
  const currentCreatedAt = getCreatedAtMs(current)

  if (candidateCreatedAt !== currentCreatedAt) {
    return candidateCreatedAt > currentCreatedAt
  }

  return candidate.id > current.id
}

export function selectLatestLessonContentRows<T extends LessonContentSelectionRow>(
  rows: readonly T[]
): Map<string, T> {
  const latestByLessonId = new Map<string, T>()

  for (const row of rows) {
    const current = latestByLessonId.get(row.lesson_id)

    if (!current || isNewerLessonContentRow(row, current)) {
      latestByLessonId.set(row.lesson_id, row)
    }
  }

  return latestByLessonId
}

function compareLessonLabels(a: string, b: string): number {
  const [aSection = 0, aLesson = 0] = a.split('.').map((part) => Number.parseInt(part, 10))
  const [bSection = 0, bLesson = 0] = b.split('.').map((part) => Number.parseInt(part, 10))

  if (aSection !== bSection) return aSection - bSection
  if (aLesson !== bLesson) return aLesson - bLesson
  return a.localeCompare(b)
}

export function selectLatestLessonContentStatusLabels<T extends LessonContentStatusSelectionRow>(
  rows: readonly T[],
  lessonLabelsById: ReadonlyMap<string, string>
): LessonContentStatusLabels {
  const latestRows = selectLatestLessonContentRows(rows)
  const completedLabels = new Set<string>()
  const reviewRequiredLabels = new Set<string>()

  for (const [lessonId, row] of latestRows.entries()) {
    const lessonLabel = lessonLabelsById.get(lessonId)
    if (!lessonLabel) continue

    const status = row.status?.toLowerCase()
    if (status === 'completed' || status === 'approved' || status === 'review_required') {
      completedLabels.add(lessonLabel)
    }

    if (status === 'review_required') {
      reviewRequiredLabels.add(lessonLabel)
    }
  }

  return {
    completedLabels: Array.from(completedLabels).sort(compareLessonLabels),
    reviewRequiredLabels: Array.from(reviewRequiredLabels).sort(compareLessonLabels),
  }
}
