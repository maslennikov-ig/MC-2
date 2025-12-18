'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, TrendingUp, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BestEffortDisplay } from '@megacampus/shared-types';
import { REFINEMENT_STATUS_LABELS } from '@megacampus/shared-types';

/**
 * BestEffortWarning - Alert banner for best-effort refinement results
 *
 * Shows warning when quality threshold wasn't met but best iteration was selected.
 * Features:
 * - Color-coded by quality status (emerald/yellow/orange/red)
 * - Final score vs target threshold display
 * - Selected iteration information
 * - Warning message explaining threshold miss
 * - "Требует проверки" badge if manual review needed
 * - Dismissible (optional)
 *
 * Quality Status Colors:
 * - meets_threshold: emerald (shouldn't happen in best-effort)
 * - acceptable: yellow/amber
 * - below_standard: orange/red
 */

interface BestEffortWarningProps {
  result: BestEffortDisplay;
  onDismiss?: () => void;
  className?: string;
}

export function BestEffortWarning({
  result,
  onDismiss,
  className,
}: BestEffortWarningProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  // Don't show if not active or dismissed
  if (!result.isActive || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  // Determine color scheme based on quality status
  const colorConfig = {
    meets_threshold: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/10',
      border: 'border-emerald-200 dark:border-emerald-800',
      icon: 'text-emerald-600 dark:text-emerald-400',
      text: 'text-emerald-900 dark:text-emerald-200',
      textSecondary: 'text-emerald-700 dark:text-emerald-300',
      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    acceptable: {
      bg: 'bg-amber-50 dark:bg-amber-900/10',
      border: 'border-amber-200 dark:border-amber-800',
      icon: 'text-amber-600 dark:text-amber-400',
      text: 'text-amber-900 dark:text-amber-200',
      textSecondary: 'text-amber-700 dark:text-amber-300',
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    },
    below_standard: {
      bg: 'bg-orange-50 dark:bg-orange-900/10',
      border: 'border-orange-200 dark:border-orange-800',
      icon: 'text-orange-600 dark:text-orange-400',
      text: 'text-orange-900 dark:text-orange-200',
      textSecondary: 'text-orange-700 dark:text-orange-300',
      badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    },
  };

  const colors = colorConfig[result.qualityStatus];

  // Format score display
  const scoreDisplay = `${result.finalScore.toFixed(1)} / ${result.targetThreshold.toFixed(1)}`;
  const scorePercentage = (result.finalScore / result.targetThreshold) * 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'relative p-4 rounded-lg border',
          colors.bg,
          colors.border,
          className
        )}
      >
        <div className="flex items-start gap-3">
          {/* Warning Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <AlertTriangle className={cn('w-5 h-5', colors.icon)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header with status badges */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={cn('text-xs font-medium', colors.badge)}>
                  {REFINEMENT_STATUS_LABELS.best_effort.ru}
                </Badge>
                {result.requiresReview && (
                  <Badge className="text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                    {REFINEMENT_STATUS_LABELS.escalated.ru}
                  </Badge>
                )}
              </div>
            </div>

            {/* Main message */}
            <p className={cn('text-sm font-medium mb-3', colors.text)}>
              {result.statusLabel}
            </p>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {/* Score Display */}
              <div className="flex items-center gap-2">
                <TrendingUp className={cn('w-4 h-4 flex-shrink-0', colors.icon)} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Итоговый балл
                  </div>
                  <div className={cn('text-sm font-bold', colors.textSecondary)}>
                    {scoreDisplay}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    ({scorePercentage.toFixed(0)}% от порога)
                  </div>
                </div>
              </div>

              {/* Iteration Display */}
              {result.selectedIteration !== null && (
                <div className="flex items-center gap-2">
                  <AlertCircle className={cn('w-4 h-4 flex-shrink-0', colors.icon)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Выбрана итерация
                    </div>
                    <div className={cn('text-sm font-bold', colors.textSecondary)}>
                      #{result.selectedIteration}
                    </div>
                    {result.selectionReason && (
                      <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                        {result.selectionReason}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Warning message */}
            {result.warningMessage && (
              <div className={cn('text-xs p-2 rounded bg-white/50 dark:bg-black/20', colors.textSecondary)}>
                {result.warningMessage}
              </div>
            )}
          </div>

          {/* Dismiss button */}
          {onDismiss && (
            <button
              onClick={handleDismiss}
              className={cn(
                'flex-shrink-0 p-1 rounded hover:bg-white/50 dark:hover:bg-black/20 transition-colors',
                colors.icon
              )}
              aria-label="Закрыть предупреждение"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
