'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useLocale } from 'next-intl'
import { Loader2, AlertCircle, RotateCcw, Check, Trash2, FileQuestion } from 'lucide-react'
import { toast } from 'sonner'
import { sanitizeErrorMessage } from '@/lib/utils/sanitize-error'
import { Button } from '@/components/ui/button'
import { QuizPreview, type QuizPreviewProps } from '../QuizPreview'
import { AudioPreview, type AudioPreviewProps } from '../AudioPreview'
import { VideoScriptPanel, type VideoScriptPanelProps } from '../VideoScriptPanel'
import { PresentationPreview, type PresentationPreviewProps } from '../PresentationPreview'
import { CoverPreview, type CoverPreviewProps } from '../CoverPreview'
import { DeleteConfirmationDialog } from '../components/DeleteConfirmationDialog'
import { type EnrichmentStatus } from '@/lib/generation-graph/enrichment-config'
import { cn } from '@/lib/utils'
import { useStaticGraph } from '../../../contexts/StaticGraphContext'
import { useEnrichmentInspectorStore } from '../../../stores/enrichment-inspector-store'
import { getEnrichment } from '@/app/actions/enrichment-actions'
import { trpc } from '@/lib/trpc/react'

export interface DetailViewProps {
  enrichmentId: string
  className?: string
}

// Type aliases for each preview component's enrichment prop
type QuizEnrichment = QuizPreviewProps['enrichment']
type VideoEnrichment = VideoScriptPanelProps['enrichment']
type AudioEnrichment = AudioPreviewProps['enrichment']
type PresentationEnrichment = PresentationPreviewProps['enrichment']
type CoverEnrichment = CoverPreviewProps['enrichment']

// Discriminated union for type-safe enrichment handling
interface EnrichmentBase {
  id: string
  status: EnrichmentStatus
  metadata: Record<string, unknown> | null
  error_message: string | null
  asset_url: string | null
  draft_content: unknown
}

interface QuizEnrichmentData extends EnrichmentBase {
  type: 'quiz'
  content: QuizEnrichment['content']
}

interface VideoEnrichmentData extends EnrichmentBase {
  type: 'video'
  content: VideoEnrichment['content']
}

interface AudioEnrichmentData extends EnrichmentBase {
  type: 'audio'
  content: AudioEnrichment['content']
}

interface PresentationEnrichmentData extends EnrichmentBase {
  type: 'presentation'
  content: PresentationEnrichment['content']
}

interface CoverEnrichmentData extends EnrichmentBase {
  type: 'cover'
  content: CoverEnrichment['content']
}

// Discriminated union type
type EnrichmentData =
  | QuizEnrichmentData
  | VideoEnrichmentData
  | AudioEnrichmentData
  | PresentationEnrichmentData
  | CoverEnrichmentData

// Data state for the enrichment detail
type DataState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'not_found' }
  | { status: 'success'; data: EnrichmentData }

/**
 * Hook to fetch enrichment data from server action
 */
function useEnrichmentDetail(enrichmentId: string): DataState & { refetch: () => void } {
  const { courseInfo } = useStaticGraph()
  const [state, setState] = useState<DataState>({ status: 'loading' })

  const fetchEnrichment = useCallback(async () => {
    if (!enrichmentId || !courseInfo?.id) {
      setState({ status: 'not_found' })
      return
    }

    setState({ status: 'loading' })

    try {
      const result = await getEnrichment({
        enrichmentId,
        courseId: courseInfo.id,
      })

      if (!result.success || !result.enrichment) {
        if (result.error === 'Enrichment not found') {
          setState({ status: 'not_found' })
        } else {
          setState({ status: 'error', error: result.error || 'Failed to load enrichment' })
        }
        return
      }

      // Map database types to component types
      const enrichment = result.enrichment
      const baseData: EnrichmentBase = {
        id: enrichment.id,
        status: enrichment.status as EnrichmentStatus,
        metadata: enrichment.metadata,
        error_message: enrichment.error_message,
        asset_url: enrichment.asset_url,
        draft_content: enrichment.draft_content,
      }

      // Create discriminated union based on type
      let enrichmentData: EnrichmentData
      switch (enrichment.enrichment_type) {
        case 'quiz':
          enrichmentData = {
            ...baseData,
            type: 'quiz',
            content: enrichment.content as QuizEnrichment['content'],
          }
          break
        case 'video':
          enrichmentData = {
            ...baseData,
            type: 'video',
            content: enrichment.content as VideoEnrichment['content'],
          }
          break
        case 'audio':
          enrichmentData = {
            ...baseData,
            type: 'audio',
            content: enrichment.content as AudioEnrichment['content'],
          }
          break
        case 'presentation':
          enrichmentData = {
            ...baseData,
            type: 'presentation',
            content: enrichment.content as PresentationEnrichment['content'],
          }
          break
        case 'cover':
          enrichmentData = {
            ...baseData,
            type: 'cover',
            content: enrichment.content as CoverEnrichment['content'],
          }
          break
        case 'document':
          // Document type not yet supported in preview, treat as not found
          setState({ status: 'not_found' })
          return
        default:
          setState({ status: 'error', error: 'Unknown enrichment type' })
          return
      }

      setState({ status: 'success', data: enrichmentData })
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to load enrichment',
      })
    }
  }, [enrichmentId, courseInfo?.id])

  useEffect(() => {
    void fetchEnrichment()
  }, [fetchEnrichment])

  return { ...state, refetch: () => void fetchEnrichment() }
}

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  )
}

