'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SmoothProgressProps {
  /** Current progress value (0-100) */
  value: number
  /** Visual variant */
  variant?: 'default' | 'gradient' | 'striped'
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Custom color class for the progress fill */
  colorClass?: string
  /** Show percentage text above bar */
  showPercentage?: boolean
  /** Additional className for wrapper */
  className?: string
}

const sizeClasses = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

const variantClasses = {
  default: 'bg-primary',
  gradient: 'bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500',
  striped: 'bg-primary',
}

export function SmoothProgress({
  value,
  variant = 'default',
  size = 'md',
  colorClass,
  showPercentage = false,
  className,
}: SmoothProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, value))

  return (
    <div className={cn('w-full', className)}>
      {showPercentage && (
        <div className="mb-1 flex justify-end">
          <span className="text-muted-foreground text-xs tabular-nums">
            {Math.round(clampedValue)}%
          </span>
        </div>
      )}
      <div
        className={cn('bg-secondary relative overflow-hidden rounded-full', sizeClasses[size])}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className={cn('h-full rounded-full', colorClass || variantClasses[variant])}
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={{
            type: 'spring',
            stiffness: 100,
            damping: 30,
            mass: 0.5,
          }}
        />
      </div>
    </div>
  )
}
