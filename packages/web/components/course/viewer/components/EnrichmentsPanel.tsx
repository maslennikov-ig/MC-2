'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { toast } from 'sonner'
import { FileText, AlertTriangle } from 'lucide-react'
import { EnrichmentErrorBoundary } from '../enrichments/EnrichmentErrorBoundary'
import { UnifiedEnrichmentCard } from './UnifiedEnrichmentCard'
import { EnrichmentGeneratingCard } from './EnrichmentGeneratingCard'
import { useEnrichmentGeneration, getMaxDurationForType } from '@/lib/hooks/useEnrichmentGeneration'
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
type NlmEnrichmentType =
  | 'nlm_audio'
  | 'nlm_video'
  | 'nlm_study_guide'
  | 'nlm_flashcards'
  | 'nlm_mind_map'
  | 'nlm_infographic'
type ViewerOnDemandType = OnDemandEnrichmentType | NlmEnrichmentType

const NLM_ENRICHMENT_TYPES = new Set<NlmEnrichmentType>([
  'nlm_audio',
  'nlm_video',
  'nlm_study_guide',
  'nlm_flashcards',
  'nlm_mind_map',
  'nlm_infographic',
])
const LEGACY_NLM_DRAFT_STATUSES = new Set(['draft_ready', 'draft_generating'])

function isNlmType(type: string): type is NlmEnrichmentType {
  return NLM_ENRICHMENT_TYPES.has(type as NlmEnrichmentType)
}

function isLegacyNlmDraftStatus(status: string): boolean {
  return LEGACY_NLM_DRAFT_STATUSES.has(status)
}

function isViewerOnDemandType(type: string): type is ViewerOnDemandType {
  return isOnDemandType(type) || isNlmType(type)
}

