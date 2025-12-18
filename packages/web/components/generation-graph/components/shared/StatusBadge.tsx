'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { NodeStatus } from '@megacampus/shared-types';

export type { NodeStatus };

export interface StatusBadgeProps {
  /** Node status */
  status: NodeStatus;
  /** Custom label (default: auto-generated from status) */
  label?: string;
  /** Badge size (default: 'sm') */
  size?: 'xs' | 'sm';
  /** Additional CSS classes */
  className?: string;
}

/**
 * StatusBadge Component
 *
 * Status pill badge displaying node state.
 * Used to show current status with color-coding.
 *
 * Features:
 * - Color-coded status variants
 * - Localized default labels (Russian)
 * - Multiple size options
 * - Dark mode support
 */
export const StatusBadge = ({
  status,
  label,
  size = 'sm',
  className,
}: StatusBadgeProps) => {
  // Default labels (Russian)
  const defaultLabels: Record<NodeStatus, string> = {
    completed: 'Готово',
    active: 'Активно',
    error: 'Ошибка',
    awaiting: 'Ожидает',
    pending: 'Ожидает',
    skipped: 'Пропущено',
  };

  // Variant-specific styling
  const variantStyles: Record<NodeStatus, string> = {
    completed: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30',
    active: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30',
    error: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30',
    awaiting: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
    pending: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
    skipped: 'text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 opacity-60',
  };

  // Size variants
  const sizeStyles = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-xs px-2 py-1',
  };

  const displayLabel = label || defaultLabels[status];

  return (
    <span
      className={cn(
        "rounded-full font-medium inline-flex items-center justify-center",
        variantStyles[status],
        sizeStyles[size],
        className
      )}
      role="status"
      aria-label={`Status: ${displayLabel}`}
    >
      {displayLabel}
    </span>
  );
};
