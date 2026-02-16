'use client'

/**
 * PresentationPreview Component
 *
 * Displays presentation enrichment with carousel-based slide viewer.
 * Features:
 * - Slide carousel with navigation (previous/next)
 * - Thumbnail strip for quick navigation
 * - Keyboard navigation (arrow keys)
 * - Slide details panel (speaker notes, visual suggestions)
 * - Theme-aware slide rendering (default/dark/academic)
 * - Draft approval flow for two-stage enrichments
 *
 * @module components/generation-graph/panels/stage7/PresentationPreview
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useLocale } from 'next-intl'
import {
  Presentation,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  Loader2,
  Check,
  FileText,
  Mic,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { MarkdownRendererFull } from '@/components/markdown'
import { JsonViewer } from '../shared/JsonViewer'
import { EnrichmentStatusBadge } from './EnrichmentStatusBadge'
import { useRotatingStatusMessage } from '@/lib/hooks/useRotatingStatusMessage'
import { type EnrichmentStatus } from '@/lib/generation-graph/enrichment-config'
import { cn } from '@/lib/utils'
import type {
  PresentationEnrichmentContent,
  PresentationSlide,
  PresentationTheme,
  SlideLayout,
} from '@megacampus/shared-types/enrichment-content'

// ============================================================================
// Types
// ============================================================================

/**
 * Props for PresentationPreview component
 */
export interface PresentationPreviewProps {
  /** The enrichment record with content and status */
  enrichment: {
    id: string
    status: EnrichmentStatus
    content: PresentationEnrichmentContent | null
    draft_content: unknown | null
    metadata: Record<string, unknown> | null
    error_message?: string | null
  }

  /** Called when user wants to regenerate */
  onRegenerate?: () => void

  /** Called when user approves the draft (two-stage flow) */
  onApproveDraft?: () => void

  /** Loading state for regeneration */
  isRegenerating?: boolean

  /** Optional className */
  className?: string

  /** Course language for localized callout titles (ISO 639-1) */
  language?: string
}

// ============================================================================
// Translations
// ============================================================================

const TRANSLATIONS = {
  ru: {
    // Header
    presentation: 'Презентация',
    slides: 'слайдов',
    theme: 'Тема',
    slideNumber: 'Слайд',
    of: 'из',

    // Themes
    themeDefault: 'Стандартная',
    themeDark: 'Тёмная',
    themeAcademic: 'Академическая',

    // Layouts
    layoutTitle: 'Титульный',
    layoutContent: 'Контент',
    layoutTwoColumn: 'Две колонки',
    layoutImage: 'Изображение',

    // Details panel
    details: 'Детали слайда',
    speakerNotes: 'Заметки докладчика',
    visualSuggestion: 'Визуальная рекомендация',
    layout: 'Макет',

    // Actions
    approve: 'Одобрить',
    approving: 'Одобрение...',
    regenerate: 'Переделать',
    regenerating: 'Переделка...',
    retry: 'Повторить',
    showDetails: 'Показать детали',
    hideDetails: 'Скрыть детали',

    // States
    generatingOutline: 'Генерация структуры...',
    generatingSlides: 'Генерация слайдов...',
    draftReady: 'Черновик готов',
    errorTitle: 'Ошибка генерации',
    errorDetails: 'Технические детали',
    noContent: 'Контент недоступен',
    noMetadata: 'Метаданные недоступны',

    // Navigation
    previousSlide: 'Предыдущий слайд',
    nextSlide: 'Следующий слайд',
    goToSlide: 'Перейти к слайду',
  },
  en: {
    // Header
    presentation: 'Presentation',
    slides: 'slides',
    theme: 'Theme',
    slideNumber: 'Slide',
    of: 'of',

    // Themes
    themeDefault: 'Default',
    themeDark: 'Dark',
    themeAcademic: 'Academic',

    // Layouts
    layoutTitle: 'Title',
    layoutContent: 'Content',
    layoutTwoColumn: 'Two Column',
    layoutImage: 'Image',

    // Details panel
    details: 'Slide Details',
    speakerNotes: 'Speaker Notes',
    visualSuggestion: 'Visual Suggestion',
    layout: 'Layout',

    // Actions
    approve: 'Approve',
    approving: 'Approving...',
    regenerate: 'Regenerate',
    regenerating: 'Regenerating...',
    retry: 'Retry',
    showDetails: 'Show Details',
    hideDetails: 'Hide Details',

    // States
    generatingOutline: 'Generating outline...',
    generatingSlides: 'Generating slides...',
    draftReady: 'Draft Ready',
    errorTitle: 'Generation Error',
    errorDetails: 'Technical Details',
    noContent: 'Content unavailable',
    noMetadata: 'Metadata unavailable',

    // Navigation
    previousSlide: 'Previous slide',
    nextSlide: 'Next slide',
    goToSlide: 'Go to slide',
  },
}