function parseDateToMs(value: string | null | undefined): number | undefined {
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

function parseMetadataStartedAtMs(metadata: unknown): number | undefined {
  const metadataRecord = asRecord(metadata)
  if (!metadataRecord) return undefined

  const additionalInfo = asRecord(metadataRecord.additional_info)
  const notebookLmAsyncState = asRecord(additionalInfo?.notebooklm_async_state)
  const nestedStartedAt = notebookLmAsyncState?.started_at
  const topLevelStartedAt = metadataRecord.started_at
  const startedAt = nestedStartedAt ?? topLevelStartedAt
  if (typeof startedAt === 'number' && Number.isFinite(startedAt) && startedAt > 0) {
    return startedAt
  }

  if (typeof startedAt === 'string') {
    return parseDateToMs(startedAt)
  }

  return undefined
}

function getStartedAtMsForResume(
  enrichment: EnrichmentRow & { enrichment_type: ViewerOnDemandType }
): number | undefined {
  if (isNlmType(enrichment.enrichment_type)) {
    return parseMetadataStartedAtMs(enrichment.metadata)
  }

  return parseDateToMs(enrichment.created_at)
}

/**
 * Type guard for enrichments with on-demand type
 * Fixes HIGH #3: unsafe type assertion
 */
function isEnrichmentOnDemand(
  enrichment: EnrichmentRow
): enrichment is EnrichmentRow & { enrichment_type: ViewerOnDemandType } {
  return isViewerOnDemandType(enrichment.enrichment_type)
}

interface EnrichmentsPanelProps {
  enrichments?: EnrichmentRow[]
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
  isLoading,
  lessonId,
  courseId,
  onRefreshEnrichments,
}: EnrichmentsPanelProps) {
  const t = useTranslations('enrichments')
  const locale = useLocale()
  const safeEnrichments = enrichments ?? []
  const [activeEnrichmentId, setActiveEnrichmentId] = useState<string | null>(null)
  const completedToastsRef = useRef<Set<string>>(new Set())
  const toastTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Cleanup toast dedup timers on unmount
  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => clearTimeout(timer))
      toastTimersRef.current.clear()
    }
  }, [])

  // Handle generation completion
  const handleGenerationComplete = useCallback(
    (enrichmentId: string) => {
      if (!completedToastsRef.current.has(enrichmentId)) {
        toast.success(t('viewer.generationComplete'))
        completedToastsRef.current.add(enrichmentId)
        const timer = setTimeout(() => {
          completedToastsRef.current.delete(enrichmentId)
          toastTimersRef.current.delete(enrichmentId)
        }, 5000)
        toastTimersRef.current.set(enrichmentId, timer)
      }
      // Small delay to allow DB write propagation before refetch
      setTimeout(() => onRefreshEnrichments?.(), 500)
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

  // Track resumed enrichment keys (lessonId:type) to prevent duplicate resumes
  const resumedKeysRef = useRef(new Set<string>())

  // Resume polling for active enrichments on mount and when new active enrichments appear
  useEffect(() => {
    if (!lessonId) return

    // Find enrichments that need resuming (active + on-demand + lesson/type not yet resumed)
    const activeEnrichments = (enrichments ?? [])
      .filter((e) => isActiveGenerationStatus(e.status))
      .filter(isEnrichmentOnDemand)
      .filter((e) => !resumedKeysRef.current.has(`${lessonId}:${e.enrichment_type}`))

    // Resume polling for each new active enrichment
    activeEnrichments.forEach((enrichment) => {
      const startedAtMs = getStartedAtMsForResume(enrichment)
      resumeGeneration(enrichment.id, enrichment.enrichment_type, startedAtMs)
      resumedKeysRef.current.add(`${lessonId}:${enrichment.enrichment_type}`)
    })

    // Cleanup: remove stale keys
    // 1. Remove keys for other lessons (they are no longer visible)
    // 2. Remove keys for current lesson's enrichments that are no longer active
    const currentActiveKeys = new Set<string>(
      (enrichments ?? [])
        .filter((e) => isActiveGenerationStatus(e.status))
        .map((e) => `${lessonId}:${e.enrichment_type}`)
    )

    resumedKeysRef.current.forEach((key) => {
      // Remove keys for other lessons entirely
      if (!key.startsWith(`${lessonId}:`)) {
        resumedKeysRef.current.delete(key)
        return
      }
      // Remove keys for current lesson enrichments that are no longer active
      if (!currentActiveKeys.has(key)) {
        resumedKeysRef.current.delete(key)
      }
    })
  }, [enrichments, lessonId, resumeGeneration])

  // Auto-clear recentlyCompleted for types that now have completed enrichment data
  // This ensures non-image types (audio, quiz, etc.) don't stay in skeleton state
  useEffect(() => {
    ALL_PLACEHOLDER_TYPES.forEach((type) => {
      if (
        isRecentlyCompleted(type) &&
        safeEnrichments.some((e) => e.enrichment_type === type && e.status === 'completed')
      ) {
        clearRecentlyCompleted(type)
      }
    })
  }, [enrichments, isRecentlyCompleted, clearRecentlyCompleted])

  // Filter out cover type - it's displayed as hero banner in lesson content
  const filteredEnrichments = safeEnrichments.filter(
    (e) => (e.enrichment_type as string) !== 'cover'
  )

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

  // Show skeleton on initial load only; during refetch stale data is shown instead
  if (isLoading && !enrichments) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="min-h-[480px] animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-slate-800 dark:bg-slate-800"
            />
          ))}
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

  // Completed enrichments for grid display (exclude cover/card — handled by UnifiedEnrichmentCard)
  const completedTypeOrder: Record<string, number> = {
    video: 0,
    nlm_video: 1,
    audio: 2,
    nlm_audio: 3,
    presentation: 4,
    quiz: 5,
    nlm_study_guide: 6,
    nlm_flashcards: 7,
    nlm_mind_map: 8,
    nlm_infographic: 9,
    document: 10,
  }

  // Statuses that indicate the enrichment is "done" (successfully or not)
  const GRID_DISPLAY_STATUSES = new Set(['completed', 'failed', 'cancelled'])

  const completedEnrichments = filteredEnrichments
    .filter((e) => {
      // Only show enrichments with terminal statuses
      if (!GRID_DISPLAY_STATUSES.has(e.status)) return false
      // Exclude image types (handled by UnifiedEnrichmentCard)
      if (e.enrichment_type === 'cover' || e.enrichment_type === 'card') return false
      // Hide nlm_study_guide from UI (temporarily disabled)
      if ((e.enrichment_type as string) === 'nlm_study_guide') return false
      // Hide regular audio/video/presentation/quiz (temporarily, NLM variants remain)
      if (['audio', 'video', 'presentation', 'quiz'].includes(e.enrichment_type)) return false
      // Exclude legacy NLM draft statuses
      if (isNlmType(e.enrichment_type) && isLegacyNlmDraftStatus(e.status)) return false
      return true
    })
    .sort((a, b) => {
      const orderA = completedTypeOrder[a.enrichment_type] ?? 99
      const orderB = completedTypeOrder[b.enrichment_type] ?? 99
      return orderA - orderB
    })

  return (
    <div className="space-y-6">
      {/* Unified Grid — completed enrichments first, then placeholders */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Completed enrichments */}
        {completedEnrichments.map((enrichment) => (
          <EnrichmentErrorBoundary
            key={enrichment.id}
            enrichmentType={t(`viewer.enrichmentTypes.${enrichment.enrichment_type}`)}
            enrichmentId={enrichment.id}
            locale={locale}
          >
            <EnrichmentCard
              enrichment={enrichment}
              isActive={activeEnrichmentId === enrichment.id}
              onToggle={() =>
                setActiveEnrichmentId(activeEnrichmentId === enrichment.id ? null : enrichment.id)
              }
              courseId={courseId}
              onRefreshEnrichments={onRefreshEnrichments}
            />
          </EnrichmentErrorBoundary>
        ))}

        {/* Placeholder / generating cards */}
        {ALL_PLACEHOLDER_TYPES.filter((type) => {
          // For image types, always show (they have existingEnrichment logic)
          if (IMAGE_PLACEHOLDER_TYPES.includes(type as 'cover' | 'card')) {
            return true
          }
          // For other types, show when there is no enrichment for this type
          if (!groupedEnrichments[type]) {
            return true
          }

          // Show placeholder/generating card for enrichments with active generation status
          // (pending, draft_generating, draft_ready, generating) — enables resume after page navigation
          if (groupedEnrichments[type].some((e) => isActiveGenerationStatus(e.status))) {
            return true
          }

          // Legacy compatibility:
          // Old NLM two-stage rows could remain in draft statuses.
          // Show placeholder so user can start a new single-stage run
          // (backend will reuse/reset the legacy row).
          if (isNlmType(type)) {
            return groupedEnrichments[type].every((enrichment) =>
              isLegacyNlmDraftStatus(enrichment.status)
            )
          }

          return false
        }).map((type) => {
          const typeIsGenerating = isGenerating(type)
          const generatingProgress = getProgress(type)
          const isImageType = IMAGE_PLACEHOLDER_TYPES.includes(type as 'cover' | 'card')

          // For image types: pass existing enrichment to support preview/regeneration.
          // For 'card' type: exclude course-card (title='course-card') - only show lesson cards.
          const existingEnrichment = isImageType
            ? safeEnrichments.find(
                (e) => e.enrichment_type === type && (type !== 'card' || e.title !== 'course-card')
              ) || null
            : null

          // Show generating card if generation is in progress (hook is tracking it)
          if (typeIsGenerating && generatingProgress) {
            return (
              <EnrichmentGeneratingCard
                key={type}
                type={type}
                progress={generatingProgress.progress}
                currentStep={generatingProgress.currentStep || t('generating')}
                startedAtMs={generatingProgress.startedAtMs}
                maxDurationMs={generatingProgress.maxDurationMs}
                onCancel={() => void cancelGeneration(type)}
              />
            )
          }

          // Show syncing card for enrichments with active DB status even before hook resumes polling.
          // This provides immediate visual feedback on page load while resume effect kicks in.
          const activeEnrichmentForType = groupedEnrichments[type]?.find((e) =>
            isActiveGenerationStatus(e.status)
          )
          const activeOnDemandEnrichmentForType =
            activeEnrichmentForType && isEnrichmentOnDemand(activeEnrichmentForType)
              ? activeEnrichmentForType
              : undefined
          if (
            activeOnDemandEnrichmentForType &&
            !(isNlmType(type) && isLegacyNlmDraftStatus(activeOnDemandEnrichmentForType.status))
          ) {
            return (
              <EnrichmentGeneratingCard
                key={type}
                type={type}
                progress={-1}
                currentStep="syncing"
                startedAtMs={getStartedAtMsForResume(activeOnDemandEnrichmentForType)}
                maxDurationMs={
                  NLM_ENRICHMENT_TYPES.has(type as NlmEnrichmentType)
                    ? getMaxDurationForType(type as OnDemandEnrichmentType)
                    : undefined
                }
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
                void startGeneration(type, settings).then((enrichmentId) => {
                  if (enrichmentId) onRefreshEnrichments?.()
                })
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
