type LessonContentLike = {
  content?: unknown
  metadata?: unknown
  status?: unknown
}

type DatedLessonContentLike = LessonContentLike & {
  created_at?: string | null
  status?: string | null
}

interface LessonContentPreviewData {
  introduction: string
  sections: Array<{
    title: string
    content: string
    keyPoints: string[]
  }>
  summary: string
  exerciseCount: number
}

export interface LessonInspectorContentPresentation {
  content: LessonContentPreviewData | null
  rawMarkdown: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '...'
}

function extractKeyPoints(content: string): string[] {
  const lines = content.split('\n')
  const keyPoints: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const point = trimmed.replace(/^[-*+\d.]\s+/, '').trim()
      if (point.length > 0 && point.length < 200) {
        keyPoints.push(point)
      }
    }

    if (keyPoints.length >= 5) break
  }

  return keyPoints
}

function buildMarkdownFromContent(content: Record<string, unknown>): string {
  const directMarkdown =
    getNonEmptyString(content.markdown) ??
    getNonEmptyString(content.rawMarkdown) ??
    getNonEmptyString(content.raw_markdown) ??
    getNonEmptyString(content.text)

  if (directMarkdown) {
    return directMarkdown
  }

  const sections = Array.isArray(content.sections)
    ? (content.sections as Array<Record<string, unknown>>)
    : []
  const exercises = Array.isArray(content.exercises)
    ? (content.exercises as Array<Record<string, unknown>>)
    : []
  const parts: string[] = []

  const intro = getNonEmptyString(content.intro) ?? getNonEmptyString(content.introduction)
  if (intro) {
    parts.push(`## Введение\n\n${intro}`)
  }

  const mainContent =
    getNonEmptyString(content.mainContent) ?? getNonEmptyString(content.main_content)
  if (mainContent) {
    parts.push(`## Основной контент\n\n${mainContent}`)
  }

  for (const section of sections) {
    const title = getNonEmptyString(section.title)
    const body = getNonEmptyString(section.content)

    if (title) {
      parts.push(`## ${title}`)
    }
    if (body) {
      parts.push(body)
    }
  }

  const summary = getNonEmptyString(content.summary)
  if (summary) {
    parts.push(`## Заключение\n\n${summary}`)
  }

  if (exercises.length > 0) {
    parts.push('## Упражнения')

    for (const exercise of exercises) {
      const title = getNonEmptyString(exercise.title)
      const description =
        getNonEmptyString(exercise.description) ?? getNonEmptyString(exercise.question)

      if (title) {
        parts.push(`### ${title}`)
      }
      if (description) {
        parts.push(description)
      }
    }
  }

  if (parts.length > 0) {
    return parts.join('\n\n')
  }

  return getNonEmptyString(content.body) ?? ''
}

function parseLessonContent(
  contentRow: LessonContentLike | null | undefined
): LessonContentPreviewData | null {
  if (!contentRow?.content || !isRecord(contentRow.content)) return null

  let contentObj = contentRow.content

  if (isRecord(contentObj.content)) {
    contentObj = contentObj.content
  }

  const intro = contentObj.intro as string | undefined
  const sections = contentObj.sections as Array<Record<string, unknown>> | undefined
  const summary = contentObj.summary as string | undefined
  const exercises = contentObj.exercises as Array<unknown> | undefined

  return {
    introduction: intro || '',
    sections:
      sections?.map((section) => ({
        title: (section.title as string) || '',
        content: truncateContent((section.content as string) || '', 500),
        keyPoints: extractKeyPoints((section.content as string) || ''),
      })) || [],
    summary: summary || '',
    exerciseCount: exercises?.length || 0,
  }
}

function getRawMarkdown(contentRow: LessonContentLike | null | undefined): string | null {
  if (!contentRow) {
    return null
  }

  const metadata = isRecord(contentRow.metadata) ? contentRow.metadata : null
  const metadataMarkdown = metadata ? getNonEmptyString(metadata.markdownContent) : null
  if (metadataMarkdown) {
    return metadataMarkdown
  }

  if (typeof contentRow.content === 'string') {
    return getNonEmptyString(contentRow.content)
  }

  if (!isRecord(contentRow.content)) {
    return null
  }

  const nestedContent = isRecord(contentRow.content.content) ? contentRow.content.content : null

  const markdown = buildMarkdownFromContent(nestedContent ?? contentRow.content)
  return markdown.trim().length > 0 ? markdown : null
}

function hasPreviewContent(content: LessonContentPreviewData | null): boolean {
  if (!content) {
    return false
  }

  return Boolean(
    content.introduction.trim() ||
      content.summary.trim() ||
      content.sections.some((section) => section.title.trim() || section.content.trim()) ||
      content.exerciseCount > 0
  )
}

function isRejectedLessonContent(contentRow: LessonContentLike | null | undefined): boolean {
  return typeof contentRow?.status === 'string' && contentRow.status.toLowerCase() === 'rejected'
}

function getCreatedAtTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

function sortLessonContentRowsNewestFirst<T extends DatedLessonContentLike>(
  rows: T[] | null | undefined
): T[] {
  if (!rows || rows.length === 0) {
    return []
  }

  return [...rows].sort(
    (left, right) =>
      getCreatedAtTimestamp(right.created_at) - getCreatedAtTimestamp(left.created_at)
  )
}

export function getLessonInspectorContentPresentation(
  contentRow: LessonContentLike | null | undefined
): LessonInspectorContentPresentation {
  const content = parseLessonContent(contentRow)
  const rawMarkdown = getRawMarkdown(contentRow)

  return {
    content,
    rawMarkdown,
  }
}

export function isLessonContentUsable(contentRow: LessonContentLike | null | undefined): boolean {
  if (isRejectedLessonContent(contentRow)) {
    return false
  }

  const presentation = getLessonInspectorContentPresentation(contentRow)
  return Boolean(presentation.rawMarkdown?.trim() || hasPreviewContent(presentation.content))
}

export function getLatestLessonContentRow<T extends DatedLessonContentLike>(
  rows: T[] | null | undefined
): T | null {
  return sortLessonContentRowsNewestFirst(rows)[0] ?? null
}

export function getLatestUsableLessonContent<T extends DatedLessonContentLike>(
  rows: T[] | null | undefined
): T | null {
  for (const row of sortLessonContentRowsNewestFirst(rows)) {
    if (isLessonContentUsable(row)) {
      return row
    }
  }

  return null
}
