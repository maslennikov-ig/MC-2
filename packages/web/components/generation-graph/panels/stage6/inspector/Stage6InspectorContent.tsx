'use client'

import React, { memo, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { MarkdownRendererFull } from '@/components/markdown'
import { JsonViewer } from '../../shared/JsonViewer'
import { AutoCardPreview } from '../../shared/AutoCardPreview'
import { Stage6StatsStrip } from './Stage6StatsStrip'
import { Stage6QualityTab } from './tabs/Stage6QualityTab'
import { Stage6InputTab } from './tabs/Stage6InputTab'
import { CheckCircle2, Edit3, RotateCcw, AlertCircle, Loader2, Trash2 } from 'lucide-react'
import type {
  LessonContentPreview,
  SelfReviewResult,
  JudgeVerdictDisplay,
  Stage6NodeName,
  SourceDocument,
  LessonSpecificationV2,
} from '@megacampus/shared-types'
import { SourceDocumentsPanel } from '../../lesson/SourceDocumentsPanel'
import { LessonMarkdownEditor } from '../../lesson/LessonMarkdownEditor'
import { useLessonEdit } from '../../../contexts/LessonEditContext'
import { useTranslations } from 'next-intl'

// =============================================================================
// TYPES
// =============================================================================

interface Stage6InspectorContentProps {
  // Content
  content: LessonContentPreview | null
  rawMarkdown: string | null
  metadata: Record<string, unknown> | null
  logs: Array<{ level: string; message: string; timestamp: string; details?: unknown }>
  /** Source documents used in RAG retrieval for this lesson */
  sourceDocuments?: SourceDocument[]

  // Generation input parameters
  /** Lesson specification from Stage 5 */
  lessonSpec?: LessonSpecificationV2 | null
  /** Course style for content generation */
  style?: string | null
  /** Language code (e.g., 'en', 'ru') */
  generationLanguage?: string | null

  // Quality data
  selfReviewResult: SelfReviewResult | null
  judgeResult: JudgeVerdictDisplay | null

  // Stats for StatsStrip
  stats: {
    tokens: number
    durationMs: number
    /** Subscription tier: 'trial' | 'free' | 'basic' | 'standard' | 'premium' */
    modelTier: string
    quality: number // 0-100
    tokensBreakdown?: Record<Stage6NodeName, number>
  }

  // Status
  status: 'pending' | 'active' | 'completed' | 'error'
  errorMessage?: string

  // Actions
  onApprove: () => void
  onEdit: () => void
  onRegenerate: () => void
  onDelete?: () => void
  isApproving?: boolean
  isRegenerating?: boolean
  isDeleting?: boolean

  // Card preview
  /** Lesson UUID for card preview */
  lessonId?: string
  /** Course UUID for card preview */
  courseId?: string

  // i18n
  locale?: 'ru' | 'en'
  className?: string
}

// =============================================================================
// ERROR FALLBACK
// =============================================================================

function InspectorContentErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error
  resetErrorBoundary: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-4 py-12 text-center">
      <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
      <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">
        Ошибка отображения контента
      </h3>
      <p className="mb-4 max-w-md text-sm text-slate-600 dark:text-slate-400">{error.message}</p>
      <Button onClick={resetErrorBoundary} variant="outline" size="sm">
        Попробовать снова
      </Button>
    </div>
  )
}

// =============================================================================
// LOG VIEWER COMPONENT
// =============================================================================

interface LogViewerProps {
  logs: Array<{ level: string; message: string; timestamp: string; details?: unknown }>
  locale: 'ru' | 'en'
}

