'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface NodeErrorTooltipProps {
  /** Error message to display in tooltip */
  message: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * NodeErrorTooltip Component
 *
 * Error indicator tooltip for graph nodes.
 * Displays AlertCircle icon with error message on hover.
 *
 * Features:
 * - Red-themed error indicator in corner
 * - Tooltip with error message
 * - Dark mode support
 * - Accessible cursor-help indicator
 */
export const NodeErrorTooltip = ({ message, className }: NodeErrorTooltipProps) => {
  return (
    <div className={cn("absolute -top-2 -right-2 z-20", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-1 rounded-full border border-red-200 dark:border-red-700 shadow-sm cursor-help">
              <AlertCircle size={14} aria-hidden="true" />
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[200px] break-words text-xs bg-red-50 dark:bg-red-900/50 text-red-900 dark:text-red-100 border-red-200 dark:border-red-700">
            <p>{message}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
