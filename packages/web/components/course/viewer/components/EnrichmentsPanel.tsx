'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { FileText, AlertTriangle } from 'lucide-react'
import { EnrichmentErrorBoundary } from '../enrichments/EnrichmentErrorBoundary'
import { UnifiedEnrichmentCard } from './UnifiedEnrichmentCard'
import { EnrichmentGeneratingCard } from './EnrichmentGeneratingCard'
import { useEnrichmentGeneration } from '@/lib/hooks/useEnrichmentGeneration'
import type { Database } from '@/types/database.generated'
import { EnrichmentCard } from './EnrichmentCard'
import {
  ALL_PLACEHOLDER_TYPES,
  IMAGE_PLACEHOLDER_TYPES,
  type EnrichmentType,
} from './enrichment-config'
import {
  isOnDemandType,
  isActiveGenerationStatus,
  type OnDemandEnrichmentType,
} from '@megacampus/shared-types'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

/**
 * Type guard for enrichments with on-demand type
 * Fixes HIGH #3: unsafe type assertion
 */
function isEnrichmentOnDemand(
  enrichment: EnrichmentRow
): enrichment is EnrichmentRow & { enrichment_type: OnDemandEnrichmentType } {
  return isOnDemandType(enrichment.enrichment_type)
}

interface EnrichmentsPanelProps {
  enrichments: EnrichmentRow[]
  /** Error message if enrichments failed to load */
  enrichmentsLoadError?: string
  /** Whether enrichments are being loaded/refetched */
  isLoading?: boolean
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
  isLoading: _isLoading,
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
  const {
    startGeneration,
    cancelGeneration,
    isGenerating,
    getProgress,
    resumeGeneration,
    isRecentlyCompleted,
    clearRecentlyCompleted,
  } = useEnrichmentGeneration({
    lessonId: lessonId || '',
    courseId: courseId || '',
    onComplete: handleGenerationComplete,
    onError: handleGenerationError,
  })

  // Track resumed enrichment TYPES (not IDs) to prevent duplicate resumes
  // Fixes race condition: when enrichment ID changes but type is same, prevent double resume
  // Only ONE enrichment per type is supported at a time
  const resumedTypesRef = useRef(new Set<string>())

  // Track if we just switched lessons to avoid acting on stale cached data
  const isInitialLoadRef = useRef(true)
  const lessonSwitchTimeRef = useRef<number>(0)

  // Reset state when lessonId changes (user navigates to different lesson)
  useEffect(() => {
    resumedTypesRef.current.clear()
    isInitialLoadRef.current = true
    lessonSwitchTimeRef.current = Date.now()
  }, [lessonId])

  // Resume polling for active enrichments on mount and when new active enrichments appear
  useEffect(() => {
    // Skip if this is the initial render after lesson switch
    // Wait for fresh data to arrive (avoid acting on stale cache)
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false
      // If data arrived very quickly after lesson switch, it might be stale cache
      // Wait a bit before trusting it
      const timeSinceSwitch = Date.now() - lessonSwitchTimeRef.current
      if (timeSinceSwitch < 100) {
        return // Skip this render, wait for fresh data
      }
    }

    // Find enrichments that need resuming (active + on-demand + type not yet resumed)
    const activeEnrichments = enrichments
      .filter((e) => isActiveGenerationStatus(e.status))
      .filter(isEnrichmentOnDemand)
      .filter((e) => !resumedTypesRef.current.has(e.enrichment_type))

    // Resume polling for each new active enrichment
    if (activeEnrichments.length > 0) {
      toast.info(t('viewer.resumingGeneration', { count: activeEnrichments.length }))
    }
    activeEnrichments.forEach((enrichment) => {
      resumeGeneration(enrichment.id, enrichment.enrichment_type)
      resumedTypesRef.current.add(enrichment.enrichment_type)
    })

    // Cleanup: remove types for enrichments that are no longer active
    const currentActiveTypes = new Set<string>(
      enrichments.filter((e) => isActiveGenerationStatus(e.status)).map((e) => e.enrichment_type)
    )
    resumedTypesRef.current.forEach((type) => {
      if (!currentActiveTypes.has(type)) {
        resumedTypesRef.current.delete(type)
      }
    })
  }, [enrichments, resumeGeneration, t])

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

  // Show empty state only if no enrichments AND no ability to generate (no lessonId)
  // If lessonId exists, we show placeholder cards for generation even if no enrichments
  if ((!filteredEnrichments || filteredEnrichments.length === 0) && !lessonId) {
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

      {/* All Enrichment Cards - Unified Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ALL_PLACEHOLDER_TYPES.filter((type) => {
          // For image types, always show (they have existingEnrichment logic)
          if (IMAGE_PLACEHOLDER_TYPES.includes(type as 'cover' | 'card')) {
            return true
          }
          // For other types, only show if no existing enrichment
          return !groupedEnrichments[type]
        }).map((type) => {
          const typeIsGenerating = isGenerating(type)
          const generatingProgress = getProgress(type)
          const isImageType = IMAGE_PLACEHOLDER_TYPES.includes(type as 'cover' | 'card')

          // Find existing enrichment for:
          // - Image types: always (they have existingEnrichment logic for regeneration)
          // - Non-image types with draft_ready status: to show draft preview
          // For 'card' type: exclude course-card (title='course-card') - only show lesson cards
          const existingEnrichment = isImageType
            ? enrichments.find(
                (e) => e.enrichment_type === type && (type !== 'card' || e.title !== 'course-card')
              ) || null
            : enrichments.find((e) => e.enrichment_type === type && e.status === 'draft_ready') ||
              null

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

          return (
            <UnifiedEnrichmentCard
              key={type}
              type={type}
              existingEnrichment={existingEnrichment}
              onGenerate={(settings) => {
                if (!lessonId) {
                  toast.error(t('viewer.noMaterials'))
                  return
                }
                // Video generation not available yet
                if (type === 'video') {
                  return
                }
                void startGeneration(type, settings)
              }}
              disabled={type === 'video' || !lessonId}
              isGenerating={typeIsGenerating}
              isRecentlyCompleted={isRecentlyCompleted(type)}
              onImageLoaded={() => clearRecentlyCompleted(type)}
            />
          )
        })}
      </div>
    </div>
  )
}
