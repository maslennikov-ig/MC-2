'use client'

import { useLocale } from 'next-intl'
import Image from 'next/image'
import { ImageIcon, FileText, Download, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRotatingStatusMessage } from '@/lib/hooks/useRotatingStatusMessage'
import type { EnrichmentStatus, CoverEnrichmentContent } from '@megacampus/shared-types'
import { formatFileSize } from '@megacampus/shared-utils'

// ============================================================================
// Types
// ============================================================================

type CoverContent = CoverEnrichmentContent

export interface CoverPreviewProps {
  enrichment: {
    id: string
    status: EnrichmentStatus
    content: CoverContent | null
    metadata: Record<string, unknown> | null
    error_message: string | null
  }
  /** Callback when user wants to regenerate the cover */
  onRegenerate?: () => void
  /** Loading state for regenerate button */
  isRegenerating?: boolean
  /** Callback when user wants to delete the cover */
  onDelete?: () => void
  /** Loading state for delete button */
  isDeleting?: boolean
  className?: string
}

// ============================================================================
// Translations
// ============================================================================

const TRANSLATIONS = {
  ru: {
    coverNotGenerated: 'Обложка не сгенерирована',
    generationPrompt: 'Промпт генерации',
    download: 'Скачать',
    regenerate: 'Перегенерировать',
    regenerating: 'Перегенерация...',
    delete: 'Удалить',
    deleting: 'Удаление...',
  },
  en: {
    coverNotGenerated: 'Cover not generated',
    generationPrompt: 'Generation Prompt',
    download: 'Download',
    regenerate: 'Regenerate',
    regenerating: 'Regenerating...',
    delete: 'Delete',
    deleting: 'Deleting...',
  },
}

type Translations = (typeof TRANSLATIONS)['ru']

// ============================================================================
// Helper Functions
// ============================================================================

// ============================================================================
// Sub-Components
// ============================================================================

interface CompletedViewProps {
  content: CoverContent
  t: Translations
  onRegenerate?: () => void
  isRegenerating?: boolean
  onDelete?: () => void
  isDeleting?: boolean
  className?: string
}

function CompletedView({
  content,
  t,
  onRegenerate,
  isRegenerating,
  onDelete,
  isDeleting,
  className,
}: CompletedViewProps) {
  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = content.imageUrl
    link.download = `cover.${content.format || 'png'}`
    link.target = '_blank'
    link.click()
  }

  return (
    <div className={cn('flex h-full flex-col overflow-auto', className)}>
      {/* Image Preview */}
      <div className="relative bg-slate-100 dark:bg-slate-800">
        <div className="relative aspect-video">
          <Image
            src={content.imageUrl}
            alt={content.altText || 'Lesson cover'}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 600px"
            priority
            unoptimized
          />
        </div>

        {/* Action buttons overlay */}
        <div className="absolute right-3 bottom-3 flex gap-2">
          {onRegenerate && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={onRegenerate}
              disabled={isRegenerating || isDeleting}
            >
              {isRegenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isRegenerating ? t.regenerating : t.regenerate}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={handleDownload}
            disabled={isRegenerating || isDeleting}
          >
            <Download className="h-4 w-4" />
            {t.download}
          </Button>
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={onDelete}
              disabled={isRegenerating || isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {isDeleting ? t.deleting : t.delete}
            </Button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-4 p-4">
        {/* Dimensions and format */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {content.dimensions.width} x {content.dimensions.height}
          </Badge>
          {content.aspectRatio && <Badge variant="outline">{content.aspectRatio}</Badge>}
          {content.format && <Badge variant="outline">{content.format.toUpperCase()}</Badge>}
          {content.file_size_bytes && (
            <Badge variant="outline">{formatFileSize(content.file_size_bytes)}</Badge>
          )}
        </div>

        {/* Generation prompt */}
        <div>
          <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" />
            {t.generationPrompt}
          </div>
          <p className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:bg-slate-900">
            {content.generation_prompt}
          </p>
        </div>
      </div>
    </div>
  )
}

interface EmptyViewProps {
  t: Translations
  className?: string
}

function EmptyView({ t, className }: EmptyViewProps) {
  return (
    <div className={cn('flex h-full items-center justify-center p-8', className)}>
      <div className="text-muted-foreground text-center">
        <ImageIcon className="mx-auto mb-4 h-12 w-12 opacity-50" />
        <p>{t.coverNotGenerated}</p>
      </div>
    </div>
  )
}

interface GeneratingViewProps {
  className?: string
}

function GeneratingView({ className }: GeneratingViewProps) {
  // Use rotating status messages for better UX during generation
  const { message } = useRotatingStatusMessage({
    status: 'cover_generating',
    interval: 5000,
  })

  return (
    <div className={cn('flex h-full items-center justify-center p-8', className)}>
      <div className="text-muted-foreground text-center">
        <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin opacity-50" />
        <p className="transition-opacity duration-300">{message}</p>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * CoverPreview Component
 *
 * Displays cover enrichment preview with single-stage flow:
 * - Generating state: Shows loading spinner
 * - Completed state: Shows generated cover image with metadata
 * - Empty state: Shows placeholder when no content
 *
 * @example
 * ```tsx
 * <CoverPreview
 *   enrichment={enrichment}
 *   onRegenerate={() => regenerate()}
 *   isRegenerating={isRegenerating}
 * />
 * ```
 */
export function CoverPreview({
  enrichment,
  onRegenerate,
  isRegenerating = false,
  onDelete,
  isDeleting = false,
  className,
}: CoverPreviewProps) {
  const locale = useLocale()
  const t: Translations = TRANSLATIONS[locale] || TRANSLATIONS.en

  const isGenerating = enrichment.status === 'generating'
  const isCompleted = enrichment.status === 'completed'

  // Show generating state
  if (isGenerating) {
    return <GeneratingView className={className} />
  }

  // Show completed cover
  if (isCompleted && enrichment.content) {
    return (
      <CompletedView
        content={enrichment.content}
        t={t}
        onRegenerate={onRegenerate}
        isRegenerating={isRegenerating}
        onDelete={onDelete}
        isDeleting={isDeleting}
        className={className}
      />
    )
  }

  // Show empty state
  return <EmptyView t={t} className={className} />
}

export default CoverPreview
