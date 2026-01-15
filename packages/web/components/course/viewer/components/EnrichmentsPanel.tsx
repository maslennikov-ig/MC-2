'use client'

import React, { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { FileText, AlertTriangle } from 'lucide-react'
import { EnrichmentErrorBoundary } from '../enrichments/EnrichmentErrorBoundary'
import { EnrichmentPlaceholderCard } from './EnrichmentPlaceholderCard'
import { EnrichmentGeneratingCard } from './EnrichmentGeneratingCard'
import { useEnrichmentGeneration } from '@/lib/hooks/useEnrichmentGeneration'
import type { Database } from '@/types/database.generated'
import { EnrichmentCard } from './EnrichmentCard'
import { PLACEHOLDER_TYPES, type EnrichmentType } from './enrichment-config'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

interface EnrichmentsPanelProps {
  enrichments: EnrichmentRow[]
  /** Error message if enrichments failed to load */
  enrichmentsLoadError?: string
  /** Lesson UUID for generating new enrichments */
  lessonId?: string
  /** Course UUID for generating new enrichments */
  courseId?: string
  /** Callback when enrichments should be refreshed (after generation completes) */
  onRefreshEnrichments?: () => void
}

export function EnrichmentsPanel({
  enrichments,
  enrichmentsLoadError,
  lessonId,
  courseId,
  onRefreshEnrichments,
}: EnrichmentsPanelProps) {
  const t = useTranslations('enrichments')
  const [activeEnrichmentId, setActiveEnrichmentId] = useState<string | null>(null)

  // Handle generation completion
  const handleGenerationComplete = useCallback(
    (_enrichmentId: string) => {
      toast.success(t('viewer.generationComplete'))
      onRefreshEnrichments?.()
    },
    [t, onRefreshEnrichments]
  )

  // Handle generation error
  const handleGenerationError = useCallback(
    (error: string) => {
      toast.error(`${t('viewer.generationFailed')}: ${error}`)
    },
    [t]
  )

  // Use enrichment generation hook (only if lessonId and courseId are available)
  const { startGeneration, cancelGeneration, isGenerating, getProgress } = useEnrichmentGeneration({
    lessonId: lessonId || '',
    courseId: courseId || '',
    onComplete: handleGenerationComplete,
    onError: handleGenerationError,
  })

  // Filter out cover type - it's displayed as hero banner in lesson content
  const filteredEnrichments = enrichments.filter((e) => (e.enrichment_type as string) !== 'cover')

  // Show error banner if there was a load error
  if (enrichmentsLoadError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800/30 dark:bg-orange-900/20">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-orange-500" />
          <p className="text-sm text-orange-800 dark:text-orange-200">{t('viewer.loadError')}</p>
        </div>
      </div>
    )
  }

  if (!filteredEnrichments || filteredEnrichments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
        <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400">
          {t('viewer.noMaterials')}
        </h3>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
          {t('viewer.noMaterialsDescription')}
        </p>
      </div>
    )
  }

  // Group enrichments by type
  const groupedEnrichments = filteredEnrichments.reduce(
    (acc, e) => {
      const type = e.enrichment_type as EnrichmentType
      if (!acc[type]) acc[type] = []
      acc[type].push(e)
      return acc
    },
    {} as Record<EnrichmentType, EnrichmentRow[]>
  )

  return (
    <div className="space-y-6">
      {/* Video Section */}
      {groupedEnrichments.video?.map((enrichment) => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.video')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() =>
              setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
            }
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Audio Section */}
      {groupedEnrichments.audio?.map((enrichment) => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.audio')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() =>
              setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
            }
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Presentation Section */}
      {groupedEnrichments.presentation?.map((enrichment) => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.presentation')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() =>
              setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
            }
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Quiz Section */}
      {groupedEnrichments.quiz?.map((enrichment) => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.quiz')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() =>
              setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
            }
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Document Section */}
      {groupedEnrichments.document?.map((enrichment) => (
        <EnrichmentErrorBoundary
          key={enrichment.id}
          enrichmentType={t('viewer.enrichmentTypes.document')}
          enrichmentId={enrichment.id}
        >
          <EnrichmentCard
            enrichment={enrichment}
            isActive={activeEnrichmentId === enrichment.id}
            onToggle={() =>
              setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
            }
          />
        </EnrichmentErrorBoundary>
      ))}

      {/* Placeholder Cards for Missing Types and Generating Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {PLACEHOLDER_TYPES.filter((type) => !groupedEnrichments[type]).map((type) => {
          // Check if this type is currently generating
          const generatingProgress = getProgress(type)
          const typeIsGenerating = isGenerating(type)

          // Construct translation key dynamically - path exists in enrichments.json
          type PlaceholderKey = `placeholder.${typeof type}.estimatedTime`
          const estimatedTimeKey = `placeholder.${type}.estimatedTime`

          const estimatedTime = t(estimatedTimeKey as Parameters<typeof t>[0])

          // Show generating card if generation is in progress
          if (typeIsGenerating && generatingProgress) {
            return (
              <EnrichmentGeneratingCard
                key={type}
                type={type}
                progress={generatingProgress.progress}
                currentStep={generatingProgress.currentStep || t('generating')}
                onCancel={() => void cancelGeneration(type)}
              />
            )
          }

          // Show placeholder card otherwise
          return (
            <EnrichmentPlaceholderCard
              key={type}
              type={type}
              onGenerate={(settings) => {
                // Only allow generation if lessonId is available
                if (!lessonId) {
                  toast.error(t('viewer.noMaterials'))
                  return
                }
                // Only generate on-demand types (quiz, audio, presentation)
                if (type === 'video') {
                  return
                }
                void startGeneration(type, settings)
              }}
              estimatedTime={estimatedTime}
              disabled={type === 'video' || !lessonId}
              isGenerating={typeIsGenerating}
            />
          )
        })}
      </div>
    </div>
  )
}