/** Translations type */
type Translations = typeof TRANSLATIONS.ru

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get theme label for display
 */
function getThemeLabel(theme: PresentationTheme, t: Translations): string {
  switch (theme) {
    case 'default':
      return t.themeDefault
    case 'dark':
      return t.themeDark
    case 'academic':
      return t.themeAcademic
    default:
      return theme
  }
}

/**
 * Get layout label for display
 */
function getLayoutLabel(layout: SlideLayout, t: Translations): string {
  switch (layout) {
    case 'title':
      return t.layoutTitle
    case 'content':
      return t.layoutContent
    case 'two-column':
      return t.layoutTwoColumn
    case 'image':
      return t.layoutImage
    default:
      return layout
  }
}

/**
 * Get theme-specific background classes
 */
function getThemeBackgroundClasses(theme: PresentationTheme): string {
  switch (theme) {
    case 'dark':
      return 'bg-slate-900 text-slate-100 border-slate-700'
    case 'academic':
      return 'bg-amber-50 text-slate-900 border-amber-200 dark:bg-amber-900/20 dark:text-slate-100 dark:border-amber-700'
    case 'default':
    default:
      return 'bg-white text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700'
  }
}

/**
 * Get layout icon component
 */
function getLayoutIcon(layout: SlideLayout): React.ComponentType<{ className?: string }> {
  switch (layout) {
    case 'title':
      return FileText
    case 'content':
      return FileText
    case 'two-column':
      return FileText
    case 'image':
      return ImageIcon
    default:
      return FileText
  }
}

/**
 * Check if status indicates draft phase
 */
function isDraftPhase(status: EnrichmentStatus): boolean {
  return status === 'draft_ready'
}

/**
 * Check if status indicates loading state
 */
function isLoadingStatus(status: EnrichmentStatus): boolean {
  return status === 'generating' || status === 'draft_generating'
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Slide preview component with theme-aware styling
 */
function SlidePreview({
  slide,
  isActive,
  onClick,
  t,
}: {
  slide: PresentationSlide
  isActive: boolean
  onClick: () => void
  t: Translations
}): React.JSX.Element {
  const LayoutIcon = getLayoutIcon(slide.layout)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-2 rounded-md border-2 p-2 transition-all',
        'hover:border-primary/50 focus:ring-primary/20 focus:ring-2 focus:outline-none',
        isActive ? 'border-primary bg-primary/5' : 'bg-muted/30 border-transparent'
      )}
      aria-label={`${t.goToSlide} ${slide.index + 1}`}
    >
      <div className="flex w-full items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">{slide.index + 1}</span>
        <LayoutIcon className="text-muted-foreground h-3 w-3" />
      </div>
      <div className="w-full text-left">
        <p className="line-clamp-2 text-xs font-medium">{slide.title}</p>
      </div>
    </button>
  )
}

/**
 * Slide content renderer with 16:9 aspect ratio
 */
function SlideContent({
  slide,
  theme,
  language,
}: {
  slide: PresentationSlide
  theme: PresentationTheme
  language?: string
}): React.JSX.Element {
  const themeClasses = getThemeBackgroundClasses(theme)

  return (
    <div className={cn('aspect-video w-full overflow-hidden rounded-lg border-2', themeClasses)}>
      <div className="h-full overflow-auto p-8">
        {/* Slide title */}
        <h2 className="mb-6 text-3xl font-bold">{slide.title}</h2>

        {/* Slide content */}
        <div className="prose prose-slate max-w-none">
          <MarkdownRendererFull content={slide.content} preset="preview" language={language} />
        </div>
      </div>
    </div>
  )
}

/**
 * Slide details panel (collapsible)
 */
