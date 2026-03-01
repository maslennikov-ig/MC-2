'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  ENRICHMENT_TYPE_CONFIG,
  type EnrichmentType,
} from '@/lib/generation-graph/enrichment-config'
import type { CreateEnrichmentType } from '../stores/enrichment-inspector-store'
import type { ActivityType } from '@megacampus/shared-types'

export interface EnrichmentNodeToolbarProps {
  onCreateEnrichment: (type: CreateEnrichmentType) => void
  /** Callback for the "+" button to show all enrichment types */
  onShowAllTypes?: () => void
  existingTypes?: CreateEnrichmentType[]
  /** Remaining capacity by type (from tier limits) */
  remainingCapacity?: Record<ActivityType, number>
  /** Total remaining capacity */
  totalRemaining?: number
  isCompact?: boolean
  className?: string
}

/**
 * Top 5 enrichment types shown in the node toolbar for quick access.
 * Typed as EnrichmentType[] so they can be safely keyed into ENRICHMENT_TYPE_CONFIG.
 * Ordered by most commonly used first.
 */
const TOOLBAR_TYPES: EnrichmentType[] = [
  'cover',
  'quiz',
  'presentation',
  'nlm_audio',
  'nlm_study_guide',
]

/**
 * Node toolbar for quick enrichment creation via deep-links
 *
 * Appears when a lesson node is selected, providing quick access
 * to create each enrichment type. Types and icons are driven by
 * ENRICHMENT_TYPE_CONFIG — no hardcoded labels.
 *
 * @example
 * ```tsx
 * <EnrichmentNodeToolbar
 *   onCreateEnrichment={(type) => {
 *     inspectorStore.openCreate(type);
 *   }}
 *   existingTypes={['quiz']} // Quiz button will be dimmed
 * />
 * ```
 */
export function EnrichmentNodeToolbar({
  onCreateEnrichment,
  onShowAllTypes,
  existingTypes = [],
  remainingCapacity,
  totalRemaining,
  isCompact = false,
  className,
}: EnrichmentNodeToolbarProps) {
  const t = useTranslations('enrichments')

  // Check if total limit is reached
  const totalLimitReached = totalRemaining !== undefined && totalRemaining <= 0

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'flex items-center gap-1 rounded-lg border bg-white p-1 shadow-lg dark:bg-slate-900',
          className
        )}
      >
        {TOOLBAR_TYPES.map((type) => {
          const config = ENRICHMENT_TYPE_CONFIG[type]
          if (!config) return null

          const createType = type as CreateEnrichmentType
          const hasExisting = existingTypes.includes(createType)
          const activityType = type as ActivityType
          const typeRemaining = remainingCapacity?.[activityType]
          const typeLimitReached = typeRemaining !== undefined && typeRemaining <= 0
          const isLimitReached = totalLimitReached || typeLimitReached
          const isDisabled = isLimitReached
          const label = t(`types.${type}` as Parameters<typeof t>[0])

          return (
            <Tooltip key={type}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={isCompact ? 'icon' : 'sm'}
                  className={cn(
                    'h-8',
                    hasExisting && !isDisabled && 'opacity-50',
                    isDisabled && 'cursor-not-allowed opacity-30'
                  )}
                  onClick={() => !isDisabled && onCreateEnrichment(createType)}
                  disabled={isDisabled}
                >
                  {React.createElement(config.icon, { className: 'h-4 w-4' })}
                  {!isCompact && <span className="sr-only ml-1 text-xs">{label}</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {label}
                {isLimitReached && ` (${t('inspector.title')})`}
                {hasExisting && !isLimitReached && ` (${t('assetDock.generating')})`}
              </TooltipContent>
            </Tooltip>
          )
        })}

        {/* Separator + open root view button */}
        <div className="bg-border mx-1 h-6 w-px" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8', totalLimitReached && 'cursor-not-allowed opacity-30')}
              onClick={() =>
                !totalLimitReached &&
                (onShowAllTypes ? onShowAllTypes() : onCreateEnrichment('quiz'))
              }
              disabled={totalLimitReached}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t('inspector.addEnrichment')}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

/**
 * Minimal version for inline use in nodes
 */
export function EnrichmentQuickAdd({
  onAdd,
  className,
}: {
  onAdd: () => void
  className?: string
}) {
  const t = useTranslations('enrichments')

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              'rounded p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800',
              className
            )}
            onClick={(e) => {
              e.stopPropagation()
              onAdd()
            }}
          >
            <Plus className="text-muted-foreground h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {t('assetDock.addEnrichment')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
