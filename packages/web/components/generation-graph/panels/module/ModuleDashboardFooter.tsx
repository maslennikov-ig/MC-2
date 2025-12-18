'use client';

import React from 'react';
import { Download, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ModuleDashboardAggregates } from '@megacampus/shared-types';
import { cn } from '@/lib/utils';

/**
 * ModuleDashboardFooter - Footer with batch actions for Module Dashboard
 *
 * Provides three key actions:
 * 1. Export All: Download all completed lessons
 * 2. Regenerate Failed: Retry all error lessons
 * 3. Improve Quality: Regenerate lessons with score < 0.75
 *
 * All buttons are conditionally enabled based on aggregates and show
 * tooltips explaining availability.
 */

interface ModuleDashboardFooterProps {
  /** Aggregated metrics from module dashboard */
  aggregates: ModuleDashboardAggregates;
  /** Number of completed lessons with quality score < 0.75 */
  lowQualityCount: number;
  /** Export all completed lessons handler */
  onExportAll: () => void;
  /** Regenerate all failed lessons handler */
  onRegenerateFailed: () => void;
  /** Regenerate low-quality lessons handler */
  onImproveQuality: () => void;
  /** Loading state for export action */
  isExporting?: boolean;
  /** Loading state for regenerate action */
  isRegenerating?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function ModuleDashboardFooter({
  aggregates,
  lowQualityCount,
  onExportAll,
  onRegenerateFailed,
  onImproveQuality,
  isExporting = false,
  isRegenerating = false,
  className,
}: ModuleDashboardFooterProps) {
  const hasCompletedLessons = aggregates.completedLessons > 0;
  const hasErrorLessons = aggregates.errorLessons > 0;
  const hasLowQualityLessons = lowQualityCount > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'flex items-center justify-start gap-3 p-4',
          'border-t border-border/50 bg-card/30 backdrop-blur-sm',
          'dark:bg-card/20 dark:border-border/30',
          className
        )}
      >
        {/* Export All Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                variant="default"
                size="default"
                onClick={onExportAll}
                disabled={!hasCompletedLessons || isExporting}
                className="gap-2"
              >
                <Download className="size-4" />
                {isExporting ? 'Экспорт...' : 'Экспорт всех'}
              </Button>
            </div>
          </TooltipTrigger>
          {!hasCompletedLessons && (
            <TooltipContent>
              <p>Нет завершенных уроков для экспорта</p>
            </TooltipContent>
          )}
        </Tooltip>

        {/* Regenerate Failed Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                variant="secondary"
                size="default"
                onClick={onRegenerateFailed}
                disabled={!hasErrorLessons || isRegenerating}
                className={cn(
                  'gap-2',
                  hasErrorLessons && 'border-orange-500/50 bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:text-orange-400'
                )}
              >
                <RefreshCw className={cn('size-4', isRegenerating && 'animate-spin')} />
                {isRegenerating
                  ? 'Переделываем...'
                  : `Переделать ошибки${hasErrorLessons ? ` (${aggregates.errorLessons})` : ''}`}
              </Button>
            </div>
          </TooltipTrigger>
          {!hasErrorLessons && (
            <TooltipContent>
              <p>Нет уроков с ошибками</p>
            </TooltipContent>
          )}
        </Tooltip>

        {/* Improve Quality Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                variant="outline"
                size="default"
                onClick={onImproveQuality}
                disabled={!hasLowQualityLessons || isRegenerating}
                className="gap-2"
              >
                <TrendingUp className="size-4" />
                Улучшить качество
                {hasLowQualityLessons && ` (${lowQualityCount})`}
              </Button>
            </div>
          </TooltipTrigger>
          {!hasLowQualityLessons && (
            <TooltipContent>
              <p>Нет уроков с оценкой ниже 0.75</p>
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