function SlideDetailsPanel({
  slide,
  isExpanded,
  onToggle,
  t,
}: {
  slide: PresentationSlide
  isExpanded: boolean
  onToggle: () => void
  t: Translations
}): React.JSX.Element {
  const LayoutIcon = getLayoutIcon(slide.layout)
  const hasSpeakerNotes = Boolean(slide.speaker_notes)
  const hasVisualSuggestion = Boolean(slide.visual_suggestion)

  if (!hasSpeakerNotes && !hasVisualSuggestion) {
    return <></>
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Collapse header */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center justify-between px-4 py-2',
          'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800',
          'focus:ring-primary/20 transition-colors focus:ring-2 focus:outline-none'
        )}
      >
        <span className="text-sm font-medium">{t.details}</span>
        {isExpanded ? (
          <ChevronUp className="text-muted-foreground h-4 w-4" />
        ) : (
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="space-y-4 p-4">
          {/* Layout badge */}
          <div className="flex items-center gap-2">
            <LayoutIcon className="text-muted-foreground h-4 w-4" />
            <span className="text-muted-foreground text-sm">{t.layout}:</span>
            <Badge variant="outline" className="text-xs">
              {getLayoutLabel(slide.layout, t)}
            </Badge>
          </div>

          {/* Speaker notes */}
          {hasSpeakerNotes && (
            <div className="space-y-2">
              <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <Mic className="h-4 w-4" />
                {t.speakerNotes}
              </div>
              <p className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-900">
                {slide.speaker_notes}
              </p>
            </div>
          )}

          {/* Visual suggestion */}
          {hasVisualSuggestion && (
            <div className="space-y-2">
              <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="h-4 w-4" />
                {t.visualSuggestion}
              </div>
              <p className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-900">
                {slide.visual_suggestion}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * PresentationPreview
 *
 * Carousel-based presentation viewer with slide navigation, thumbnails,
 * and details panel.
 *
 * @param props - Component props
 * @returns React element
 */
export function PresentationPreview({
  enrichment,
  onRegenerate,
  onApproveDraft,
  isRegenerating = false,
  className,
  language,
}: PresentationPreviewProps): React.JSX.Element {
  const locale = useLocale()
  const t: Translations = TRANSLATIONS[locale] || TRANSLATIONS.ru

  const [currentSlide, setCurrentSlide] = useState(0)
  const [detailsExpanded, setDetailsExpanded] = useState(false)

  // Rotating status message for loading state
  const { message: statusMessage } = useRotatingStatusMessage({
    status: 'presentation_generating',
    interval: 5000,
    enabled: isLoadingStatus(enrichment.status),
  })

  // Determine mode based on status
  const isDraft = isDraftPhase(enrichment.status)
  const isLoading = isLoadingStatus(enrichment.status)
  const isError = enrichment.status === 'failed'

  // Get presentation content (from content or draft_content)
  const presentationContent = useMemo(() => {
    if (isDraft && enrichment.draft_content) {
      // Validate draft_content structure
      const draft = enrichment.draft_content as PresentationEnrichmentContent
      if (draft.type === 'presentation' && draft.slides?.length > 0) {
        return draft
      }
    }
    if (enrichment.content && enrichment.content.type === 'presentation') {
      return enrichment.content
    }
    return null
  }, [enrichment.content, enrichment.draft_content, isDraft])

  // Slide navigation handlers
  const goToSlide = useCallback(
    (index: number) => {
      if (!presentationContent) return
      const maxIndex = presentationContent.slides.length - 1
      setCurrentSlide(Math.max(0, Math.min(index, maxIndex)))
    },
    [presentationContent]
  )

  const nextSlide = useCallback(() => {
    if (!presentationContent) return
    const maxIndex = presentationContent.slides.length - 1
    setCurrentSlide((prev) => Math.min(prev + 1, maxIndex))
  }, [presentationContent])

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0))
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        nextSlide()
      } else if (e.key === 'ArrowLeft') {
        prevSlide()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextSlide, prevSlide])

  // Reset slide index when content changes
  useEffect(() => {
    setCurrentSlide(0)
  }, [presentationContent])

  // --------------------------------------------------------------------------
  // Render: Loading State
  // --------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className={cn('flex h-full flex-col bg-white dark:bg-slate-950', className)}>
        {/* Header with status */}
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{t.presentation}</h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>
        </div>

        {/* Loading content */}
        <div className="flex-1 space-y-6 p-6">
          <div className="text-muted-foreground mb-6 flex items-center justify-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm transition-opacity duration-300">{statusMessage}</span>
          </div>

          {/* Skeleton slide */}
          <div className="aspect-video w-full rounded-lg border-2 border-slate-200 dark:border-slate-800">
            <div className="h-full space-y-4 p-8">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>

          {/* Skeleton thumbnails */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-32 flex-shrink-0" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // Render: Error State
  // --------------------------------------------------------------------------
  if (isError) {
    return (
      <div className={cn('flex h-full flex-col bg-white dark:bg-slate-950', className)}>
        {/* Header with status */}
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{t.presentation}</h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>
        </div>

        {/* Error content */}
        <div className="flex flex-1 flex-col items-center justify-center space-y-4 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <div>
            <h3 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-400">
              {t.errorTitle}
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {enrichment.error_message || t.errorTitle}
            </p>
            {enrichment.error_message && (
              <details className="mx-auto max-w-md text-left">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
                  {t.errorDetails}
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-100 p-3 text-xs dark:bg-slate-800">
                  {enrichment.error_message}
                </pre>
              </details>
            )}
          </div>
        </div>

        {/* Action bar */}
        {onRegenerate && (
          <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={onRegenerate} disabled={isRegenerating}>
                {isRegenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.regenerating}
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t.retry}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // Render: No Content
  // --------------------------------------------------------------------------
  if (!presentationContent) {
    return (
      <div className={cn('flex h-full flex-col bg-white dark:bg-slate-950', className)}>
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{t.presentation}</h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-sm">{t.noContent}</p>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // Render: Presentation Viewer
  // --------------------------------------------------------------------------
  const currentSlideData = presentationContent.slides[currentSlide]
  const totalSlides = presentationContent.total_slides

  return (
    <div className={cn('flex h-full flex-col bg-white dark:bg-slate-950', className)}>
      {/* Header with status and metadata */}
      <div className="space-y-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Presentation className="h-5 w-5 text-orange-500 dark:text-orange-400" />
            <h3 className="font-medium">{t.presentation}</h3>
          </div>
          <EnrichmentStatusBadge status={enrichment.status} size="sm" />
        </div>

        {/* Metadata chips */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            {totalSlides} {t.slides}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {t.theme}: {getThemeLabel(presentationContent.theme, t)}
          </Badge>
          {isDraft && (
            <Badge variant="secondary" className="text-xs">
              {t.draftReady}
            </Badge>
          )}
        </div>
      </div>

      {/* Main content area */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Slide navigation controls */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={prevSlide}
              disabled={currentSlide === 0}
              aria-label={t.previousSlide}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="text-sm font-medium">
              {t.slideNumber} {currentSlide + 1} {t.of} {totalSlides}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={nextSlide}
              disabled={currentSlide === totalSlides - 1}
              aria-label={t.nextSlide}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Current slide preview */}
          <SlideContent slide={currentSlideData} theme={presentationContent.theme} language={language} />

          {/* Slide details panel */}
          <SlideDetailsPanel
            slide={currentSlideData}
            isExpanded={detailsExpanded}
            onToggle={() => setDetailsExpanded(!detailsExpanded)}
            t={t}
          />

          {/* Thumbnail strip */}
          <div>
            <h4 className="mb-2 text-sm font-medium">{t.slides}</h4>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
              {presentationContent.slides.map((slide) => (
                <SlidePreview
                  key={slide.index}
                  slide={slide}
                  isActive={slide.index === currentSlide}
                  onClick={() => goToSlide(slide.index)}
                  t={t}
                />
              ))}
            </div>
          </div>

          {/* Metadata viewer */}
          {enrichment.metadata && (
            <JsonViewer data={enrichment.metadata} title={t.noMetadata} defaultExpanded={false} />
          )}
        </div>
      </ScrollArea>

      {/* Action bar */}
      <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-end gap-2">
          {onRegenerate && (
            <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={isRegenerating}>
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
          )}

          {isDraft && onApproveDraft && (
            <Button variant="default" size="sm" onClick={onApproveDraft}>
              <Check className="mr-2 h-4 w-4" />
              {t.approve}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PresentationPreview
