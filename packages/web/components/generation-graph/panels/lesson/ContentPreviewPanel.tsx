'use client'

import React, { useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { MarkdownRendererFull } from '@/components/markdown'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Edit3, RotateCcw, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JsonViewer } from '../../panels/shared/JsonViewer'
import {
  LessonContentPreview,
  JudgeVerdictDisplay,
  JUDGE_VERDICT_LABELS,
} from '@megacampus/shared-types'
import { copyToClipboard } from '@/lib/utils/clipboard'
import { useLocale } from 'next-intl'

interface ContentPreviewPanelProps {
  content: LessonContentPreview | null
  rawMarkdown: string | null
  metadata: Record<string, unknown> | null
  judgeResult: JudgeVerdictDisplay | null
  status: 'pending' | 'active' | 'completed' | 'error'
  errorMessage?: string
  onApprove: () => void
  onEdit: () => void
  onRegenerate: () => void
  isApproving?: boolean
  isRegenerating?: boolean
  className?: string
  /** Course language for localized callout titles (ISO 639-1) */
  language?: string
}

export function ContentPreviewPanel({
  content,
  rawMarkdown,
  metadata,
  judgeResult,
  status,
  errorMessage,
  onApprove,
  onEdit,
  onRegenerate,
  isApproving = false,
  isRegenerating = false,
  className,
  language,
}: ContentPreviewPanelProps) {
  const locale = useLocale()
  const i18n = {
    ru: {
      generationError: 'Ошибка генерации',
      contentRenderError: '{t.contentRenderError}',
      contentUnavailable: '{t.contentUnavailable}',
      markdownSource: '{t.markdownSource}',
      copy: 'Скопировать',
      markdownUnavailable: '{t.markdownUnavailable}',
      lessonMetadata: 'Метаданные урока',
      metadataUnavailable: '{t.metadataUnavailable}',
      contentError: 'Произошла ошибка при генерации контента',
      technicalDetails: 'Технические детали',
      pendingGeneration: 'Ожидание генерации...',
      generatingContent: 'Генерация контента...',
      previewInProgress: '{t.previewInProgress}',
      preview: 'Просмотр',
      metadata: 'Метаданные',
      regenerating: 'Переделывается...',
      regenerate: 'Переделать',
      edit: 'Редактировать',
      approving: 'Одобрение...',
      approve: 'Одобрить',
    },
    en: {
      generationError: 'Generation error',
      contentRenderError: 'Content render error',
      contentUnavailable: 'Lesson content unavailable',
      markdownSource: 'Raw Markdown source',
      copy: 'Copy',
      markdownUnavailable: 'Markdown content unavailable',
      lessonMetadata: 'Lesson metadata',
      metadataUnavailable: 'Metadata unavailable',
      contentError: 'An error occurred during content generation',
      technicalDetails: 'Technical details',
      pendingGeneration: 'Waiting for generation...',
      generatingContent: 'Generating content...',
      previewInProgress: 'Preview (generation in progress)',
      preview: 'Preview',
      metadata: 'Metadata',
      regenerating: 'Regenerating...',
      regenerate: 'Regenerate',
      edit: 'Edit',
      approving: 'Approving...',
      approve: 'Approve',
    },
  }
  const t = i18n[locale]
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown' | 'metadata'>('preview')

  // Helper: Render error banner (compact version for when content exists)
  const renderErrorBanner = () => (
    <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
      <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">{t.generationError}</p>
        {errorMessage && (
          <p className="truncate text-xs text-red-600 dark:text-red-400/80" title={errorMessage}>
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  )

  // Helper: Render tab-based content (Preview/Markdown/Metadata)
  const renderContentTabs = () => {
    if (activeTab === 'preview') {
      return (
        <ScrollArea className="h-full">
          <div className="p-6">
            {rawMarkdown ? (
              <ErrorBoundary
                fallback={
                  <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    Ошибка отображения контента
                  </div>
                }
              >
                <MarkdownRendererFull content={rawMarkdown} preset="preview" language={language} />
              </ErrorBoundary>
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Контент урока недоступен
              </p>
            )}
          </div>
        </ScrollArea>
      )
    }

    if (activeTab === 'markdown') {
      return (
        <ScrollArea className="h-full">
          <div className="space-y-3 p-6">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">Исходный текст в формате Markdown</p>
              {rawMarkdown && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void copyToClipboard(rawMarkdown)
                  }}
                  className="h-7 text-xs"
                >
                  {t.copy}
                </Button>
              )}
            </div>
            <pre className="overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-xs whitespace-pre-wrap text-slate-50 dark:bg-slate-950">
              {rawMarkdown || 'Markdown контент недоступен'}
            </pre>
          </div>
        </ScrollArea>
      )
    }

    if (activeTab === 'metadata') {
      return (
        <ScrollArea className="h-full">
          <div className="p-6">
            {metadata ? (
              <JsonViewer data={metadata} title={t.lessonMetadata} defaultExpanded={false} />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Метаданные недоступны
              </p>
            )}
          </div>
        </ScrollArea>
      )
    }

    return null
  }

  // Render content based on status
  const renderContent = () => {
    // Error state
    if (status === 'error') {
      // If we have content, show error banner + content tabs
      if (rawMarkdown || content) {
        return (
          <div className="flex h-full flex-col">
            {renderErrorBanner()}
            <div className="flex-1 overflow-hidden">{renderContentTabs()}</div>
          </div>
        )
      }

      // No content - show full error screen
      return (
        <div className="flex flex-col items-center justify-center space-y-4 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <div>
            <h3 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-400">
              {t.generationError}
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">{errorMessage || t.contentError}</p>
            {errorMessage && (
              <details className="text-left">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
                  {t.technicalDetails}
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">
                  {errorMessage}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    // Pending/Active states
    if (status === 'pending' || status === 'active') {
      return (
        <div className="space-y-6 p-6">
          <div className="text-muted-foreground mb-6 flex items-center justify-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">
              {status === 'pending' ? t.pendingGeneration : t.generatingContent}
            </span>
          </div>

          {/* Skeleton loaders */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="pt-4">
              <Skeleton className="h-5 w-1/2" />
              <div className="mt-2 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
            <div className="pt-4">
              <Skeleton className="h-5 w-1/2" />
              <div className="mt-2 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>

          {/* Streaming text overlay (if content is partially available) */}
          {content && (
            <div className="mt-4 rounded border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <p className="mb-2 text-xs font-medium text-blue-700 dark:text-blue-300">
                Предварительный просмотр (генерация продолжается)
              </p>
              <div className="text-foreground text-sm">
                {content.introduction && <p className="mb-2 opacity-80">{content.introduction}</p>}
              </div>
            </div>
          )}
        </div>
      )
    }

    // Completed state - render actual content using shared helper
    if (status === 'completed') {
      return renderContentTabs()
    }

    return null
  }

  // Action bar visibility - show for completed OR error with content (allows regeneration)
  const showActions = status === 'completed' || (status === 'error' && (rawMarkdown || content))

  return (
    <div className={cn('flex h-full flex-col bg-white dark:bg-slate-950', className)}>
      {/* Tabs */}
      <div className="border-b border-slate-200 px-4 pt-4 dark:border-slate-800">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="preview">{t.preview}</TabsTrigger>
            <TabsTrigger value="markdown">Markdown</TabsTrigger>
            <TabsTrigger value="metadata">{t.metadata}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content area */}
      <div className="relative flex-1 overflow-hidden">{renderContent()}</div>

      {/* Action bar (floating at bottom) */}
      {showActions && (
        <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3">
            {/* Judge verdict indicator */}
            {judgeResult && (
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    judgeResult.votingResult.finalVerdict === 'ACCEPT' &&
                      'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
                    judgeResult.votingResult.finalVerdict === 'ACCEPT_WITH_MINOR_REVISION' &&
                      'border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300',
                    judgeResult.votingResult.finalVerdict === 'ITERATIVE_REFINEMENT' &&
                      'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
                    judgeResult.votingResult.finalVerdict === 'REGENERATE' &&
                      'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300',
                    judgeResult.votingResult.finalVerdict === 'ESCALATE_TO_HUMAN' &&
                      'border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
                  )}
                >
                  {JUDGE_VERDICT_LABELS[judgeResult.votingResult.finalVerdict]?.ru ??
                    String(judgeResult.votingResult.finalVerdict).replace(/_/g, ' ')}{' '}
                  ({Math.round(judgeResult.votingResult.finalScore * 100)}%)
                </Badge>
              </div>
            )}

            {/* Action buttons */}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={isRegenerating || isApproving}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.regenerating}
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t.regenerate}
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                disabled={isApproving || isRegenerating}
              >
                <Edit3 className="mr-2 h-4 w-4" />
                {t.edit}
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={onApprove}
                disabled={isApproving || isRegenerating}
              >
                {isApproving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.approving}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t.approve}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Skeleton loader for the entire panel
export function ContentPreviewPanelSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full flex-col bg-white dark:bg-slate-950', className)}>
      <div className="border-b border-slate-200 px-4 pt-4 dark:border-slate-800">
        <div className="flex gap-2 pb-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="pt-4">
          <Skeleton className="h-5 w-1/2" />
          <div className="mt-2 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
