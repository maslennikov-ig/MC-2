'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface NodeProgressBarProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Visual variant for different states */
  variant?: 'default' | 'success' | 'error' | 'active';
  /** Progress bar size (default: 'sm') */
  size?: 'xs' | 'sm' | 'md';
  /** Additional CSS classes */
  className?: string;
}

/**
 * NodeProgressBar Component
 *
 * Animated progress bar with status-based colors.
 * Used to show completion progress in graph nodes.
 *
 * Features:
 * - Status-based color variants
 * - Smooth width transitions
 * - Multiple size options
 * - Dark mode support
 */
export const NodeProgressBar = ({
  progress,
  variant = 'default',
  size = 'sm',
  className,
}: NodeProgressBarProps) => {
  // Variant-specific styling
  const variantStyles = {
    default: {
      bg: 'bg-slate-200 dark:bg-slate-600',
      fill: 'bg-blue-500 dark:bg-blue-400',
    },
    active: {
      bg: 'bg-slate-200 dark:bg-slate-600',
      fill: 'bg-blue-500 dark:bg-blue-400',
    },
    success: {
      bg: 'bg-slate-200 dark:bg-slate-700',
      fill: 'bg-emerald-500 dark:bg-emerald-400',
    },
    error: {
      bg: 'bg-slate-200 dark:bg-slate-700',
      fill: 'bg-red-500 dark:bg-red-400',
    },
  };

  // Size variants
  const sizeStyles = {
    xs: 'h-1',
    sm: 'h-1.5',
    md: 'h-2',
  };

  const styles = variantStyles[variant];
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div
      className={cn(
        "w-full rounded-full overflow-hidden",
        styles.bg,
        sizeStyles[size],
        className
      )}
      role="progressbar"
      aria-valuenow={clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full transition-all duration-500",
          styles.fill
        )}
        style={{ width: `${clampedProgress}%` }}
      />
    </div>
  );
};
