'use client'

import React, { useState, memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { History, ChevronDown, ChevronUp, RefreshCw, AlertCircle } from 'lucide-react'
import { DiffViewer } from '../stage6/inspector/quality/DiffViewer'
import { formatDistanceToNow } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import { Badge } from '@/components/ui/badge'
import { Star } from 'lucide-react'

/**
 * Interface for course edit records from the database
 */
interface CourseEdit {
  id: string
  course_id: string
  edited_by: string | null
  stage: string
  field_path: string
  previous_value: unknown
  new_value: unknown
  semantic_diff: {
    changeType: string
    alignmentScore: number
    conceptsAdded: string[]
    conceptsRemoved: string[]
    bloomLevelPreserved?: boolean
    changeDescription?: string
  } | null
  user_instruction: string | null
  created_at: string
}

interface EditHistoryPanelProps {
  courseId: string
  locale?: 'ru' | 'en'
  className?: string
}

const translations = {
  ru: {
    title: 'История изменений',
    noEdits: 'Пока нет изменений',
    loading: 'Загрузка...',
    error: 'Ошибка загрузки',
    retry: 'Повторить',
    editCount: (count: number) => (count === 1 ? '1 изменение' : `${count} изменений`),
    changeTypes: {
      simplified: 'Упрощено',
      expanded: 'Расширено',
      restructured: 'Реструктурировано',
      refined: 'Уточнено',
    } as Record<string, string>,
    alignment: 'Согласованность',
  },
  en: {
    title: 'Edit History',
    noEdits: 'No edits yet',
    loading: 'Loading...',
    error: 'Failed to load',
    retry: 'Retry',
    editCount: (count: number) => (count === 1 ? '1 edit' : `${count} edits`),
    changeTypes: {
      simplified: 'Simplified',
      expanded: 'Expanded',
      restructured: 'Restructured',
      refined: 'Refined',
    } as Record<string, string>,
    alignment: 'Alignment',
  },
}

const changeTypeBadgeColors: Record<string, string> = {
  simplified:
    'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  expanded:
    'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  restructured:
    'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  refined:
    'bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800',
}

const getAlignmentScoreColor = (score: number): string => {
  if (score >= 4) return 'text-green-600 dark:text-green-400'
  if (score === 3) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

/**
 * Converts a value to a string for diff display
 * Handles circular references, large arrays, and non-serializable objects
 */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        // Truncate very large arrays for diff readability
        if (Array.isArray(val) && val.length > 100) {
          return `[Array with ${val.length} items (truncated)]`
        }
        return val
      },
      2
    )
  } catch {
    // Handle circular references or non-serializable objects
    return `[Complex object: ${Object.prototype.toString.call(value)}]`
  }
}

/**
 * EditHistoryPanel Component
 *
 * Displays a timeline of all regeneration edits for a course.
 * Each edit can be expanded to show a side-by-side diff view.
 *
 * Features:
 * - Loads edit history from the backend via server action
 * - Shows timeline with timestamps and user instructions
 * - Expandable diff view using existing DiffViewer component
 * - Semantic diff metadata (change type, alignment score)
 * - Auto-refresh capability
 */
export const EditHistoryPanel = memo(function EditHistoryPanel({
  courseId,
  locale = 'ru',
  className,
}: EditHistoryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const t = translations[locale]
  const dateLocale = locale === 'ru' ? ru : enUS

  const {
    data: editsData,
    isLoading,
    error: queryError,
    refetch: loadEditHistory,
  } = trpc.generation.getEditHistory.useQuery(
    { courseId, limit: 50 },
    { refetchOnWindowFocus: false }
  )

  const edits: CourseEdit[] = (editsData as CourseEdit[] | undefined) ?? []
  const error = queryError ? queryError.message || 'Unknown error' : null

  // Loading state
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            {t.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            {t.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="text-muted-foreground text-sm">{t.error}</p>
            <Button variant="outline" size="sm" onClick={() => void loadEditHistory()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t.retry}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (edits.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            {t.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-4 text-center text-sm">{t.noEdits}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-5 w-5" />
          {t.title}
          <span className="text-muted-foreground ml-auto text-sm font-normal">
            {t.editCount(edits.length)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {edits.map((edit) => (
          <div
            key={edit.id}
            className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
          >
            {/* Edit header - clickable to expand */}
            <Button
              variant="ghost"
              className="h-auto w-full justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              onClick={() => setExpandedId(expandedId === edit.id ? null : edit.id)}
              aria-expanded={expandedId === edit.id}
              aria-controls={`edit-details-${edit.id}`}
            >
              <div className="flex flex-col items-start gap-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="max-w-[200px] truncate text-sm font-medium">
                    {edit.field_path}
                  </span>
                  {edit.semantic_diff && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'border text-xs',
                        changeTypeBadgeColors[edit.semantic_diff.changeType] ||
                          'bg-slate-100 dark:bg-slate-800'
                      )}
                    >
                      {t.changeTypes[edit.semantic_diff.changeType] ||
                        edit.semantic_diff.changeType}
                    </Badge>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">
                  {formatDistanceToNow(new Date(edit.created_at), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
                  {edit.user_instruction && (
                    <span className="ml-1">
                      {' '}
                      &quot;{edit.user_instruction.slice(0, 40)}
                      {edit.user_instruction.length > 40 ? '...' : ''}&quot;
                    </span>
                  )}
                </span>
              </div>
              {expandedId === edit.id ? (
                <ChevronUp className="h-4 w-4 flex-shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 flex-shrink-0" />
              )}
            </Button>

            {/* Expanded details with diff view */}
            {expandedId === edit.id && (
              <div
                id={`edit-details-${edit.id}`}
                className="border-t border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/50"
              >
                {/* Semantic diff metadata */}
                {edit.semantic_diff && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {/* Alignment score */}
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground text-xs">{t.alignment}:</span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star
                            key={index}
                            className={cn(
                              'h-3 w-3',
                              index < edit.semantic_diff!.alignmentScore
                                ? cn(
                                    'fill-current',
                                    getAlignmentScoreColor(edit.semantic_diff!.alignmentScore)
                                  )
                                : 'text-slate-300 dark:text-slate-600'
                            )}
                          />
                        ))}
                      </div>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          getAlignmentScoreColor(edit.semantic_diff.alignmentScore)
                        )}
                      >
                        {edit.semantic_diff.alignmentScore}/5
                      </span>
                    </div>

                    {/* Concepts added */}
                    {edit.semantic_diff.conceptsAdded?.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-green-600 dark:text-green-400">
                          +{edit.semantic_diff.conceptsAdded.length}
                        </span>
                      </div>
                    )}

                    {/* Concepts removed */}
                    {edit.semantic_diff.conceptsRemoved?.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-600 dark:text-red-400">
                          -{edit.semantic_diff.conceptsRemoved.length}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Change description if available */}
                {edit.semantic_diff?.changeDescription && (
                  <p className="text-muted-foreground mb-3 rounded bg-slate-100 p-2 text-xs italic dark:bg-slate-800">
                    {edit.semantic_diff.changeDescription}
                  </p>
                )}

                {/* Diff viewer */}
                <DiffViewer
                  originalContent={valueToString(edit.previous_value)}
                  fixedContent={valueToString(edit.new_value)}
                  locale={locale}
                />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
})