const LogViewer = memo(function LogViewer({ logs, locale }: LogViewerProps) {
  const t = useTranslations('generation.stage6.inspector')

  const levelColors: Record<string, string> = {
    error:
      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300 dark:border-red-700',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300 dark:border-blue-700',
    debug:
      'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  }

  if (logs.length === 0) {
    return <div className="text-muted-foreground py-8 text-center text-sm">{t('noMetadata')}</div>
  }

  return (
    <div className="space-y-2">
      {logs.map((log, idx) => (
        <div
          key={idx}
          className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900"
        >
          <Badge
            variant="outline"
            className={cn('mt-0.5 shrink-0 text-xs', levelColors[log.level] || levelColors.debug)}
          >
            {log.level.toUpperCase()}
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm break-words">{log.message}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {new Date(log.timestamp).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')}
            </p>
            {log.details && typeof log.details === 'object' && log.details !== null ? (
              <details className="mt-2">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
                  {t('noMetadata')}
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-800">
                  {JSON.stringify(log.details as Record<string, unknown>, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
})

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Stage6InspectorContent - Editorial IDE layout for Lesson Inspector
 *
 * Features:
 * - Top tabs: Preview | Quality | Blueprint | Trace
 * - Sticky StatsStrip header below tabs
 * - Scrollable content area
 * - Actions in tab header (right-aligned)
 *
 * Replaces the old inline panels approach with a cohesive tabbed interface.
 */
export const Stage6InspectorContent = memo(function Stage6InspectorContent({
  content,
  rawMarkdown,
  metadata,
  logs,
  sourceDocuments,
  lessonSpec,
  style,
  generationLanguage,
  selfReviewResult,
  judgeResult,
  stats,
  status,
  errorMessage,
  onApprove,
  onEdit,
  onRegenerate,
  onDelete,
  isApproving = false,
  isRegenerating = false,
  isDeleting = false,
  lessonId,
  courseId,
  locale = 'en',
  className,
}: Stage6InspectorContentProps) {
  const [activeTab, setActiveTab] = useState<
    'preview' | 'quality' | 'sources' | 'input' | 'blueprint' | 'trace' | 'card'
  >('preview')

  // Inline editing state from context (provided by LessonEditProvider in NodeDetailsDrawer)
  const lessonEdit = useLessonEdit()
  const isEditing = lessonEdit?.isEditing ?? false
  const isSaving = lessonEdit?.isSaving ?? false

  // Localized labels
  const t = useTranslations('generation.stage6.inspector')

  // Action bar visibility - show for completed OR error with content, hide when editing
  const showActions =
    !isEditing && (status === 'completed' || (status === 'error' && (rawMarkdown || content)))

  // Render content based on active tab
  const renderTabContent = () => {
    if (activeTab === 'preview') {
      if (isEditing && lessonEdit) {
        return (
          <LessonMarkdownEditor
            initialContent={rawMarkdown || ''}
            onSave={lessonEdit.onSaveEdit}
            onCancel={lessonEdit.onCancelEdit}
            isSaving={isSaving}
            draftKey={lessonId}
          />
        )
      }

      if (!rawMarkdown && !content) {
        return (
          <div className="text-muted-foreground py-12 text-center text-sm">{t('noContent')}</div>
        )
      }

      return (
        <ErrorBoundary
          FallbackComponent={({ error, resetErrorBoundary }) => (
            <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              <p className="mb-2 font-medium">{t('error')}</p>
              <p className="mb-3 text-xs">{error.message}</p>
              <Button onClick={resetErrorBoundary} variant="outline" size="sm">
                {t('retryLabel')}
              </Button>
            </div>
          )}
        >
          <MarkdownRendererFull
            content={rawMarkdown || ''}
            preset="preview"
            features={{ mermaid: true }}
          />
        </ErrorBoundary>
      )
    }

    if (activeTab === 'quality') {
      return (
        <Stage6QualityTab
          selfReviewResult={selfReviewResult || undefined}
          judgeResult={judgeResult || undefined}
          locale={locale}
        />
      )
    }

    if (activeTab === 'sources') {
      return <SourceDocumentsPanel sourceDocuments={sourceDocuments || []} locale={locale} />
    }

    if (activeTab === 'input') {
      // Extract input parameters from metadata and sourceDocuments
      const ragChunksCount =
        sourceDocuments?.reduce((sum, doc) => sum + (doc.chunk_count || 0), 0) || 0

      return (
        <Stage6InputTab
          lessonSpec={lessonSpec ?? null}
          style={style ?? null}
          language={generationLanguage ?? null}
          ragChunksCount={ragChunksCount}
          locale={locale}
        />
      )
    }

    if (activeTab === 'blueprint') {
      if (!metadata) {
        return (
          <div className="text-muted-foreground py-12 text-center text-sm">{t('noMetadata')}</div>
        )
      }

      return <JsonViewer data={metadata} title={t('blueprint')} defaultExpanded={false} />
    }

    if (activeTab === 'trace') {
      return <LogViewer logs={logs} locale={locale} />
    }

    if (activeTab === 'card') {
      // Only render AutoCardPreview if both courseId and lessonId are provided
      if (!courseId || !lessonId) {
        return (
          <div className="text-muted-foreground py-12 text-center text-sm">
            {t('cardUnavailable')}
          </div>
        )
      }

      return <AutoCardPreview cardType="lesson" courseId={courseId} lessonId={lessonId} />
    }

    return null
  }

  return (
    <ErrorBoundary FallbackComponent={InspectorContentErrorFallback}>
      <div className={cn('flex h-full flex-col bg-white dark:bg-slate-950', className)}>
        {/* Tabs at TOP */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 pt-4 pb-0 dark:border-slate-800">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="preview">{t('preview')}</TabsTrigger>
              <TabsTrigger value="quality">{t('quality')}</TabsTrigger>
              <TabsTrigger value="sources">{t('sources')}</TabsTrigger>
              <TabsTrigger value="input">{t('input')}</TabsTrigger>
              <TabsTrigger value="blueprint">{t('blueprint')}</TabsTrigger>
              <TabsTrigger value="trace">{t('trace')}</TabsTrigger>
              <TabsTrigger value="card">{t('card')}</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Actions (right-aligned) */}
          {showActions && (
            <div className="ml-auto flex items-center gap-2 pb-2">
              {/* Delete button with confirmation dialog */}
              {onDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isDeleting || isRegenerating || isApproving}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/50 dark:hover:text-red-300"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('deleting')}
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('delete')}
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('deleteConfirmDescription')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('deleteConfirmCancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onDelete}
                        className="bg-red-600 text-white hover:bg-red-700"
                      >
                        {t('deleteConfirmAction')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={isRegenerating || isApproving || isDeleting}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('regenerating')}
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t('regenerate')}
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                disabled={isApproving || isRegenerating || isDeleting}
              >
                <Edit3 className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={onApprove}
                disabled={isApproving || isRegenerating || isDeleting}
              >
                {isApproving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('approving')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t('approve')}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* StatsStrip (sticky header) */}
        <Stage6StatsStrip
          tokens={stats.tokens}
          durationMs={stats.durationMs}
          modelTier={stats.modelTier}
          quality={stats.quality}
          tokensBreakdown={stats.tokensBreakdown}
          locale={locale}
        />

        {/* Error banner (if error status) */}
        {status === 'error' && errorMessage && (
          <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">{t('error')}</p>
              <p
                className="truncate text-xs text-red-600 dark:text-red-400/80"
                title={errorMessage}
              >
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        {/* Tab Content Area (scrollable) */}
        {isEditing && activeTab === 'preview' ? (
          <div className="flex-1 overflow-hidden">{renderTabContent()}</div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-6">{renderTabContent()}</div>
          </ScrollArea>
        )}
      </div>
    </ErrorBoundary>
  )
})
