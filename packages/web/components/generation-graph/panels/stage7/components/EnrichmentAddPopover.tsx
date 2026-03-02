'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ENRICHMENT_TYPE_CONFIG } from '@/lib/generation-graph/enrichment-config'
import { CREATEABLE_TYPES, type CreateableEnrichmentType } from '../forms/enrichment-form-config'
import type { CreateEnrichmentType } from '../../../stores/enrichment-inspector-store'

export interface EnrichmentAddPopoverProps {
  onSelect: (type: CreateEnrichmentType) => void
  disabledTypes?: CreateEnrichmentType[]
  className?: string
}

/**
 * Popover for adding new enrichments to a lesson
 *
 * Shows all user-createable enrichment types with icons from ENRICHMENT_TYPE_CONFIG.
 * Types and labels are fully driven by config — no hardcoded strings.
 *
 * @example
 * ```tsx
 * <EnrichmentAddPopover
 *   onSelect={(type) => openCreate(type)}
 *   disabledTypes={['quiz']} // Already has a quiz
 * />
 * ```
 */
export function EnrichmentAddPopover({
  onSelect,
  disabledTypes = [],
  className,
}: EnrichmentAddPopoverProps) {
  const t = useTranslations('enrichments')
  const [open, setOpen] = React.useState(false)

  const handleSelect = (type: CreateEnrichmentType) => {
    onSelect(type)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Plus className="mr-2 h-4 w-4" />
          {t('actions.add')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="space-y-1">
          {CREATEABLE_TYPES.map((type: CreateableEnrichmentType) => {
            const config = ENRICHMENT_TYPE_CONFIG[type]
            if (!config) return null
            const isDisabled = disabledTypes.includes(type as CreateEnrichmentType)
            const label = t(`types.${type}` as Parameters<typeof t>[0])

            return (
              <button
                key={type}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md p-2 text-left',
                  'hover:bg-accent transition-colors',
                  isDisabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                )}
                onClick={() => !isDisabled && handleSelect(type as CreateEnrichmentType)}
                disabled={isDisabled}
              >
                <div className={cn('rounded p-1.5', config.bgClass)}>
                  {React.createElement(config.icon, {
                    className: cn('h-4 w-4', config.colorClass),
                  })}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{label}</div>
                </div>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Floating add button for mobile/bottom sheet use
 */
export function EnrichmentAddButton({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  const t = useTranslations('enrichments')

  return (
    <Button onClick={onClick} className={cn('w-full', className)}>
      <Plus className="mr-2 h-4 w-4" />
      {t('assetDock.addEnrichment')}
    </Button>
  )
}
