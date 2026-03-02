'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle2, XCircle, Loader2, Circle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  ENRICHMENT_TYPE_CONFIG,
  type EnrichmentType,
} from '@/lib/generation-graph/enrichment-config'
import { useBatchProgress, type EnrichmentProgressStatus } from '../../../hooks/useBatchProgress'

/**
 * Lesson info for mapping enrichment IDs to display labels
 */
export interface BatchLessonInfo {
  enrichmentId: string
  lessonLabel: string
  lessonTitle: string
}

export interface BatchProgressPanelProps {
  /** Array of enrichment IDs being tracked */
  enrichmentIds: string[]
  /** Course ID for realtime subscription */
  courseId: string
  /** Enrichment type being created (for display) */
  enrichmentType: EnrichmentType
  /** Mapping from enrichment ID to lesson info for display */
  lessonInfoMap: BatchLessonInfo[]
  /** Callback when "Done" button is pressed */
  onDone: () => void
  /** Optional className */
  className?: string
}

/**
 * Status icon for individual enrichment progress
 */
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'failed':
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'generating':
    case 'draft_generating':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    case 'pending':
    default:
      return <Circle className="text-muted-foreground h-4 w-4" />
  }
}

/**
 * Single enrichment progress row
 */
function ProgressRow({
  lessonLabel,
  lessonTitle,
  statusInfo,
}: {
  lessonLabel: string
  lessonTitle: string
  statusInfo: EnrichmentProgressStatus | undefined
}) {
  const t = useTranslations('enrichments')
  const status = statusInfo?.status ?? 'pending'
  const progress = statusInfo?.progress ?? 0

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{lessonLabel}</div>
        <div className="text-muted-foreground truncate text-xs">{lessonTitle}</div>
      </div>
      <div className="text-muted-foreground shrink-0 text-xs">
        {status === 'completed' ? (
          <span className="text-emerald-500">{t('status.completed')}</span>
        ) : status === 'failed' || status === 'cancelled' ? (
          <span className="text-red-500">{t(`status.${status}` as Parameters<typeof t>[0])}</span>
        ) : (
          <span>{progress}%</span>
        )}
      </div>
    </div>
  )
}

/**
 * BatchProgressPanel
 *
 * Displays progress of a batch enrichment operation with:
 * - Overall progress bar
 * - Summary text (completed / total)
 * - Scrollable list of individual lesson statuses
 * - "Done" button when all enrichments are complete
 *
 * @example
 * ```tsx
 * <BatchProgressPanel
 *   enrichmentIds={['id-1', 'id-2']}
 *   courseId="course-uuid"
 *   enrichmentType="quiz"
 *   lessonInfoMap={[
 *     { enrichmentId: 'id-1', lessonLabel: '1.1', lessonTitle: 'Intro' },
 *     { enrichmentId: 'id-2', lessonLabel: '1.2', lessonTitle: 'Basics' },
 *   ]}
 *   onDone={() => store.reset()}
 * />
 * ```
 */
export function BatchProgressPanel({
  enrichmentIds,
  courseId,
  enrichmentType,
  lessonInfoMap,
  onDone,
  className,
}: BatchProgressPanelProps) {
  const t = useTranslations('enrichments')

  const { statuses, completedCount, failedCount, isComplete, overallProgress } = useBatchProgress(
    enrichmentIds,
    courseId
  )

  const totalCount = enrichmentIds.length
  const typeConfig = ENRICHMENT_TYPE_CONFIG[enrichmentType]
  const TypeIcon = typeConfig.icon

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header with overall progress */}
      <div className="space-y-3 border-b p-4">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <div className={cn('rounded p-1.5', typeConfig.bgClass)}>
            <TypeIcon className={cn('h-4 w-4', typeConfig.colorClass)} />
          </div>
          <span className="text-sm font-medium">{t(`types.${enrichmentType}`)}</span>
        </div>

        {/* Overall progress bar */}
        <Progress value={overallProgress} className="h-2" />

        {/* Status text */}
        <div className="text-muted-foreground text-sm">
          {isComplete ? (
            <div className="space-y-1">
              <div className="font-medium text-emerald-600 dark:text-emerald-400">
                {t('batch.completed')}
              </div>
              {failedCount > 0 && (
                <div className="text-red-500">{t('batch.failed', { count: failedCount })}</div>
              )}
            </div>
          ) : (
            t('batch.inProgress', {
              completed: completedCount,
              total: totalCount,
            })
          )}
        </div>
      </div>

      {/* Scrollable list of individual enrichment statuses */}
      <ScrollArea className="flex-1">
        <div className="space-y-1.5 p-4">
          {lessonInfoMap.map((info) => (
            <ProgressRow
              key={info.enrichmentId}
              lessonLabel={info.lessonLabel}
              lessonTitle={info.lessonTitle}
              statusInfo={statuses.get(info.enrichmentId)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Done button */}
      {isComplete && (
        <div className="border-t p-4">
          <Button onClick={onDone} className="w-full">
            {t('batch.done')}
          </Button>
        </div>
      )}
    </div>
  )
}
