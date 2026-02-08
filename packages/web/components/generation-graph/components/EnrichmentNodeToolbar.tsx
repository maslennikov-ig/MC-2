'use client'

import React from 'react'
import { useLocale } from 'next-intl'
import {
  Video,
  HelpCircle,
  Headphones,
  Presentation,
  FileText,
  Plus,
  ImageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { CreateEnrichmentType } from '../stores/enrichment-inspector-store'
import type { ActivityType } from '@megacampus/shared-types'

export interface EnrichmentNodeToolbarProps {
  onCreateEnrichment: (type: CreateEnrichmentType) => void
  existingTypes?: CreateEnrichmentType[]
  /** Remaining capacity by type (from tier limits) */
  remainingCapacity?: Record<ActivityType, number>
  /** Total remaining capacity */
  totalRemaining?: number
  isCompact?: boolean
  className?: string
}

interface ToolbarButton {
  type: CreateEnrichmentType
  icon: React.ReactNode
  label: { en: string; ru: string }
  disabled?: boolean
  comingSoon?: boolean
}

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  {
    type: 'cover',
    icon: <ImageIcon className="h-4 w-4" />,
    label: { en: 'Add Cover', ru: 'Добавить обложку' },
  },
  {
    type: 'quiz',
    icon: <HelpCircle className="h-4 w-4" />,
    label: { en: 'Add Quiz', ru: 'Добавить тест' },
  },
  {
    type: 'video',
    icon: <Video className="h-4 w-4" />,
    label: { en: 'Add Video', ru: 'Добавить видео' },
  },
  {
    type: 'audio',
    icon: <Headphones className="h-4 w-4" />,
    label: { en: 'Add Audio', ru: 'Добавить аудио' },
  },
  {
    type: 'presentation',
    icon: <Presentation className="h-4 w-4" />,
    label: { en: 'Add Presentation', ru: 'Добавить презентацию' },
  },
  {
    type: 'document',
    icon: <FileText className="h-4 w-4" />,
    label: { en: 'Add Document', ru: 'Добавить документ' },
    disabled: true,
    comingSoon: true,
  },
]

/**
 * Node toolbar for quick enrichment creation via deep-links
 *
 * Appears when a lesson node is selected, providing quick access
 * to create each enrichment type.
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
  existingTypes = [],
  remainingCapacity,
  totalRemaining,
  isCompact = false,
  className,
}: EnrichmentNodeToolbarProps) {
  const locale = useLocale()

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
        {TOOLBAR_BUTTONS.map((btn) => {
          const hasExisting = existingTypes.includes(btn.type)
          const activityType = btn.type as ActivityType
          const typeRemaining = remainingCapacity?.[activityType]
          const typeLimitReached = typeRemaining !== undefined && typeRemaining <= 0
          const isLimitReached = totalLimitReached || typeLimitReached
          const isDisabled = btn.disabled || isLimitReached
          const label = locale === 'ru' ? btn.label.ru : btn.label.en
          const comingSoonLabel = locale === 'ru' ? '(Скоро)' : '(Coming Soon)'
          const limitReachedLabel = locale === 'ru' ? '(лимит)' : '(limit reached)'

          return (
            <Tooltip key={btn.type}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={isCompact ? 'icon' : 'sm'}
                  className={cn(
                    'h-8',
                    hasExisting && !isDisabled && 'opacity-50',
                    isDisabled && 'cursor-not-allowed opacity-30'
                  )}
                  onClick={() => !isDisabled && onCreateEnrichment(btn.type)}
                  disabled={isDisabled}
                >
                  {btn.icon}
                  {!isCompact && <span className="sr-only ml-1 text-xs">{label}</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {label}
                {btn.comingSoon && ` ${comingSoonLabel}`}
                {isLimitReached && ` ${limitReachedLabel}`}
                {hasExisting && !isLimitReached && ` (${locale === 'ru' ? 'есть' : 'exists'})`}
              </TooltipContent>
            </Tooltip>
          )
        })}

        {/* Add more button (opens popover) */}
        <div className="bg-border mx-1 h-6 w-px" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8', totalLimitReached && 'cursor-not-allowed opacity-30')}
              onClick={() => !totalLimitReached && onCreateEnrichment('quiz')} // Default to quiz
              disabled={totalLimitReached}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {locale === 'ru' ? 'Добавить активность' : 'Add Activity'}
            {totalLimitReached && ` (${locale === 'ru' ? 'лимит достигнут' : 'limit reached'})`}
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
  const locale = useLocale()
  const label = locale === 'ru' ? 'Добавить активность' : 'Add activity'

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
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
