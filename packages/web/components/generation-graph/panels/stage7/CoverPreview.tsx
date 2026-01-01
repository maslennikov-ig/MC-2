'use client';

import React, { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import Image from 'next/image';
import { ImageIcon, FileText, Download, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { EnrichmentStatus } from '@megacampus/shared-types';

// ============================================================================
// Types
// ============================================================================

/**
 * Cover content structure from CoverEnrichmentContent (final state)
 */
interface CoverContent {
  type: 'cover';
  image_url: string;
  width: number;
  height: number;
  aspect_ratio?: string;
  generation_prompt: string;
  alt_text?: string;
  format?: 'png' | 'jpeg' | 'webp';
  file_size_bytes?: number;
}

/**
 * Cover draft content structure (prompt variants for selection)
 */
export interface CoverDraftContent {
  type: 'cover_draft';
  variants: Array<{
    id: number;
    prompt_en: string;
    description_localized: string;
  }>;
  selected_variant?: number;
}

export interface CoverPreviewProps {
  enrichment: {
    id: string;
    status: EnrichmentStatus;
    content: CoverContent | null;
    draft_content: CoverDraftContent | null;
    metadata: Record<string, unknown> | null;
    error_message: string | null;
  };
  /** Callback when user selects a variant */
  onSelectVariant?: (variantId: number) => void;
  /** Callback when user approves draft with selected variant */
  onApproveDraft?: () => void;
  /** Loading state for approval button */
  isApproving?: boolean;
  className?: string;
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
  },
};

type Translations = (typeof TRANSLATIONS)['ru'];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format file size for display
 */
function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Get variant number indicator
 */
function getVariantIndicator(index: number): string {
  const indicators = ['1', '2', '3', '4', '5'];
  return indicators[index] || String(index + 1);
}

/**
 * Check if draft content is valid
 */
function isValidDraftContent(draft: unknown): draft is CoverDraftContent {
  if (!draft || typeof draft !== 'object') return false;
  const d = draft as CoverDraftContent;
  return d.type === 'cover_draft' && Array.isArray(d.variants) && d.variants.length > 0;
}

// ============================================================================
// Sub-Components
// ============================================================================

interface VariantCardProps {
  variant: CoverDraftContent['variants'][number];
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  t: Translations;
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
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
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
              'flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold',
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {getVariantIndicator(index)}
          </div>

          <div className="flex-1">
            <label
              htmlFor={`variant-${variant.id}`}
              className="text-sm font-medium cursor-pointer"
            >
              {t.variant} {index + 1}
            </label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Localized description (user-facing) */}
        <p className="text-sm leading-relaxed">{variant.description_localized}</p>

        {/* English prompt (technical) */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="w-3 h-3" />
            {t.imagePrompt}
          </div>
          <p className="text-xs text-muted-foreground bg-slate-50 dark:bg-slate-900 rounded p-2 font-mono">
            {variant.prompt_en}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Draft state view - shows variant selection cards
 */
interface DraftViewProps {
  draftContent: CoverDraftContent;
  selectedVariant: number | null;
  onSelectVariant: (variantId: number) => void;
  onApprove: () => void;
  isApproving: boolean;
  t: Translations;
  className?: string;
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
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
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
            value={selectedVariant !== null ? String(selectedVariant) : undefined}
            onValueChange={(value) => onSelectVariant(Number(value))}
            className="grid grid-cols-1 lg:grid-cols-3 gap-4"
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
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
        <div className="flex items-center justify-end gap-2">
          {selectedVariant === null && (
            <span className="text-sm text-muted-foreground mr-2">
              {t.selectVariantFirst}
            </span>
          )}
          <Button
            onClick={onApprove}
            disabled={selectedVariant === null || isApproving}
            className="min-w-[160px]"
          >
            {isApproving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t.generating}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {t.generateImage}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Completed state view - shows generated cover image
 */
interface CompletedViewProps {
  content: CoverContent;
  t: Translations;
  className?: string;
}

function CompletedView({ content, t, className }: CompletedViewProps) {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = content.image_url;
    link.download = `cover.${content.format || 'png'}`;
    link.target = '_blank';
    link.click();
  };

  return (
    <div className={cn('flex flex-col h-full overflow-auto', className)}>
      {/* Image Preview */}
      <div className="relative bg-slate-100 dark:bg-slate-800">
        <div className="aspect-video relative">
          <Image
            src={content.image_url}
            alt={content.alt_text || 'Lesson cover'}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 600px"
            priority
            unoptimized
          />
        </div>

        {/* Download button overlay */}
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-3 right-3 gap-2"
          onClick={handleDownload}
        >
          <Download className="w-4 h-4" />
          {t.download}
        </Button>
      </div>

      {/* Metadata */}
      <div className="p-4 space-y-4">
        {/* Dimensions and format */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {content.width} x {content.height}
          </Badge>
          {content.aspect_ratio && <Badge variant="outline">{content.aspect_ratio}</Badge>}
          {content.format && <Badge variant="outline">{content.format.toUpperCase()}</Badge>}
          {content.file_size_bytes && (
            <Badge variant="outline">{formatFileSize(content.file_size_bytes)}</Badge>
          )}
        </div>

        {/* Generation prompt */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
            <FileText className="w-4 h-4" />
            {t.generationPrompt}
          </div>
          <p className="text-sm bg-slate-50 dark:bg-slate-900 rounded-lg p-3 whitespace-pre-wrap">
            {content.generation_prompt}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state view - no content available
 */
interface EmptyViewProps {
  t: Translations;
  className?: string;
}

function EmptyView({ t, className }: EmptyViewProps) {
  return (
    <div className={cn('flex items-center justify-center h-full p-8', className)}>
      <div className="text-center text-muted-foreground">
        <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>{t.coverNotGenerated}</p>
      </div>
    </div>
  );
}

/**
 * Loading state for draft generation
 */
interface LoadingViewProps {
  t: Translations;
  className?: string;
}

function LoadingView({ t, className }: LoadingViewProps) {
  return (
    <div className={cn('flex items-center justify-center h-full p-8', className)}>
      <div className="text-center text-muted-foreground">
        <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin opacity-50" />
        <p>{t.generatingDraft}</p>
      </div>
    </div>
  );
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
  className,
}: CoverPreviewProps) {
  const locale = useLocale() as 'ru' | 'en';
  const t: Translations = TRANSLATIONS[locale] || TRANSLATIONS.en;

  // Local state for selected variant
  const [selectedVariantLocal, setSelectedVariantLocal] = useState<number | null>(null);

  // Determine which view to render based on status and content
  const isDraftReady = enrichment.status === 'draft_ready';
  const isDraftGenerating = enrichment.status === 'draft_generating';
  const isCompleted = enrichment.status === 'completed';

  // Parse draft content from draft_content or content field
  const draftContent = useMemo(() => {
    // First try draft_content field
    if (isValidDraftContent(enrichment.draft_content)) {
      return enrichment.draft_content;
    }
    // Fall back to content field (when draft data is stored there)
    if (isDraftReady && isValidDraftContent(enrichment.content)) {
      return enrichment.content as unknown as CoverDraftContent;
    }
    return null;
  }, [enrichment.draft_content, enrichment.content, isDraftReady]);

  // Initialize selected variant from draft content
  const selectedVariant = useMemo(() => {
    if (selectedVariantLocal !== null) return selectedVariantLocal;
    if (draftContent?.selected_variant) return draftContent.selected_variant;
    return null;
  }, [selectedVariantLocal, draftContent?.selected_variant]);

  // Handle variant selection
  const handleSelectVariant = (variantId: number) => {
    setSelectedVariantLocal(variantId);
    onSelectVariant?.(variantId);
  };

  // Handle draft approval
  const handleApprove = () => {
    if (selectedVariant !== null) {
      onApproveDraft?.();
    }
  };

  // Render loading state during draft generation
  if (isDraftGenerating) {
    return <LoadingView t={t} className={className} />;
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
    );
  }

  // Render completed cover
  if (isCompleted && enrichment.content) {
    return <CompletedView content={enrichment.content} t={t} className={className} />;
  }

  // Render empty state
  return <EmptyView t={t} className={className} />;
}

export default CoverPreview;
