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
    isFullpage && 'min-h-screen bg-gradient-to-br from-background via-primary/10 to-background p-4',
    isCard && 'w-full',
    isInline && 'w-full py-8',
    className
  )

  const cardClasses = cn(
    'text-center',
    isFullpage && 'bg-card/80 dark:bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-8 shadow-2xl max-w-lg w-full',
    isCard && 'bg-card/80 dark:bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-8 shadow-xl',
    isInline && 'px-4'
  )

  const iconContainerClasses = cn(
    'rounded-full flex items-center justify-center mx-auto mb-6',
    isFullpage ? 'w-20 h-20' : 'w-16 h-16',
    iconBg
  )

  const iconSize = isFullpage ? 'w-10 h-10' : 'w-8 h-8'

  const titleClasses = cn(
    'font-bold text-foreground mb-4',
    isFullpage ? 'text-3xl' : 'text-2xl'
  )

  const messageClasses = cn(
    'text-muted-foreground mb-6 max-w-lg mx-auto',
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
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-muted-foreground/70 text-sm">{hint}</p>
          </div>
        )}

        {actions && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-6">
            {actions}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
