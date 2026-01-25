'use client'

import React, { useState } from 'react'
import { MarkdownRendererClient } from '@/components/markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, AlertCircle, Clock, Sparkles, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TraceAttempt } from '@megacampus/shared-types'
import { EditableField } from './EditableField'
import { useAutoSave } from '../../hooks/useAutoSave'
import { updateFieldAction } from '@/app/actions/admin-generation'
import type { FieldConfig } from './types'

interface LessonSection {
  title?: string
  content: string
  type?: string
}

interface LessonContentStructure {
  title?: string
  sections?: LessonSection[]
}

interface LessonContentViewProps {
  data: {
    content?: string | LessonContentStructure | { content?: LessonContentStructure }
    qualityScore?: number
    attempts?: TraceAttempt[]
    lessonId?: string
    title?: string
    outputData?: Record<string, unknown>
  }
  locale?: 'ru' | 'en'
  courseId?: string
  editable?: boolean
  readOnly?: boolean
  stageId?: 'stage_4' | 'stage_5' | 'stage_6'
}

const translations = {
  ru: {
    title: 'Содержимое урока',
    description: 'Сгенерированный контент урока',
    qualityScore: 'Оценка качества',
    attempts: 'Попытки генерации',
    noContent: 'Контент еще не сгенерирован',
    preview: 'Предварительный просмотр',
    refine: 'Улучшить',
    viewFull: 'Просмотреть полностью',
    attemptLabel: 'Попытка',
    success: 'Успешно',
    failed: 'Ошибка',
    generatedAt: 'Сгенерировано',
    tokens: 'Токены',
    duration: 'Длительность',
    readOnly: 'Режим просмотра',
  },
  en: {
    title: 'Lesson Content',
    description: 'Generated lesson content',
    qualityScore: 'Quality Score',
    attempts: 'Generation Attempts',
    noContent: 'Content not yet generated',
    preview: 'Preview',
    refine: 'Refine',
    viewFull: 'View Full',
    attemptLabel: 'Attempt',
    success: 'Success',
    failed: 'Failed',
    generatedAt: 'Generated',
    tokens: 'Tokens',
    duration: 'Duration',
    readOnly: 'View Only',
  },
}

const formatDuration = (ms?: number): string => {
  if (!ms) return 'N/A'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}

const formatTokens = (tokens?: number): string => {
  if (!tokens) return 'N/A'
  return tokens.toLocaleString()
}

