import * as React from 'react'
import {
  Info,
  Lightbulb,
  AlertTriangle,
  AlertCircle,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getContentLabels } from '@megacampus/shared-types'
import type { CalloutProps, CalloutType } from '../types'

/**
 * Type-based styling configuration for callouts
 * Maps each callout type to its icon and color scheme
 */
const calloutStyles: Record<CalloutType, { icon: LucideIcon; colors: string }> = {
  note: {
    icon: Info,
    colors: 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-100',
  },
  tip: {
    icon: Lightbulb,
    colors: 'border-green-500 bg-green-50 dark:bg-green-950/50 text-green-900 dark:text-green-100',
  },
  warning: {
    icon: AlertTriangle,
    colors:
      'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/50 text-yellow-900 dark:text-yellow-100',
  },
  danger: {
    icon: AlertCircle,
    colors: 'border-red-500 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-100',
  },
  info: {
    icon: MessageCircle,
    colors:
      'border-purple-500 bg-purple-50 dark:bg-purple-950/50 text-purple-900 dark:text-purple-100',
  },
}

/**
 * Default English titles for each callout type (fallback)
 */
const defaultTitles: Record<CalloutType, string> = {
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  danger: 'Danger',
  info: 'Info',
}

/**
 * Get localized title for a callout type based on content language.
 * Falls back to English defaults if language is not provided.
 */
function getLocalizedTitle(type: CalloutType, language?: string): string {
  if (!language) return defaultTitles[type]

  const labels = getContentLabels(language)
  const labelMap: Record<CalloutType, string> = {
    note: labels.calloutNote,
    tip: labels.calloutTip,
    warning: labels.calloutWarning,
    danger: labels.calloutDanger,
    info: labels.calloutInfo,
  }
  return labelMap[type]
}

/**
 * Callout Component
 *
 * Renders GitHub-style callout/admonition blocks with icons and colored borders.
 * Supports five types: note, tip, warning, danger, info.
 *
 * @example
 * ```tsx
 * <Callout type="warning" title="Important">
 *   This is a warning message
 * </Callout>
 * ```
 *
 * Markdown syntax:
 * ```markdown
 * > [!WARNING]
 * > This is a warning message
 * ```
 */
export function Callout({ type, title, children, className, language }: CalloutProps) {
  const style = calloutStyles[type]
  const Icon = style.icon
  const displayTitle = title || getLocalizedTitle(type, language)

  return (
    <aside
      role={type === 'danger' || type === 'warning' ? 'alert' : 'note'}
      className={cn('callout my-6 rounded-lg border-l-4 p-4', style.colors, className)}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 font-semibold">{displayTitle}</div>
          <div className="text-sm opacity-90">{children}</div>
        </div>
      </div>
    </aside>
  )
}
