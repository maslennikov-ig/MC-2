import React, { memo } from 'react'
import { SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react'

interface NodeDetailsDrawerHeaderProps {
  /** Stage number (if available) */
  stageNumber?: number
  /** Node label */
  label?: string
  /** Selected node ID for fallback display */
  selectedNodeId: string | null
  /** Whether drawer is expanded */
  isExpanded: boolean
  /** Whether restart button should be shown */
  canRestart: boolean
  /** Course slug for restart action */
  courseSlug?: string
  /** Translation function from useTranslations('generation') */
  t: (key: string) => string
  /** Toggle expand handler */
  onToggleExpand: () => void
  /** Show restart dialog handler */
  onShowRestartDialog: () => void
}

/**
 * Header section for NodeDetailsDrawer
 *
 * Displays:
 * - Stage title or node label
 * - Restart button (for stages 2-6 with error/completed/awaiting status)
 * - Expand/collapse button
 */
export const NodeDetailsDrawerHeader = memo(function NodeDetailsDrawerHeader({
  stageNumber,
  label,
  selectedNodeId,
  isExpanded,
  canRestart,
  courseSlug,
  t,
  onToggleExpand,
  onShowRestartDialog,
}: NodeDetailsDrawerHeaderProps) {
  const title = stageNumber
    ? t(`stages.stage_${stageNumber}`)
    : label
      ? String(label)
      : `Details: ${selectedNodeId}`

  const description = stageNumber
    ? t(`stageDescriptions.stage_${stageNumber}`)
    : t('stageDescriptions.default')

  return (
    <SheetHeader className="pr-12">
      <div className="flex items-center justify-between">
        <SheetTitle className="flex items-center gap-2" data-testid="drawer-title">
          {title}
        </SheetTitle>
        <div className="flex items-center gap-1">
          {/* Restart Button - only for stages 2-6 with error/completed/awaiting */}
          {canRestart && courseSlug && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onShowRestartDialog}
                    className="h-8 w-8 text-slate-500 hover:bg-orange-50 hover:text-orange-600"
                    data-testid="drawer-restart-button"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('restart.buttonTooltip')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Expand/Collapse button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleExpand}
            className="h-8 w-8 shrink-0"
            title={isExpanded ? t('drawer.collapse') : t('drawer.expand')}
            data-testid="drawer-expand-button"
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <SheetDescription>{description}</SheetDescription>
    </SheetHeader>
  )
})
