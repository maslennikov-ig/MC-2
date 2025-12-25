'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  STAGE6_NODE_LABELS,
  Stage6NodeName,
  Stage6NodeStatus,
  MicroStepperState,
} from '@megacampus/shared-types';

interface SegmentedPillTrackProps {
  /** Pipeline state from MicroStepperState */
  pipelineState: MicroStepperState;
  /** SelfReview outcome for visual distinction */
  selfReviewOutcome?: 'PASS' | 'FIXED' | 'FLAG_TO_JUDGE' | 'REGENERATE';
  /** Locale for translations */
  locale?: 'ru' | 'en';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Pipeline order for new 3-node pipeline: generator -> selfReviewer -> judge
 */
const PIPELINE_ORDER: Stage6NodeName[] = [
  'generator',
  'selfReviewer',
  'judge',
];

const pulseVariants = {
  running: {
    opacity: [1, 0.6, 1],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const },
  },
  default: {
    opacity: 1,
  },
};

const getSegmentColor = (
  status: Stage6NodeStatus,
  nodeId: Stage6NodeName,
  selfReviewOutcome?: 'PASS' | 'FIXED' | 'FLAG_TO_JUDGE' | 'REGENERATE'
): string => {
  // Special case: SelfReviewer with FIXED outcome gets purple
  if (nodeId === 'selfReviewer' && selfReviewOutcome === 'FIXED') {
    return 'bg-purple-500';
  }

  switch (status) {
    case 'pending':
      return 'bg-slate-300 dark:bg-slate-600';
    case 'active':
      return 'bg-cyan-500';
    case 'completed':
      return 'bg-blue-500';
    case 'error':
      return 'bg-red-500';
    case 'loop':
      return 'bg-orange-500';
    default:
      return 'bg-slate-300 dark:bg-slate-600';
  }
};

const getStatusLabel = (
  status: Stage6NodeStatus,
  nodeId: Stage6NodeName,
  selfReviewOutcome?: 'PASS' | 'FIXED' | 'FLAG_TO_JUDGE' | 'REGENERATE',
  locale: 'ru' | 'en' = 'en'
): string => {
  const statusLabels: Record<Stage6NodeStatus, string> = {
    pending: locale === 'ru' ? 'Ожидание' : 'Pending',
    active: locale === 'ru' ? 'Выполняется' : 'Running',
    completed: locale === 'ru' ? 'Завершено' : 'Completed',
    error: locale === 'ru' ? 'Ошибка' : 'Failed',
    loop: locale === 'ru' ? 'Доработка' : 'Refining',
  };

  // Special label for FIXED outcome
  if (nodeId === 'selfReviewer' && selfReviewOutcome === 'FIXED') {
    return locale === 'ru' ? 'Исправлено' : 'Fixed';
  }

  return statusLabels[status];
};

export const SegmentedPillTrack = memo<SegmentedPillTrackProps>(
  ({ pipelineState, selfReviewOutcome, locale = 'en', className }) => {
    // Create a map for quick lookup
    const nodeMap = new Map(
      pipelineState.nodes.map((nodeState) => [nodeState.node, nodeState.status])
    );

    // Build ordered segments
    const segments = PIPELINE_ORDER.map((nodeId, index) => {
      const status: Stage6NodeStatus = nodeMap.get(nodeId) || 'pending';
      const color = getSegmentColor(status, nodeId, selfReviewOutcome);
      // STAGE6_NODE_LABELS has { ru, description } - use ru for Russian, nodeId for English (fallback)
      const nodeLabel = locale === 'ru'
        ? (STAGE6_NODE_LABELS[nodeId]?.ru || nodeId)
        : nodeId;
      const statusLabel = getStatusLabel(status, nodeId, selfReviewOutcome, locale);
      const stepNumber = index + 1;
      const totalSteps = PIPELINE_ORDER.length;

      const tooltipText = `${locale === 'ru' ? 'Шаг' : 'Step'} ${stepNumber}/${totalSteps}: ${nodeLabel} (${statusLabel})`;

      return {
        nodeId,
        status,
        color,
        tooltipText,
      };
    });

    return (
      <TooltipProvider delayDuration={200}>
        <div className={cn('flex gap-[1px] w-full', className)}>
          {segments.map((segment, index) => {
            const isActive = segment.status === 'active' || segment.status === 'loop';
            const isError = segment.status === 'error';
            const isCompleted = segment.status === 'completed';
            const isFixed =
              segment.nodeId === 'selfReviewer' && selfReviewOutcome === 'FIXED';

            return (
              <Tooltip key={segment.nodeId}>
                <TooltipTrigger asChild>
                  <motion.div
                    role="status"
                    aria-label={segment.tooltipText}
                    aria-live={isActive ? 'polite' : 'off'}
                    tabIndex={0}
                    className={cn(
                      'h-2 flex-1 rounded-sm transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1',
                      index === 0 && 'rounded-l',
                      index === segments.length - 1 && 'rounded-r',
                      segment.color,
                      isError && 'ring-1 ring-red-500',
                      (isCompleted || isFixed) && 'shadow-sm'
                    )}
                    variants={pulseVariants}
                    animate={isActive ? 'running' : 'default'}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {segment.tooltipText}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    );
  }
);

SegmentedPillTrack.displayName = 'SegmentedPillTrack';
