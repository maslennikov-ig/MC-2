import React from 'react'
import { cn } from '@/lib/utils'

export interface ErrorStateBaseProps {
  /** Icon component from lucide-react */
  icon: React.ElementType
  /** Icon color class (e.g., 'text-orange-400') */
  iconColor?: string
  /** Gradient background class for icon container */
  iconBg?: string
  /** Main title */
  title: string
  /** Description text */
  message: string
  /** Additional message or hint */
  hint?: string
  /** Action buttons */
  actions?: React.ReactNode
  /** Whether to render full-page or inline */
  variant?: 'fullpage' | 'card' | 'inline'
  /** Custom className for outer container */
  className?: string
  /** Children for additional content */
  children?: React.ReactNode
}

export function ErrorStateBase({
  icon: Icon,
  iconColor = 'text-foreground',
  iconBg = 'bg-gradient-to-br from-red-500/20 to-orange-500/20',
  title,
  message,
  hint,
  actions,
  variant = 'fullpage',
  className,
  children,
}: ErrorStateBaseProps) {
  const isFullpage = variant === 'fullpage'
  const isCard = variant === 'card'
  const isInline = variant === 'inline'

  const containerClasses = cn(
    'flex items-center justify-center',
    isFullpage && 'from-background via-primary/10 to-background min-h-screen bg-gradient-to-br p-4',
    isCard && 'w-full',
    isInline && 'w-full py-8',
    className
  )

  const cardClasses = cn(
    'text-center',
    isFullpage &&
      'bg-card/80 dark:bg-card/50 border-border w-full max-w-lg rounded-2xl border p-8 shadow-2xl backdrop-blur-xl',
    isCard &&
      'bg-card/80 dark:bg-card/50 border-border rounded-2xl border p-8 shadow-xl backdrop-blur-xl',
    isInline && 'px-4'
  )

  const iconContainerClasses = cn(
    'mx-auto mb-6 flex items-center justify-center rounded-full',
    isFullpage ? 'h-20 w-20' : 'h-16 w-16',
    iconBg
  )

  const iconSize = isFullpage ? 'w-10 h-10' : 'w-8 h-8'

  const titleClasses = cn('text-foreground mb-4 font-bold', isFullpage ? 'text-3xl' : 'text-2xl')

  const messageClasses = cn(
    'text-muted-foreground mx-auto mb-6 max-w-lg',
    isFullpage ? 'text-lg' : 'text-base'
  )

  return (
    <div className={containerClasses} role="alert" aria-live="polite">
      <div className={cardClasses}>
        <div className={iconContainerClasses}>
          <Icon className={cn(iconSize, iconColor)} />
        </div>

        <h1 className={titleClasses}>{title}</h1>
        <p className={messageClasses}>{message}</p>

        {hint && (
          <div className="border-border mt-6 border-t pt-6">
            <p className="text-muted-foreground/70 text-sm">{hint}</p>
          </div>
        )}

        {actions && (
          <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
            {actions}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