function NotFoundState() {
  const locale = useLocale()
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <FileQuestion className="text-muted-foreground mb-4 h-12 w-12" />
      <h3 className="mb-2 text-lg font-medium">
        {locale === 'ru' ? 'Обогащение не найдено' : 'Enrichment Not Found'}
      </h3>
      <p className="text-muted-foreground text-sm">
        {locale === 'ru'
          ? 'Это обогащение могло быть удалено или перемещено.'
          : 'This enrichment may have been deleted or moved.'}
      </p>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const locale = useLocale()
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
      <h3 className="mb-2 text-lg font-medium text-red-700 dark:text-red-400">
        {locale === 'ru' ? 'Ошибка генерации' : 'Generation Error'}
      </h3>
      <p className="text-muted-foreground mb-4 max-w-md text-sm">
        {sanitizeErrorMessage(error, { locale })}
      </p>
      <Button onClick={onRetry}>
        <RotateCcw className="mr-2 h-4 w-4" />
        {locale === 'ru' ? 'Повторить' : 'Retry'}
      </Button>
    </div>
  )
}

interface ActionBarProps {
  enrichment: EnrichmentData
  onDelete: () => void
  onRegenerate: () => void
  onApprove: () => void
}

function ActionBar({ enrichment, onDelete, onRegenerate, onApprove }: ActionBarProps) {
  const locale = useLocale()

  // Different actions based on status
  const showApprove = enrichment.status === 'draft_ready'
  const showRegenerate = enrichment.status === 'completed' || enrichment.status === 'failed'
  const showDelete = true

  return (
    <div className="border-t bg-white p-4 dark:bg-slate-950">
      <div className="flex gap-2">
        {showApprove && (
          <Button onClick={onApprove} className="flex-1">
            <Check className="mr-2 h-4 w-4" />
            {locale === 'ru' ? 'Одобрить' : 'Approve'}
          </Button>
        )}
        {showRegenerate && (
          <Button variant="outline" onClick={onRegenerate}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {locale === 'ru' ? 'Переделать' : 'Regenerate'}
          </Button>
        )}
        {showDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={locale === 'ru' ? 'Удалить' : 'Delete'}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Helper functions to extract preview props from enrichment data
 * These ensure type-safe narrowing from discriminated union
 */
function toQuizPreviewProps(e: QuizEnrichmentData): QuizEnrichment {
  return {
    id: e.id,
    status: e.status,
    content: e.content,
    metadata: e.metadata,
    error_message: e.error_message,
  }
}

function toVideoPreviewProps(e: VideoEnrichmentData): VideoEnrichment {
  return {
    id: e.id,
    status: e.status,
    content: e.content,
    metadata: e.metadata,
    error_message: e.error_message,
  }
}

function toAudioPreviewProps(e: AudioEnrichmentData): AudioEnrichment {
  return {
    id: e.id,
    status: e.status,
    content: e.content,
    metadata: e.metadata,
    error_message: e.error_message,
  }
}

function toPresentationPreviewProps(e: PresentationEnrichmentData): PresentationEnrichment {
  return {
    id: e.id,
    status: e.status,
    content: e.content,
    draft_content: e.draft_content,
    metadata: e.metadata,
    error_message: e.error_message,
  }
}

function toCoverPreviewProps(e: CoverEnrichmentData): CoverEnrichment {
  return {
    id: e.id,
    status: e.status,
    content: e.content,
    metadata: e.metadata,
    error_message: e.error_message,
  }
}

/**
 * Cover preview props for passing handlers to CoverPreview
 * Note: onSelectVariant, onApproveDraft, isApproving removed (single-stage flow)
 */
interface CoverPreviewHandlers {
  onRegenerate?: () => void
  isRegenerating?: boolean
  onDelete?: () => void
  isDeleting?: boolean
}

/**
 * Renders the appropriate preview component based on enrichment type.
 * Uses discriminated union pattern for type-safe rendering.
 */
function renderPreview(enrichment: EnrichmentData, coverHandlers?: CoverPreviewHandlers) {
  switch (enrichment.type) {
    case 'quiz':
      return <QuizPreview enrichment={toQuizPreviewProps(enrichment)} />
    case 'video':
      return <VideoScriptPanel enrichment={toVideoPreviewProps(enrichment)} />
    case 'audio':
      return <AudioPreview enrichment={toAudioPreviewProps(enrichment)} />
    case 'presentation':
      return <PresentationPreview enrichment={toPresentationPreviewProps(enrichment)} />
    case 'cover':
      return (
        <CoverPreview
          enrichment={toCoverPreviewProps(enrichment)}
          onRegenerate={coverHandlers?.onRegenerate}
          isRegenerating={coverHandlers?.isRegenerating}
          onDelete={coverHandlers?.onDelete}
          isDeleting={coverHandlers?.isDeleting}
        />
      )
    default: {
      // Exhaustive check - should never reach here
      const _exhaustive: never = enrichment
      return <div>Unknown type: {(_exhaustive as EnrichmentData).type}</div>
    }
  }
}

export function DetailView({ enrichmentId, className }: DetailViewProps) {
  const locale = useLocale()
  const { courseInfo } = useStaticGraph()
  const goBack = useEnrichmentInspectorStore((s) => s.goBack)

  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Fetch real enrichment data
  const dataState = useEnrichmentDetail(enrichmentId)

  // tRPC mutations for delete and regenerate
  const deleteMutation = trpc.enrichment.delete.useMutation({
    onSuccess: () => {
      toast.success(locale === 'ru' ? 'Активность удалена' : 'Activity deleted')
      setShowDeleteDialog(false)
      goBack()
    },
    onError: (error) => {
      toast.error(
        locale === 'ru'
          ? `Не удалось удалить: ${error.message}`
          : `Failed to delete: ${error.message}`
      )
    },
  })

  const regenerateMutation = trpc.enrichment.regenerate.useMutation({
    onSuccess: () => {
      toast.success(locale === 'ru' ? 'Перегенерация запущена' : 'Regeneration started')
      // Refetch to show updated status
      dataState.refetch()
    },
    onError: (error) => {
      toast.error(locale === 'ru' ? `Ошибка: ${error.message}` : `Error: ${error.message}`)
    },
  })

  const isDeleting = deleteMutation.isPending
  const isRegenerating = regenerateMutation.isPending

  // Handle delete confirmation
  const handleDeleteClick = useCallback(() => {
    setShowDeleteDialog(true)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (!courseInfo?.id) {
      toast.error(locale === 'ru' ? 'Курс не найден' : 'Course not found')
      return
    }

    deleteMutation.mutate({ enrichmentId })
  }, [enrichmentId, courseInfo?.id, locale, deleteMutation])

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteDialog(false)
  }, [])

  // Handle regenerate action
  const handleRegenerate = useCallback(() => {
    if (!courseInfo?.id) {
      toast.error(locale === 'ru' ? 'Курс не найден' : 'Course not found')
      return
    }

    regenerateMutation.mutate({ enrichmentId })
  }, [enrichmentId, courseInfo?.id, locale, regenerateMutation])

  // Handle approve action (Coming soon for non-cover types)
  const handleApprove = useCallback(() => {
    toast.info(locale === 'ru' ? 'Скоро будет доступно' : 'Coming soon')
  }, [locale])

  // Render based on data state
  const renderContent = () => {
    switch (dataState.status) {
      case 'loading':
        return <LoadingState />

      case 'not_found':
        return <NotFoundState />

      case 'error':
        return <ErrorState error={dataState.error} onRetry={dataState.refetch} />

      case 'success': {
        const enrichment = dataState.data

        // Show error state for failed enrichments
        if (enrichment.status === 'failed') {
          return <ErrorState error={enrichment.error_message} onRetry={handleRegenerate} />
        }

        // Cover handlers for CoverPreview component (single-stage flow - no variant selection)
        const coverHandlers: CoverPreviewHandlers =
          enrichment.type === 'cover'
            ? {
                onRegenerate: handleRegenerate,
                isRegenerating,
                onDelete: handleDeleteClick,
                isDeleting,
              }
            : {}

        // Hide action bar for cover completed state (CoverPreview has its own action bar)
        const hideCoverActionBar = enrichment.type === 'cover' && enrichment.status === 'completed'

        // Render preview with action bar
        return (
          <>
            {/* Preview component */}
            <div data-testid="preview-content" className="flex-1 overflow-hidden">
              {renderPreview(enrichment, coverHandlers)}
            </div>

            {/* Action bar - hidden for cover draft state */}
            {!hideCoverActionBar && (
              <ActionBar
                enrichment={enrichment}
                onDelete={handleDeleteClick}
                onRegenerate={handleRegenerate}
                onApprove={handleApprove}
              />
            )}
          </>
        )
      }

      default:
        return null
    }
  }

  return (
    <>
      <div data-testid="detail-view" className={cn('flex h-full flex-col', className)}>
        {renderContent()}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDeleting={isDeleting}
      />
    </>
  )
}
