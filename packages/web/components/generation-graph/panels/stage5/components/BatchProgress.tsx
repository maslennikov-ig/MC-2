'use client';

import React, { memo } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Hammer,
  Loader2,
  CheckCircle2,
  AlertOctagon,
} from 'lucide-react';
import type { BatchProgressProps, BatchWorkerStatus } from '../types';

/**
 * Status configuration for worker slots
 */
const statusConfig: Record<
  BatchWorkerStatus['status'],
  {
    icon: React.ElementType;
    iconColorClass: string;
    borderClass: string;
    bgClass: string;
    animate?: boolean;
    glow?: boolean;
  }
> = {
  idle: {
    icon: Hammer,
    iconColorClass: 'text-muted-foreground',
    borderClass: 'border-gray-300 dark:border-gray-700',
    bgClass: 'bg-muted/50',
  },
  working: {
    icon: Loader2,
    iconColorClass: 'text-orange-500',
    borderClass: 'border-orange-500',
    bgClass: 'bg-orange-500/5',
    animate: true,
    glow: true,
  },
  completed: {
    icon: CheckCircle2,
    iconColorClass: 'text-green-500',
    borderClass: 'border-green-500/50',
    bgClass: 'bg-green-500/5',
  },
  failed: {
    icon: AlertOctagon,
    iconColorClass: 'text-red-500',
    borderClass: 'border-red-500/50',
    bgClass: 'bg-red-500/5',
  },
};

/**
 * Get worker display ID (W-1, W-2, W-3, W-4)
 */
const getWorkerLabel = (workerId: number): string => {
  return `W-${workerId}`;
};

/**
 * Status labels with translations
 */
const statusLabels: Record<
  BatchWorkerStatus['status'],
  { ru: string; en: string }
> = {
  idle: { ru: 'Ожидает', en: 'Idle' },
  working: { ru: 'Работает', en: 'Working' },
  completed: { ru: 'Завершено', en: 'Completed' },
  failed: { ru: 'Ошибка', en: 'Failed' },
};

/**
 * BatchProgress Component
 *
 * Visual representation of parallel section generation with worker slots.
 * Displays 4 worker slots in a grid layout, each showing:
 * - Status icon (idle, working, completed, failed)
 * - Worker ID label (W-1, W-2, W-3, W-4)
 * - Current section title (if working)
 */
export const BatchProgress = memo(function BatchProgress({
  workers,
  locale = 'ru',
}: BatchProgressProps) {
  // Always display 4 slots for visual consistency (batch size = 4)
  const workerSlots = Array.from({ length: 4 }, (_, index) => {
    const workerId = index + 1;
    const worker = workers.find((w) => w.workerId === workerId);

    // Default to idle if worker not found
    const status = worker?.status || 'idle';
    const currentSectionTitle = worker?.currentSectionTitle;
    const config = statusConfig[status];
    const Icon = config.icon;

    return {
      workerId,
      status,
      currentSectionTitle,
      config,
      Icon,
    };
  });

  return (
    <div className="w-full">
      {/* 4-column grid for 4 worker slots */}
      <div className="grid grid-cols-4 gap-3">
        {workerSlots.map(({ workerId, status, currentSectionTitle, config, Icon }) => (
          <Card
            key={workerId}
            className={cn(
              'relative overflow-hidden transition-all duration-300',
              config.borderClass,
              config.bgClass,
              status === 'idle' && 'opacity-70',
              config.glow && 'shadow-[0_0_8px_rgba(249,115,22,0.2)]'
            )}
          >
            <div className="p-4 flex flex-col items-center gap-3 min-h-[120px]">
              {/* Status Icon */}
              <div className="flex-shrink-0">
                <Icon
                  className={cn(
                    'h-8 w-8',
                    config.iconColorClass,
                    config.animate && 'animate-spin'
                  )}
                />
              </div>

              {/* Worker ID Label */}
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {getWorkerLabel(workerId)}
              </div>

              {/* Current Section Title (if working) */}
              {currentSectionTitle && status === 'working' && (
                <div className="text-xs text-center text-muted-foreground line-clamp-2 px-1">
                  {currentSectionTitle}
                </div>
              )}

              {/* Status Label */}
              {status !== 'working' && (
                <div className="text-xs text-center text-muted-foreground">
                  {statusLabels[status][locale]}
                </div>
              )}
            </div>

            {/* Working pulse animation overlay */}
            {status === 'working' && (
              <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 to-transparent animate-pulse pointer-events-none" />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
});
