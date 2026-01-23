import { cn } from '@/lib/utils'
import { ImageIcon, AlertTriangle } from 'lucide-react'

export interface ImageSkeletonProps {
  /** Show icon in the center of skeleton */
  withIcon?: boolean
  /** Custom icon to display (defaults to ImageIcon). Use 'image' for placeholder, 'error' for error state, or pass custom ReactNode */
  icon?: React.ReactNode
  /** Additional className for customization */
  className?: string
  /** Use gradient background instead of solid */
  gradient?: boolean
  /** ARIA label for accessibility */
  'aria-label'?: string
}

/**
 * Skeleton placeholder for images with smooth loading.
 * Supports accessibility (ARIA, reduced-motion) and error states.
 *
 * @example
 * // Basic skeleton
 * {!isLoaded && <ImageSkeleton />}
 *
 * @example
 * // With icon
 * {!isLoaded && <ImageSkeleton withIcon />}
 *
 * @example
 * // Error state
 * {hasError && <ImageSkeleton icon="error" className="animate-none" />}
 *
 * @example
 * // Gradient style (for course cards)
 * {!isLoaded && <ImageSkeleton gradient />}
 */
export function ImageSkeleton({
  withIcon = false,
  icon,
  className,
  gradient = false,
  'aria-label': ariaLabel = 'Загрузка изображения',
}: ImageSkeletonProps) {
  const renderIcon = () => {
    // Show default ImageIcon only if withIcon is true and no custom icon
    if (withIcon && !icon) {
      return <ImageIcon className="text-muted-foreground/50 h-8 w-8" aria-hidden="true" />
    }

    // Show custom icon if provided
    if (icon) {
      return icon
    }

    return null
  }

  // Non-animated state when custom icon is error-like
  const isErrorState = false

  return (
    <div
      className={cn(
        'absolute inset-0 flex items-center justify-center',
        gradient ? 'from-primary/20 to-secondary/20 bg-gradient-to-br' : 'bg-muted',
        !isErrorState && 'motion-safe:animate-pulse',
        className
      )}
      role={isErrorState ? undefined : 'status'}
      aria-label={isErrorState ? undefined : ariaLabel}
    >
      {renderIcon()}
    </div>
  )
}

/**
 * Error fallback for failed image loads.
 * Non-animated version of ImageSkeleton.
 */
export function ImageErrorFallback({
  className,
  icon,
}: {
  className?: string
  icon?: React.ReactNode
}) {
  return (
    <div className={cn('bg-muted absolute inset-0 flex items-center justify-center', className)}>
      {icon || <AlertTriangle className="text-muted-foreground/50 h-8 w-8" aria-hidden="true" />}
    </div>
  )
}
