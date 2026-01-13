'use client'

import React, { useState, useMemo } from 'react'
import { useLocale } from 'next-intl'
import Image from 'next/image'
import { ImageIcon, FileText, Download, Loader2, Sparkles, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { EnrichmentStatus, CoverEnrichmentContent } from '@megacampus/shared-types'

// ============================================================================
// Types - Single Source of Truth from @megacampus/shared-types
// ============================================================================

/**
 * Re-export CoverEnrichmentContent for backward compatibility
 * @see packages/shared-types/src/enrichment-content.ts
 */
type CoverContent = CoverEnrichmentContent

/**
 * Cover draft content structure (prompt variants for selection)
 */
export interface CoverDraftContent {
  type: 'cover_draft'
  variants: Array<{
    id: number
    prompt_en: string
    description_localized: string
  }>
  selected_variant?: number
}

export interface CoverPreviewProps {
  enrichment: {
    id: string
    status: EnrichmentStatus
    content: CoverContent | null
    draft_content: CoverDraftContent | null
    metadata: Record<string, unknown> | null
    error_message: string | null
  }
  /** Callback when user selects a variant */
  onSelectVariant?: (variantId: number) => void
  /** Callback when user approves draft with selected variant */
  onApproveDraft?: () => void
  /** Loading state for approval button */
  isApproving?: boolean
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
    selectCoverStyle: 'Выберите стиль обложки',
    generateImage: 'Сгенерировать изображение',
    generating: 'Генерация...',
    variant: 'Вариант',
    imagePrompt: 'Промпт для генерации',
    coverNotGenerated: 'Обложка не сгенерирована',
    generationPrompt: 'Промпт генерации',
    download: 'Скачать',
    selectVariantFirst: 'Выберите вариант',
    draftReady: 'Черновик готов',
    generatingDraft: 'Генерация вариантов...',
    regenerate: 'Перегенерировать',
    regenerating: 'Перегенерация...',
    delete: 'Удалить',
    deleting: 'Удаление...',
  },
  en: {
    selectCoverStyle: 'Select cover style',
    generateImage: 'Generate Image',
    generating: 'Generating...',
    variant: 'Variant',
    imagePrompt: 'Image prompt',
    coverNotGenerated: 'Cover not generated',
    generationPrompt: 'Generation Prompt',
    download: 'Download',
    selectVariantFirst: 'Select a variant',
    draftReady: 'Draft Ready',
    generatingDraft: 'Generating variants...',
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

/**
 * Format file size for display
 */
function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Get variant number indicator
 */
function getVariantIndicator(index: number): string {
  const indicators = ['1', '2', '3', '4', '5']
  return indicators[index] || String(index + 1)
}

/**
 * Check if draft content is valid
 */
function isValidDraftContent(draft: unknown): draft is CoverDraftContent {
  if (!draft || typeof draft !== 'object') return false
  const d = draft as CoverDraftContent
  return d.type === 'cover_draft' && Array.isArray(d.variants) && d.variants.length > 0
}

// ============================================================================
// Sub-Components
// ============================================================================

interface VariantCardProps {
  variant: CoverDraftContent['variants'][number]
  index: number
  isSelected: boolean
  onSelect: () => void
  t: Translations
}

/**
 * Individual variant selection card
 */
function VariantCard({ variant, index, isSelected, onSelect, t }: VariantCardProps) {
  return (
    <Card
      className={cn(
        'relative cursor-pointer transition-all duration-200',
        'hover:shadow-md',
        isSelected
          ? 'border-primary bg-primary/5 ring-primary/20 ring-2'
          : 'hover:border-primary/50'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          {/* Radio indicator */}
          <RadioGroupItem
            value={String(variant.id)}
            id={`variant-${variant.id}`}
            className="mt-0.5"
          />

          {/* Variant number badge */}
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold',
              isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {getVariantIndicator(index)}
          </div>

          <div className="flex-1">
            <label htmlFor={`variant-${variant.id}`} className="cursor-pointer text-sm font-medium">
              {t.variant} {index + 1}
            </label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Localized description (user-facing) */}
        <p className="text-sm leading-relaxed">{variant.description_localized}</p>

        {/* English prompt (technical) */}
        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Sparkles className="h-3 w-3" />
            {t.imagePrompt}
          </div>
          <p className="text-muted-foreground rounded bg-slate-50 p-2 font-mono text-xs dark:bg-slate-900">
            {variant.prompt_en}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Draft state view - shows variant selection cards
 */
interface DraftViewProps {
  draftContent: CoverDraftContent
  selectedVariant: number | null
  onSelectVariant: (variantId: number) => void
  onApprove: () => void
  isApproving: boolean
  t: Translations
  className?: string
}

function DraftView({
  draftContent,
  selectedVariant,
  onSelectVariant,
  onApprove,
  isApproving,
  t,
  className,
}: DraftViewProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />
            <h3 className="font-medium">{t.selectCoverStyle}</h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {t.draftReady}
          </Badge>
        </div>
      </div>

      {/* Variant selection grid */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <RadioGroup
            value={selectedVariant !== null ? String(selectedVariant) : ''}
            onValueChange={(value) => onSelectVariant(Number(value))}
            className="grid grid-cols-1 gap-4 lg:grid-cols-3"
          >
            {draftContent.variants.map((variant, index) => (
              <VariantCard
                key={variant.id}
                variant={variant}
                index={index}
                isSelected={selectedVariant === variant.id}
                onSelect={() => onSelectVariant(variant.id)}
                t={t}
              />
            ))}
          </RadioGroup>
        </div>
      </ScrollArea>

      {/* Action bar */}
      <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-end gap-2">
          {selectedVariant === null && (
            <span className="text-muted-foreground mr-2 text-sm">{t.selectVariantFirst}</span>
          )}
          <Button
            onClick={onApprove}
            disabled={selectedVariant === null || isApproving}
            className="min-w-[160px]"
          >
            {isApproving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.generating}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {t.generateImage}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Completed state view - shows generated cover image
 */
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

/**
 * Empty state view - no content available
 */
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

/**
 * Loading state for draft generation
 */
interface LoadingViewProps {
  t: Translations
  className?: string
}

function LoadingView({ t, className }: LoadingViewProps) {
  return (
    <div className={cn('flex h-full items-center justify-center p-8', className)}>
      <div className="text-muted-foreground text-center">
        <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin opacity-50" />
        <p>{t.generatingDraft}</p>
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
 * Displays cover enrichment with two-stage flow:
 * 1. Draft state: Shows 3 prompt variants for user selection
 * 2. Completed state: Shows generated cover image with metadata
 *
 * @example
 * ```tsx
 * <CoverPreview
 *   enrichment={enrichment}
 *   onSelectVariant={(id) => setSelectedVariant(id)}
 *   onApproveDraft={() => approveDraft()}
 *   isApproving={isApproving}
 * />
 * ```
 */
export function CoverPreview({
  enrichment,
  onSelectVariant,
  onApproveDraft,
  isApproving = false,
  onRegenerate,
  isRegenerating = false,
  onDelete,
  isDeleting = false,
  className,
}: CoverPreviewProps) {
  const locale = useLocale()
  const t: Translations = TRANSLATIONS[locale] || TRANSLATIONS.en

  // Local state for selected variant
  const [selectedVariantLocal, setSelectedVariantLocal] = useState<number | null>(null)

  // Determine which view to render based on status and content
  const isDraftReady = enrichment.status === 'draft_ready'
  const isDraftGenerating = enrichment.status === 'draft_generating'
  const isCompleted = enrichment.status === 'completed'

  // Parse draft content from draft_content or content field
  const draftContent = useMemo(() => {
    // First try draft_content field
    if (isValidDraftContent(enrichment.draft_content)) {
      return enrichment.draft_content
    }
    // Fall back to content field (when draft data is stored there)
    if (isDraftReady && isValidDraftContent(enrichment.content)) {
      return enrichment.content as unknown as CoverDraftContent
    }
    return null
  }, [enrichment.draft_content, enrichment.content, isDraftReady])

  // Initialize selected variant from draft content
  const selectedVariant = useMemo(() => {
    if (selectedVariantLocal !== null) return selectedVariantLocal
    if (draftContent?.selected_variant) return draftContent.selected_variant
    return null
  }, [selectedVariantLocal, draftContent?.selected_variant])

  // Handle variant selection
  const handleSelectVariant = (variantId: number) => {
    setSelectedVariantLocal(variantId)
    onSelectVariant?.(variantId)
  }

  // Handle draft approval
  const handleApprove = () => {
    if (selectedVariant !== null) {
      onApproveDraft?.()
    }
  }

  // Render loading state during draft generation
  if (isDraftGenerating) {
    return <LoadingView t={t} className={className} />
  }

  // Render draft variant selection
  if (isDraftReady && draftContent) {
    return (
      <DraftView
        draftContent={draftContent}
        selectedVariant={selectedVariant}
        onSelectVariant={handleSelectVariant}
        onApprove={handleApprove}
        isApproving={isApproving}
        t={t}
        className={className}
      />
    )
  }

  // Render completed cover
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

  // Render empty state
  return <EmptyView t={t} className={className} />
}

export default CoverPreview
