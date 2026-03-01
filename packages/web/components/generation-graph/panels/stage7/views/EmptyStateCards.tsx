'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ENRICHMENT_TYPE_CONFIG } from '@/lib/generation-graph/enrichment-config'
import type { CreateableEnrichmentType } from '../forms/enrichment-form-config'
import type { CreateEnrichmentType } from '../../../stores/enrichment-inspector-store'

export interface EmptyStateCardsProps {
  onSelectType: (type: CreateEnrichmentType) => void
  className?: string
}

/**
 * Primary enrichment types shown in EmptyStateCards discovery grid.
 * Ordered by typical instructional flow.
 */
const CARD_TYPES: CreateableEnrichmentType[] = [
  'quiz',
  'presentation',
  'nlm_audio',
  'nlm_study_guide',
  'nlm_flashcards',
  'cover',
]

/**
 * Individual enrichment type card for the empty state discovery view
 */
function EnrichmentCard({
  type,
  onSelect,
}: {
  type: CreateableEnrichmentType
  onSelect: () => void
}) {
  const t = useTranslations('enrichments')
  const config = ENRICHMENT_TYPE_CONFIG[type]
  const title = t(`types.${type}` as Parameters<typeof t>[0])
  const description = t(`typeDescriptions.${type}` as Parameters<typeof t>[0])

  return (
    <Card
      className={cn(
        'group relative cursor-pointer overflow-hidden transition-all duration-200',
        'hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-md'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'rounded-lg p-2',
              config.bgClass,
              'transition-opacity group-hover:opacity-80'
            )}
          >
            {React.createElement(config.icon, {
              className: cn('h-6 w-6', config.colorClass),
            })}
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription className="mt-2 text-xs">{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

/**
 * Empty state discovery cards for lessons without enrichments
 *
 * Shows a grid of enrichment type cards that users can click
 * to start creating their first enrichment.
 * Uses config-driven icons, colors, and i18n labels/descriptions.
 *
 * @example
 * ```tsx
 * <EmptyStateCards
 *   onSelectType={(type) => openCreate(type)}
 * />
 * ```
 */
export function EmptyStateCards({ onSelectType, className }: EmptyStateCardsProps) {
  const t = useTranslations('enrichments')

  return (
    <div className={cn('space-y-6 p-4', className)}>
      <div className="space-y-2 text-center">
        <h3 className="text-lg font-semibold">{t('inspector.empty')}</h3>
        <p className="text-muted-foreground text-sm">{t('inspector.emptyDescription')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {CARD_TYPES.map((type) => (
          <EnrichmentCard
            key={type}
            type={type}
            onSelect={() => onSelectType(type as CreateEnrichmentType)}
          />
        ))}
      </div>
    </div>
  )
}
