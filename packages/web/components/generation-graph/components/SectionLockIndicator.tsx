'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { SectionLockReason } from '@megacampus/shared-types';
import { SECTION_LOCK_LABELS } from '@megacampus/shared-types';

/**
 * SectionLockIndicator - Shows why a section is locked from further edits
 *
 * Displays a lock icon with tooltip explanation for:
 * - max_edits: Section reached edit limit (2 edits)
 * - regression: Edit caused quality regression
 * - oscillation: Section oscillating between versions
 *
 * Used in RefinementTaskDisplay and RefinementIterationDisplay.
 */

interface SectionLockIndicatorProps {
  /** Why the section is locked */
  reason: SectionLockReason;
  /** Section title for context */
  sectionTitle?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

const REASON_ICONS: Record<SectionLockReason, React.ElementType> = {
  max_edits: Lock,
  regression: AlertTriangle,
  oscillation: RefreshCw,
};

const REASON_COLORS: Record<SectionLockReason, { bg: string; text: string; border: string }> = {
  max_edits: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-300 dark:border-slate-600',
  },
  regression: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-300 dark:border-red-700',
  },
  oscillation: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-300 dark:border-amber-700',
  },
};

const SIZE_CLASSES = {
  sm: 'p-1',
  md: 'p-1.5',
  lg: 'p-2',
};

const ICON_SIZE_CLASSES = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export function SectionLockIndicator({
  reason,
  sectionTitle,
  size = 'md',
  className,
}: SectionLockIndicatorProps) {
  const Icon = REASON_ICONS[reason];
  const colors = REASON_COLORS[reason];
  const labels = SECTION_LOCK_LABELS[reason];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              'inline-flex items-center justify-center rounded-full border',
              SIZE_CLASSES[size],
              colors.bg,
              colors.border,
              className
            )}
          >
            <Icon className={cn(ICON_SIZE_CLASSES[size], colors.text)} />
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium text-sm">{labels.ru}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {labels.description}
            </p>
            {sectionTitle && (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                Раздел: {sectionTitle}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * SectionLockBadge - Inline badge variant showing lock reason
 */
interface SectionLockBadgeProps {
  reason: SectionLockReason;
  className?: string;
}

export function SectionLockBadge({ reason, className }: SectionLockBadgeProps) {
  const Icon = REASON_ICONS[reason];
  const colors = REASON_COLORS[reason];
  const labels = SECTION_LOCK_LABELS[reason];

  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {labels.ru}
    </motion.span>
  );
}
