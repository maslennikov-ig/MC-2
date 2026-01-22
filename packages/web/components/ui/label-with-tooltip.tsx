'use client'

import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface LabelWithTooltipProps {
  label: string
  tooltip: string
}

/**
 * A form field label with an info tooltip icon.
 * Used for providing additional context about form fields.
 */
export function LabelWithTooltip({ label, tooltip }: LabelWithTooltipProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3.5 w-3.5 cursor-help text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