export function LessonContentView({
  data,
  locale = 'ru',
  courseId,
  editable = false,
  readOnly = false,
  stageId = 'stage_6',
}: LessonContentViewProps) {
  const t = translations[locale]
  const [showFullContent, setShowFullContent] = useState(false)
  const [localContent, setLocalContent] = useState<string>('')

  // Initialize useAutoSave for lesson content updates
  const { status, save } = useAutoSave(
    async (input: {
      courseId: string
      stageId: 'stage_4' | 'stage_5' | 'stage_6'
      fieldPath: string
      value: unknown
    }) => {
      return await updateFieldAction(input.courseId, input.stageId, input.fieldPath, input.value)
    },
    { courseId: courseId || '', stageId },
    { debounceMs: 1000 }
  )

  // Extract content from various possible locations
  // Handle nested structure: { content: { content: { sections: [...] } } }
  const extractTextContent = (): string => {
    // Direct string content
    if (typeof data.content === 'string') return data.content

    // Structure with sections: { sections: [...] } or { content: { sections: [...] } }
    let contentObj: LessonContentStructure | undefined

    if (data.content && typeof data.content === 'object') {
      // Check if it's { content: { sections } } (from lesson_contents.content column)
      if ('content' in data.content && typeof data.content.content === 'object') {
        contentObj = data.content.content
      } else if ('sections' in data.content) {
        // Direct { sections } structure
        contentObj = data.content
      }
    }

    // Extract from outputData if not found
    if (!contentObj && data.outputData) {
      const outputContent = data.outputData.content || data.outputData.lesson_content
      if (typeof outputContent === 'string') return outputContent
      if (outputContent && typeof outputContent === 'object') {
        // Type guard: outputContent is object, check for nested content or sections
        const outputObj = outputContent as Record<string, unknown>
        if (
          'content' in outputObj &&
          typeof outputObj.content === 'object' &&
          outputObj.content !== null
        ) {
          contentObj = outputObj.content as LessonContentStructure
        } else if ('sections' in outputObj) {
          contentObj = outputContent as LessonContentStructure
        }
      }
    }

    // Convert sections to text
    if (contentObj?.sections && Array.isArray(contentObj.sections)) {
      return contentObj.sections
        .map((section: LessonSection) => {
          const title = section.title ? `## ${section.title}\n\n` : ''
          return title + (section.content || '')
        })
        .join('\n\n')
    }

    return ''
  }

  const content = extractTextContent()

  // Initialize local content on first render
  React.useEffect(() => {
    if (content && !localContent) {
      setLocalContent(content)
    }
  }, [content, localContent])

  const qualityScore =
    data.qualityScore ||
    (data.outputData?.quality_score as number) ||
    (data.outputData?.qualityScore as number)

  const attempts = data.attempts || []
  const canEdit = editable && !readOnly && courseId

  // Field config for EditableField
  const contentFieldConfig: FieldConfig = {
    path: data.lessonId ? `lessons[${data.lessonId}].content` : 'content',
    label: locale === 'ru' ? 'Содержимое урока' : 'Lesson Content',
    type: 'textarea',
    placeholder: locale === 'ru' ? 'Введите содержимое урока...' : 'Enter lesson content...',
    helpText:
      locale === 'ru' ? 'Markdown форматирование поддерживается' : 'Markdown formatting supported',
  }

  // Handle content change with optimistic update
  const handleContentChange = (newValue: unknown) => {
    const newContent = String(newValue)
    setLocalContent(newContent)

    if (courseId) {
      save(contentFieldConfig.path, newContent)
    }
  }

  // If no content, show empty state
  if (!content && attempts.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center py-8">
        <AlertCircle className="mb-2 h-8 w-8 text-amber-500" />
        <p className="text-sm font-medium">{t.noContent}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-2">
      {/* Read-only banner */}
      {readOnly && (
        <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          <Eye className="mr-2 inline-block h-4 w-4" />
          {t.readOnly}
        </div>
      )}

      {/* Quality Score Badge */}
      {qualityScore !== undefined && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-amber-500" />
              {t.qualityScore}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  qualityScore >= 80 ? 'default' : qualityScore >= 60 ? 'secondary' : 'destructive'
                }
                className="px-3 py-1 text-lg font-bold"
              >
                {qualityScore}/100
              </Badge>
              {qualityScore >= 80 && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  {locale === 'ru' ? 'Отличное качество' : 'Excellent quality'}
                </span>
              )}
              {qualityScore >= 60 && qualityScore < 80 && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {locale === 'ru' ? 'Хорошее качество' : 'Good quality'}
                </span>
              )}
              {qualityScore < 60 && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {locale === 'ru' ? 'Требуется улучшение' : 'Needs improvement'}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Preview or Editable Field */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t.preview}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <EditableField
              config={contentFieldConfig}
              value={localContent || content}
              onChange={handleContentChange}
              status={status}
              courseId={courseId}
              stageId={stageId}
              locale={locale}
              regeneratable={true}
            />
          ) : (
            <>
              <div
                className={cn(
                  'rounded-lg bg-slate-50 p-4 dark:bg-slate-900',
                  !showFullContent && 'relative max-h-96 overflow-hidden'
                )}
              >
                <MarkdownRendererClient content={content} />
                {!showFullContent && content.length > 500 && (
                  <div className="absolute right-0 bottom-0 left-0 h-20 bg-gradient-to-t from-slate-50 to-transparent dark:from-slate-900" />
                )}
              </div>
              {content.length > 500 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullContent(!showFullContent)}
                  className="mt-2"
                >
                  {showFullContent ? (locale === 'ru' ? 'Свернуть' : 'Collapse') : t.viewFull}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Attempts Timeline */}
      {attempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t.attempts}</CardTitle>
            <CardDescription>
              {attempts.length}{' '}
              {attempts.length === 1
                ? locale === 'ru'
                  ? 'попытка'
                  : 'attempt'
                : locale === 'ru'
                  ? 'попыток'
                  : 'attempts'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {attempts.map((attempt, idx) => (
                <div
                  key={`attempt-${idx}-${attempt.attemptNumber}`}
                  className={cn(
                    'rounded-lg border p-3',
                    attempt.status === 'success'
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                      : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                  )}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {attempt.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      )}
                      <span className="text-sm font-medium">
                        {t.attemptLabel} {attempt.attemptNumber}
                      </span>
                      <Badge
                        variant={attempt.status === 'success' ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {attempt.status === 'success' ? t.success : t.failed}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <Clock className="h-3 w-3" />
                      {attempt.timestamp
                        ? new Date(attempt.timestamp).toLocaleString(locale)
                        : 'N/A'}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-muted-foreground flex items-center gap-1">
                      <span>{t.duration}:</span>
                      <span className="font-mono">
                        {formatDuration(attempt.processMetrics?.duration)}
                      </span>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <span>{t.tokens}:</span>
                      <span className="font-mono">
                        {formatTokens(attempt.processMetrics?.tokens)}
                      </span>
                    </div>
                  </div>

                  {/* Error message if failed */}
                  {attempt.status === 'failed' && attempt.errorMessage && (
                    <div className="mt-2 rounded bg-red-100 p-2 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      {attempt.errorMessage}
                    </div>
                  )}

                  {/* Refinement message if exists */}
                  {attempt.refinementMessage && (
                    <div className="mt-2 rounded bg-blue-100 p-2 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      <span className="font-medium">
                        {locale === 'ru' ? 'Запрос на улучшение:' : 'Refinement:'}
                      </span>
                      <p className="mt-1">{attempt.refinementMessage}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Skeleton loader
export const LessonContentViewSkeleton = () => (
  <div className="space-y-4 p-2">
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20" />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="h-3 w-48" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </CardContent>
    </Card>
  </div>
)
