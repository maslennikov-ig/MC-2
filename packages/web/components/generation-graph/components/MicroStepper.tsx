'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { RotateCw } from 'lucide-react';
import {
  Stage6NodeStatus,
  MicroStepperState,
  STAGE6_NODE_LABELS,
} from '@megacampus/shared-types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * MicroStepper - Compact 3-dot pipeline status indicator for Stage 6
 *
 * Displays a horizontal row of 3 dots representing the pipeline nodes:
 * generator -> selfReviewer -> judge
 *
 * Each dot shows the current status with color coding and animations:
 * - pending: Gray (not started)
 * - active: Blue with pulse animation (currently processing)
 * - completed: Green (successfully finished)
 * - error: Red (failed)
 * - loop: Orange with rotating icon (in refinement loop)
 *
 * Usage:
 * - Module Dashboard: Shows compact pipeline state in lesson matrix table
 * - Size 'sm' (8px dots) for table cells
 * - Size 'md' (12px dots) for larger displays
 */

interface MicroStepperProps {
  /** Pipeline state with 3 nodes and their statuses */
  state: MicroStepperState;
  /** Dot size variant */
  size?: 'sm' | 'md';
  /** Whether to show tooltips on hover (default: true) */
  showTooltip?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Get color classes for a given status
 */
function getStatusColor(status: Stage6NodeStatus): {
  bg: string;
  border: string;
} {
  switch (status) {
    case 'pending':
      return {
        bg: 'bg-slate-300 dark:bg-slate-600',
        border: 'border-slate-300 dark:border-slate-600',
      };
    case 'active':
      return {
        bg: 'bg-blue-500 dark:bg-blue-500',
        border: 'border-blue-500 dark:border-blue-500',
      };
    case 'completed':
      return {
        bg: 'bg-emerald-500 dark:bg-emerald-500',
        border: 'border-emerald-500 dark:border-emerald-500',
      };
    case 'error':
      return {
        bg: 'bg-red-500 dark:bg-red-500',
        border: 'border-red-500 dark:border-red-500',
      };
    case 'loop':
      return {
        bg: 'bg-orange-500 dark:bg-orange-500',
        border: 'border-orange-500 dark:border-orange-500',
      };
  }
}

/**
 * Get Russian status label
 */
function getStatusLabel(status: Stage6NodeStatus): string {
  switch (status) {
    case 'pending':
      return 'Ожидает';
    case 'active':
      return 'Выполняется';
    case 'completed':
      return 'Завершено';
    case 'error':
      return 'Ошибка';
    case 'loop':
      return 'Доработка';
  }
}

export function MicroStepper({
  state,
  size = 'sm',
  showTooltip = true,
  className,
}: MicroStepperProps) {
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  const iconSize = size === 'sm' ? 10 : 14;

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex items-center gap-1', className)} role="status" aria-label="Статус пайплайна">
        {state.nodes.map((nodeState, index) => {
          const { node, status } = nodeState;
          const colors = getStatusColor(status);
          const label = STAGE6_NODE_LABELS[node];
          const tooltipContent = `${label.ru}: ${getStatusLabel(status)}`;

          const dotElement = (
            <motion.div
              key={`${node}-${index}`}
              className={cn(
                'rounded-full border-2 flex items-center justify-center',
                dotSize,
                colors.bg,
                colors.border,
              )}
              // Pulse animation for 'active' status
              animate={
                status === 'active'
                  ? {
                      scale: [1, 1.2, 1],
                      opacity: [1, 0.7, 1],
                    }
                  : {}
              }
              transition={
                status === 'active'
                  ? {
                      duration: 1.5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }
                  : {}
              }
            >
              {/* Rotating arrow icon for 'loop' status */}
              {status === 'loop' && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                >
                  <RotateCw
                    size={iconSize}
                    className="text-white"
                    strokeWidth={3}
                  />
                </motion.div>
              )}
            </motion.div>
          );

          // Wrap in tooltip if enabled
          if (showTooltip) {
            return (
              <Tooltip key={`${node}-${index}`}>
                <TooltipTrigger asChild>
                  {dotElement}
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{tooltipContent}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    {label.description}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return dotElement;
        })}
      </div>
    </TooltipProvider>
  );
}
