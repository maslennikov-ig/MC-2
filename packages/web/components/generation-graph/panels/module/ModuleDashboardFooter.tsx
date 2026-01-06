'use client';

import React, { useState } from 'react';
import { Download, RefreshCw, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ModuleDashboardAggregates } from '@megacampus/shared-types';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/generation-graph/useTranslation';

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
  /** Approve all completed lessons handler */
  onApproveAll: () => void;
  /** Loading state for export action */
  isExporting?: boolean;
  /** Loading state for regenerate action */
  isRegenerating?: boolean;
  /** Loading state for approve action */
  isApproving?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function ModuleDashboardFooter({
  aggregates,
  lowQualityCount,
  onExportAll,
  onRegenerateFailed,
  onImproveQuality,
  onApproveAll,
  isExporting = false,
  isRegenerating = false,
  isApproving = false,
  className,
}: ModuleDashboardFooterProps) {
  const { t, locale } = useTranslation();
  const hasCompletedLessons = aggregates.completedLessons > 0;
  const hasErrorLessons = aggregates.errorLessons > 0;
  const hasLowQualityLessons = lowQualityCount > 0;
  // Lessons that can be approved (completed but not yet approved)
  const hasApprovableLessons = aggregates.completedLessons > 0;

  // State for approval confirmation dialog
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);

  // Pluralization for "lesson" based on locale
  const getLessonWord = (count: number): string => {
    if (locale === 'en') {
      return count === 1 ? t('common.lessonWord') : t('common.lessonsManyWord');
    }
    // Russian pluralization (урок/урока/уроков)
    const lastTwo = count % 100;
    const lastOne = count % 10;
    if (lastTwo >= 11 && lastTwo <= 19) return t('common.lessonsManyWord');
    if (lastOne === 1) return t('common.lessonWord');
    if (lastOne >= 2 && lastOne <= 4) return t('common.lessonsWord');
    return t('common.lessonsManyWord');
  };

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
        {/* Approve All Button with Confirmation Dialog */}
        <AlertDialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <div>
                  <Button
                    variant="default"
                    size="default"
                    disabled={!hasApprovableLessons || isApproving}
                    className={cn(
                      'gap-2',
                      hasApprovableLessons && 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700'
                    )}
                  >
                    <CheckCircle2 className={cn('size-4', isApproving && 'animate-pulse')} />
                    {isApproving
                      ? t('actions.approving')
                      : `${t('actions.approveAll')}${hasApprovableLessons ? ` (${aggregates.completedLessons})` : ''}`}
                  </Button>
                </div>
              </AlertDialogTrigger>
            </TooltipTrigger>
            {!hasApprovableLessons && (
              <TooltipContent>
                <p>{t('actions.noLessonsToApprove')}</p>
              </TooltipContent>
            )}
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('actions.approveAllLessonsTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('actions.approveAllLessonsDescription')} {aggregates.completedLessons} {getLessonWord(aggregates.completedLessons)}.
                {' '}{t('actions.approveAllLessonsWarning')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onApproveAll();
                }}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {t('actions.approveAll')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Export All Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                variant="outline"
                size="default"
                onClick={onExportAll}
                disabled={!hasCompletedLessons || isExporting}
                className="gap-2"
              >
                <Download className="size-4" />
                {isExporting ? t('actions.exporting') : t('actions.exportAll')}
              </Button>
            </div>
          </TooltipTrigger>
          {!hasCompletedLessons && (
            <TooltipContent>
              <p>{t('actions.noCompletedLessonsForExport')}</p>
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
                  ? t('actions.retrying')
                  : `${t('actions.retryErrors')}${hasErrorLessons ? ` (${aggregates.errorLessons})` : ''}`}
              </Button>
            </div>
          </TooltipTrigger>
          {!hasErrorLessons && (
            <TooltipContent>
              <p>{t('actions.noLessonsWithErrors')}</p>
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
                {t('actions.improveQuality')}
                {hasLowQualityLessons && ` (${lowQualityCount})`}
              </Button>
            </div>
          </TooltipTrigger>
          {!hasLowQualityLessons && (
            <TooltipContent>
              <p>{t('actions.noLowQualityLessons')}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
