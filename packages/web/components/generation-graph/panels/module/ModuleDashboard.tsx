'use client'

import React from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { cn } from '@/lib/utils'
import { ModuleDashboardData } from '@megacampus/shared-types'
import { Stage6ControlTower } from '../stage6/dashboard/Stage6ControlTower'
import { LessonMatrix } from './LessonMatrix'
import { ModuleDashboardFooter } from './ModuleDashboardFooter'
import { useNodeSelection } from '../../hooks/useNodeSelection'
import { useLessonActions } from '../../hooks/useLessonActions'
import { Loader2, AlertCircle } from 'lucide-react'
import { logger } from '@/lib/client-logger'

/**
 * Error fallback for ModuleDashboard
 */
function DashboardErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error
  resetErrorBoundary: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
      <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">
        Ошибка отображения модуля
      </h3>
      <p className="mb-4 max-w-sm text-sm text-slate-600 dark:text-slate-400">{error.message}</p>
      <button
        onClick={resetErrorBoundary}
        className="rounded-md bg-purple-500 px-4 py-2 text-sm text-white hover:bg-purple-600"
      >
        Попробовать снова
      </button>
    </div>
  )
}

interface ModuleDashboardProps {
  data: ModuleDashboardData | null
  courseId: string
  isLoading?: boolean
  error?: Error | null
  onExportAll?: () => void
  onRegenerateFailed?: () => void
  onImproveQuality?: () => void
  onApproveAll?: () => void
  isExporting?: boolean
  isRegenerating?: boolean
  isApproving?: boolean
  className?: string
}

/**
 * ModuleDashboard - Complete module view for Stage 6 "Glass Factory" UI
 *
 * Combines:
 * - Header with vital signs (progress, cost, quality, time)
 * - Lesson matrix table
 * - Footer with batch actions
 */
export function ModuleDashboard({
  data,
  courseId,
  isLoading = false,
  error = null,
  onExportAll,
  onRegenerateFailed,
  onImproveQuality,
  onApproveAll,
  isExporting = false,
  isRegenerating = false,
  isApproving = false,
  className,
}: ModuleDashboardProps) {
  const { selectNode } = useNodeSelection()
  const { retryLesson, pause, resume, isRetrying, isPausing, isResuming } = useLessonActions({
    courseId,
  })

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center py-12', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Загрузка данных модуля...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center py-12', className)}>
        <div className="text-center text-red-500 dark:text-red-400">
          <p className="font-medium">Ошибка загрузки</p>
          <p className="mt-1 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  // No data state
  if (!data) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center py-12', className)}>
        <p className="text-slate-500 dark:text-slate-400">Данные модуля не найдены</p>
      </div>
    )
  }

  // Calculate low quality count
  const lowQualityCount = data.lessons.filter(
    (l) => l.qualityScore !== null && l.qualityScore < 0.75
  ).length

  // Convert lesson label "1.1" to React Flow node ID "lesson_1_1"
  const toNodeId = (lessonId: string) => `lesson_${lessonId.replace('.', '_')}`

  // Handle lesson click - open lesson inspector
  const handleLessonClick = (lessonId: string) => {
    selectNode(toNodeId(lessonId))
  }

  // Handle lesson action
  const handleLessonAction = async (
    lessonId: string,
    action: 'view' | 'retry' | 'pause' | 'play'
  ) => {
    switch (action) {
      case 'view':
        selectNode(toNodeId(lessonId))
        break
      case 'retry':
        await retryLesson(lessonId)
        break
      case 'pause':
        await pause()
        break
      case 'play':
        await resume()
        break
    }
    logger.debug(`Lesson action: ${action}`, { lessonId, action })
  }

  // Map ModuleDashboardData.aggregates to Stage6ControlTower stats format
  const controlTowerStats = {
    totalTokens: data.aggregates.totalTokens,
    avgQuality: (data.aggregates.avgQualityScore ?? 0) * 100, // Convert 0-1 to 0-100
    statusCounts: {
      completed: data.aggregates.completedLessons,
      approved: data.aggregates.approvedLessons ?? 0,
      active: data.aggregates.activeLessons,
      pending: data.aggregates.pendingLessons,
      failed: data.aggregates.errorLessons,
    },
    totalDurationMs: data.aggregates.totalDurationMs,
    estimatedRemainingMs: data.aggregates.estimatedTimeRemainingMs ?? undefined,
  }

  // Handlers for Control Tower actions
  const handleRetryFailed = () => {
    logger.debug('Retry failed lessons requested', { moduleId: data.moduleId })
    onRegenerateFailed?.()
  }

  const handleExportAll = () => {
    onExportAll?.()
  }

  return (
    <ErrorBoundary FallbackComponent={DashboardErrorFallback}>
      <div className={cn('flex h-full flex-col', className)}>
        {/* Header with vital signs - using Stage6ControlTower */}
        <Stage6ControlTower
          moduleTitle={`${data.title}`}
          moduleId={data.moduleId}
          stats={controlTowerStats}
          modelTier="standard" // TODO: Get from course settings or user subscription
          onRegenerateAll={handleRetryFailed}
          onExportAll={handleExportAll}
        />

        {/* Lesson matrix - scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <LessonMatrix
            lessons={data.lessons}
            onLessonClick={handleLessonClick}
            onLessonAction={(lessonId, action) => void handleLessonAction(lessonId, action)}
            isRetrying={isRetrying}
            isPausing={isPausing}
            isResuming={isResuming}
          />
        </div>

        {/* Footer with batch actions */}
        <ModuleDashboardFooter
          aggregates={data.aggregates}
          lowQualityCount={lowQualityCount}
          onExportAll={onExportAll || (() => {})}
          onRegenerateFailed={onRegenerateFailed || (() => {})}
          onImproveQuality={onImproveQuality || (() => {})}
          onApproveAll={onApproveAll || (() => {})}
          isExporting={isExporting}
          isRegenerating={isRegenerating}
          isApproving={isApproving}
          className="flex-shrink-0"
        />
      </div>
    </ErrorBoundary>
  )
}

export default ModuleDashboard
