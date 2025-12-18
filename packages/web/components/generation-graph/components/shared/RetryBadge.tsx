'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface RetryBadgeProps {
  /** Number of retries */
  count: number;
  /** Badge size (default: 'md') */
  size?: 'sm' | 'md';
  /** Badge position (default: 'top-right') */
  position?: 'top-right' | 'top-left';
  /** Additional CSS classes */
  className?: string;
  /** Test ID for badge */
  testId?: string;
}

/**
 * RetryBadge Component
 *
 * Orange badge showing retry count.
 * Used to indicate how many times a node has been retried.
 *
 * Features:
 * - Orange circular badge
 * - Configurable size and position
 * - Accessible aria-label
 * - Shadow for visibility
 */
export const RetryBadge = ({
  count,
  size = 'md',
  position = 'top-right',
  className,
  testId,
}: RetryBadgeProps) => {
  // Size variants
  const sizeStyles = {
    sm: 'w-4 h-4 text-[10px]',
    md: 'w-5 h-5 text-xs',
  };

  // Position variants
  const positionStyles = {
    'top-right': '-top-2 -right-2',
    'top-left': '-top-2 -left-2',
  };

  return (
    <div
      className={cn(
        "absolute bg-orange-500 text-white font-bold rounded-full flex items-center justify-center shadow-md z-10",
        sizeStyles[size],
        positionStyles[position],
        className
      )}
      data-testid={testId}
      aria-label={`${count} ${count === 1 ? 'retry' : 'retries'}`}
      role="status"
    >
      {count}
    </div>
  );
};
