'use client'

import { SmoothProgress } from '@/components/ui/smooth-progress'

export interface NodeProgressBarProps {
  /** Progress percentage (0-100) */
  progress: number
  /** Visual variant for different states */
  variant?: 'default' | 'success' | 'error' | 'active'
  /** Progress bar size (default: 'sm') */
  size?: 'xs' | 'sm' | 'md'
  /** Additional CSS classes */
  className?: string
}

// Map NodeProgressBar variants to SmoothProgress color classes
const variantColorMap: Record<string, string | undefined> = {
  default: undefined,
  active: undefined,
  success: 'bg-emerald-500 dark:bg-emerald-400',
  error: 'bg-red-500 dark:bg-red-400',
}

// Map NodeProgressBar sizes to SmoothProgress sizes
const sizeMap: Record<string, 'sm' | 'md' | 'lg'> = {
  xs: 'sm',
  sm: 'sm',
  md: 'md',
}

/**
 * NodeProgressBar Component
 *
 * Animated progress bar with status-based colors.
 * Used to show completion progress in graph nodes.
 */
export const NodeProgressBar = ({
  progress,
  variant = 'default',
  size = 'sm',
  className,
}: NodeProgressBarProps) => {
  return (
    <SmoothProgress
      value={progress}
      size={sizeMap[size]}
      colorClass={variantColorMap[variant]}
      className={className}
    />
  )
}
