'use client'

import React, { useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SegmentedPillTrack } from '../stage6/dashboard/SegmentedPillTrack'
import { Eye, Play, Pause, RotateCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import type { ReviewAwareLessonMatrixRow } from '../../stage6-review-status'

/**
 * LessonMatrix - High-density table for lesson list with pipeline status
 *
 * Shows all lessons in a module with:
 * - Lesson number and title
 * - Pipeline status (MicroStepper with 5 dots)
 * - Quality score (0.XX or "—" if not evaluated)
 * - Cost in USD
 * - Action buttons (View/Pause/Retry based on status)
 *
 * Row states:
 * - Pending: gray text
 * - Active: blue highlight, bold
 * - Completed: normal
 * - Error: red text with error icon
 *
 * Features:
 * - Click row to open lesson inspector
 * - Action buttons for prioritize/pause/view/retry
 * - Footer row with summary statistics
 * - Dark mode support
 *
 * Used in: Stage 6 Module Dashboard
 */

interface LessonMatrixProps {
  /** List of lessons to display */
  lessons: ReviewAwareLessonMatrixRow[]
  /** Callback when clicking a lesson row */
  onLessonClick: (lessonId: string) => void
  /** Callback for action buttons */
  onLessonAction: (lessonId: string, action: 'view' | 'retry' | 'pause' | 'play') => void
  /** Check if specific lesson is retrying */
  isRetrying?: (lessonId: string) => boolean
  /** Is pause operation in progress */
  isPausing?: boolean
  /** Is resume operation in progress */
  isResuming?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Format quality score as 0.XX or "—"
 */
function formatQuality(score: number | null): string {
  if (score === null) return '—'
  return score.toFixed(2)
}

/**
 * Get row styling based on lesson status
 */
function getRowClassName(lesson: ReviewAwareLessonMatrixRow): string {
  if (lesson.needsReview) {
    return 'bg-amber-50/70 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100'
  }

  switch (lesson.status) {
    case 'pending':
      return 'text-slate-400 dark:text-slate-500'
    case 'active':
      return 'bg-blue-50 dark:bg-blue-950/30 font-semibold text-blue-900 dark:text-blue-100'
    case 'completed':
      return ''
    case 'approved':
      return 'bg-purple-50 dark:bg-purple-950/20'
    case 'error':
      return 'text-red-600 dark:text-red-400'
  }
}

/**
 * Get action button based on lesson status
 */
function ActionButton({
  lesson,
  onClick,
  isRetrying,
  isPausing,
  isResuming,
  t,
}: {
  lesson: ReviewAwareLessonMatrixRow
  onClick: (action: 'view' | 'retry' | 'pause' | 'play') => void
  isRetrying?: (lessonId: string) => boolean
  isPausing?: boolean
  isResuming?: boolean
  t: (key: 'prioritize' | 'pause' | 'preview' | 'retry' | 'reviewRequired') => string
}) {
  switch (lesson.status) {
    case 'pending': {
      const resumeLoading = isResuming
      return (
        <Button
          variant="ghost"
          size="icon"
          disabled={resumeLoading}
          onClick={(e) => {
            e.stopPropagation()
            onClick('play')
          }}
          title={t('prioritize')}
          className="h-8 w-8"
        >
          {resumeLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
      )
    }
    case 'active': {
      const pauseLoading = isPausing
      return (
        <Button
          variant="ghost"
          size="icon"
          disabled={pauseLoading}
          onClick={(e) => {
            e.stopPropagation()
            onClick('pause')
          }}
          title={t('pause')}
          className="h-8 w-8"
        >
          {pauseLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
        </Button>
      )
    }
    case 'completed':
    case 'approved':
      return (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation()
            onClick('view')
          }}
          title={t('preview')}
          className="h-8 w-8"
        >
          <Eye className="h-4 w-4" />
        </Button>
      )
    case 'error': {
      const retryLoading = isRetrying?.(lesson.lessonId) ?? false
      return (
        <Button
          variant="ghost"
          size="icon"
          disabled={retryLoading}
          onClick={(e) => {
            e.stopPropagation()
            onClick('retry')
          }}
          title={t('retry')}
          className="h-8 w-8"
        >
          {retryLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCw className="h-4 w-4" />
          )}
        </Button>
      )
    }
  }
}

/**
 * Calculate summary statistics
 */
function calculateSummary(lessons: ReviewAwareLessonMatrixRow[]) {
  const completedLessons = lessons.filter((l) => l.qualityScore !== null)
  const avgQuality =
    completedLessons.length > 0
      ? completedLessons.reduce((sum, l) => sum + (l.qualityScore || 0), 0) /
        completedLessons.length
      : null

  return {
    totalLessons: lessons.length,
    avgQuality,
  }
}

export function LessonMatrix({
  lessons,
  onLessonClick,
  onLessonAction,
  isRetrying,
  isPausing,
  isResuming,
  className,
}: LessonMatrixProps) {
  const t = useTranslations('generation.lessonMatrix')
  const summary = useMemo(() => calculateSummary(lessons), [lessons])

  return (
    <div className={cn('rounded-lg border border-slate-200 dark:border-slate-700', className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 text-center">#</TableHead>
            <TableHead>{t('title')}</TableHead>
            <TableHead className="w-40">Pipeline</TableHead>
            <TableHead className="w-24 text-center">{t('quality')}</TableHead>
            <TableHead className="w-20 text-center">{t('action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lessons.map((lesson) => (
            <TableRow
              key={lesson.lessonId}
              onClick={() => onLessonClick(lesson.lessonId)}
              className={cn(
                'cursor-pointer transition-colors',
                getRowClassName(lesson),
                'hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <TableCell className="text-center font-mono text-sm">{lesson.lessonNumber}</TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <div className="max-w-xs truncate" title={lesson.title}>
                    {lesson.title}
                  </div>
                  {lesson.needsReview && (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-100 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                    >
                      {t('reviewRequired')}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <SegmentedPillTrack pipelineState={lesson.pipelineState} className="h-2" />
              </TableCell>
              <TableCell className="text-center font-mono">
                {formatQuality(lesson.qualityScore)}
              </TableCell>
              <TableCell className="text-center">
                <ActionButton
                  lesson={lesson}
                  onClick={(action) => onLessonAction(lesson.lessonId, action)}
                  isRetrying={isRetrying}
                  isPausing={isPausing}
                  isResuming={isResuming}
                  t={t}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={5} className="text-center">
              <div className="flex items-center justify-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
                <span>{t('totalLessons', { count: summary.totalLessons })}</span>
                {summary.avgQuality !== null && (
                  <>
                    <span className="text-slate-400 dark:text-slate-600">•</span>
                    <span>{t('avgQuality', { quality: formatQuality(summary.avgQuality) })}</span>
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
