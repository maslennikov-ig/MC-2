'use client'

import React, { useState, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { motion } from 'framer-motion'
import { ImageIcon, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'

// ============================================================================
// Types
// ============================================================================

/**
 * Draft content structure for cover/banner variants
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

export interface CoverVariantSelectorProps {
  enrichment: {
    id: string
    enrichment_type: 'cover' | 'banner'
    status: string
    content: unknown // draft content with variants
  }
  onApproveDraft: (enrichmentId: string, variantId: number) => void
  isApproving?: boolean
}

// ============================================================================
// Translations
// ============================================================================

const TRANSLATIONS = {
  ru: {
    selectStyle: 'Выберите стиль',
    draftReady: 'Черновик готов',
    variant: 'Вариант',
    generateImage: 'Сгенерировать изображение',
    generating: 'Генерация...',
    selectVariantFirst: 'Выберите вариант',
    coverType: 'Обложка',
    bannerType: 'Баннер',
  },
  en: {
    selectStyle: 'Select Style',
    draftReady: 'Draft Ready',
    variant: 'Variant',
    generateImage: 'Generate Image',
    generating: 'Generating...',
    selectVariantFirst: 'Select a variant',
    coverType: 'Cover',
    bannerType: 'Banner',
  },
}

type Translations = (typeof TRANSLATIONS)['ru']

// ============================================================================
// Helper Functions
// ============================================================================

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
function isValidDraftContent(content: unknown): content is CoverDraftContent {
  if (!content || typeof content !== 'object') return false
  const d = content as CoverDraftContent
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
 * Individual variant selection card (compact version)
 */
function VariantCard({ variant, index, isSelected, onSelect, t }: VariantCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        'group relative cursor-pointer rounded-lg border p-3 transition-all duration-200',
        'hover:shadow-sm',
        isSelected
          ? 'border-purple-500 bg-purple-50/50 ring-2 ring-purple-200 dark:border-purple-400 dark:bg-purple-900/20 dark:ring-purple-800'
          : 'border-gray-200 hover:border-purple-300 dark:border-slate-700 dark:hover:border-purple-600'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {/* Radio indicator */}
        <RadioGroupItem
          value={String(variant.id)}
          id={`variant-${variant.id}`}
          className="mt-1 flex-shrink-0"
        />

        <div className="flex-1 space-y-1">
          {/* Variant label */}
          <label
            htmlFor={`variant-${variant.id}`}
            className="flex cursor-pointer items-center gap-2"
          >
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors',
                isSelected
                  ? 'bg-purple-500 text-white dark:bg-purple-400'
                  : 'bg-gray-200 text-gray-700 group-hover:bg-purple-200 dark:bg-slate-700 dark:text-slate-300 dark:group-hover:bg-purple-800'
              )}
            >
              {getVariantIndicator(index)}
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {t.variant} {index + 1}
            </span>
          </label>

          {/* Localized description (user-facing, NO prompt_en) */}
          <p className="line-clamp-3 text-sm leading-relaxed text-gray-600 dark:text-slate-300">
            {variant.description_localized}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * CoverVariantSelector Component
 *
 * Compact version for Course Viewer - shows 3 draft variants with radio buttons
 * and a "Generate Image" button to approve the selected variant.
 *
 * @example
 * ```tsx
 * <CoverVariantSelector
 *   enrichment={enrichment}
 *   onApproveDraft={(enrichmentId, variantId) => generateImage(enrichmentId, variantId)}
 *   isApproving={isGenerating}
 * />
 * ```
 */
export function CoverVariantSelector({
  enrichment,
  onApproveDraft,
  isApproving = false,
}: CoverVariantSelectorProps) {
  const locale = useLocale()
  const t: Translations = TRANSLATIONS[locale] || TRANSLATIONS.en

  // Local state for selected variant
  const [selectedVariantLocal, setSelectedVariantLocal] = useState<number | null>(null)

  // Parse draft content
  const draftContent = useMemo(() => {
    if (!isValidDraftContent(enrichment.content)) return null
    return enrichment.content
  }, [enrichment.content])

  // Initialize selected variant from draft content
  const selectedVariant = useMemo(() => {
    if (selectedVariantLocal !== null) return selectedVariantLocal
    if (draftContent?.selected_variant) return draftContent.selected_variant
    return null
  }, [selectedVariantLocal, draftContent?.selected_variant])

  // Handle variant selection
  const handleSelectVariant = (variantId: number) => {
    setSelectedVariantLocal(variantId)
  }

  // Handle approve button click
  const handleApprove = () => {
    if (selectedVariant !== null) {
      onApproveDraft(enrichment.id, selectedVariant)
    }
  }

  // If no valid draft content, don't render
  if (!draftContent) {
    return null
  }

  const typeLabel = enrichment.enrichment_type === 'cover' ? t.coverType : t.bannerType

  return (
    <Card className="overflow-hidden border-gray-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <CardHeader className="border-b border-gray-200 bg-gradient-to-r from-purple-50 to-purple-100/50 px-4 py-3 dark:border-slate-800 dark:from-purple-900/20 dark:to-purple-800/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {t.selectStyle} • {typeLabel}
            </h3>
          </div>
          <Badge
            variant="secondary"
            className="border-amber-500 bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
          >
            <Sparkles className="mr-1 h-3 w-3" />
            {t.draftReady}
          </Badge>
        </div>
      </CardHeader>

      {/* Variant selection */}
      <CardContent className="p-4">
        <ScrollArea className="max-h-[400px] pr-2">
          <RadioGroup
            value={selectedVariant !== null ? String(selectedVariant) : ''}
            onValueChange={(value) => handleSelectVariant(Number(value))}
            className="space-y-3"
          >
            {draftContent.variants.map((variant, index) => (
              <VariantCard
                key={variant.id}
                variant={variant}
                index={index}
                isSelected={selectedVariant === variant.id}
                onSelect={() => handleSelectVariant(variant.id)}
                t={t}
              />
            ))}
          </RadioGroup>
        </ScrollArea>

        {/* Generate button */}
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-slate-800">
          {selectedVariant === null && (
            <span className="mr-2 text-sm text-gray-500 dark:text-slate-400">
              {t.selectVariantFirst}
            </span>
          )}
          <Button
            onClick={handleApprove}
            disabled={selectedVariant === null || isApproving}
            className={cn(
              'min-w-[180px] rounded-full bg-gradient-to-r from-purple-600 to-purple-700',
              'font-medium text-white hover:from-purple-700 hover:to-purple-800',
              'transition-all hover:scale-[1.02] disabled:opacity-50'
            )}
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
      </CardContent>
    </Card>
  )
}

export default CoverVariantSelector
