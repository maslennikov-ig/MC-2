import type { NodeStatus } from '@megacampus/shared-types'

/**
 * Node variant type for different node sizes and styles
 */
export type NodeVariant = 'stage' | 'document' | 'lesson' | 'module' | 'default'

/**
 * Get Tailwind CSS classes for node styling based on status with dark mode support.
 * Uses Tailwind's dark: variant for automatic dark mode handling.
 *
 * @param status - Current node status
 * @param variant - Node variant for different sizes (stage, document, lesson, default)
 * @returns Tailwind CSS class string with dark mode variants
 *
 * @example
 * ```tsx
 * const styles = getNodeStatusStyles('active', 'stage');
 * // Returns classes with both light and dark mode variants
 * ```
 */
export function getNodeStatusStyles(status: NodeStatus, variant: NodeVariant = 'default'): string {
  switch (status) {
    case 'pending':
      return 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800'

    case 'active':
      // Stage nodes have stronger active effects (larger shadow, pulse animation)
      if (variant === 'stage') {
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105 animate-pulse'
      }
      // Document and lesson nodes have lighter active effects
      return 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-[0_0_10px_rgba(59,130,246,0.4)] scale-105 transition-transform'

    case 'completed':
      return 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'

    case 'approved':
      // Approved status - brighter/more vivid green than completed to indicate "reviewed and ready"
      return 'border-emerald-600 bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-800/40 shadow-[0_0_8px_rgba(16,185,129,0.3)] dark:shadow-[0_0_8px_rgba(16,185,129,0.4)]'

    case 'error':
      // Stage nodes have stronger error effects (larger shadow)
      if (variant === 'stage') {
        return 'border-red-500 bg-red-50 dark:bg-red-900/30 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
      }
      return 'border-red-500 bg-red-50 dark:bg-red-900/30'

    case 'awaiting':
      // Awaiting status with yellow/amber styling and pulse animation
      return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 shadow-[0_0_15px_rgba(234,179,8,0.6)] scale-105 animate-pulse'

    case 'skipped':
      return 'border-slate-400 bg-slate-100 dark:bg-slate-700 opacity-60'

    default:
      // Default/fallback styling for document/lesson/module nodes
      if (variant === 'document' || variant === 'lesson' || variant === 'module') {
        return 'border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500'
      }
      return 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800'
  }
}

/**
 * Get solid background color for minimal node representations.
 * Used in semantic zoom when zoom < 0.3.
 *
 * @param status - Current node status
 * @returns Tailwind CSS background color class with dark mode variant
 */
export function getStatusColor(status: NodeStatus): string {
  switch (status) {
    case 'active':
      return 'bg-blue-500 dark:bg-blue-600'
    case 'completed':
      return 'bg-emerald-500 dark:bg-emerald-600'
    case 'approved':
      return 'bg-emerald-600 dark:bg-emerald-500'
    case 'error':
      return 'bg-red-500 dark:bg-red-600'
    case 'awaiting':
      return 'bg-yellow-500 dark:bg-yellow-600'
    case 'skipped':
      return 'bg-slate-400 dark:bg-slate-500'
    default:
      return 'bg-slate-300 dark:bg-slate-600'
  }
}

/**
 * Get left border styling for card-style nodes.
 * Used for LessonNode and collapsed ModuleGroup.
 *
 * @param status - Current node status
 * @returns Tailwind CSS classes for 4px left border with background
 */
export function getStatusBorderClass(status: NodeStatus): string {
  switch (status) {
    case 'pending':
      return 'border-l-4 border-l-slate-300 dark:border-l-slate-600 bg-white dark:bg-slate-800 opacity-70'
    case 'active':
      return 'border-l-4 border-l-blue-500 dark:border-l-blue-400 bg-blue-50 dark:bg-blue-900/30 shadow-[0_0_10px_rgba(59,130,246,0.3)] animate-pulse'
    case 'completed':
      return 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
    case 'approved':
      // Vivid green with subtle glow effect for approved status
      return 'border-l-4 border-l-emerald-600 dark:border-l-emerald-400 bg-emerald-100 dark:bg-emerald-800/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
    case 'error':
      return 'border-l-4 border-l-red-500 dark:border-l-red-400 bg-red-50 dark:bg-red-900/30'
    case 'awaiting':
      return 'border-l-4 border-l-yellow-500 dark:border-l-yellow-400 bg-yellow-50 dark:bg-yellow-900/30'
    case 'skipped':
      return 'border-l-4 border-l-slate-400 dark:border-l-slate-500 bg-slate-100 dark:bg-slate-700 opacity-60'
    default:
      return 'border-l-4 border-l-slate-300 dark:border-l-slate-600 bg-white dark:bg-slate-800'
  }
}

/**
 * Get progress bar fill color based on status.
 *
 * @param status - Current node status
 * @returns Tailwind CSS background color class
 */
export function getProgressBarColor(status: NodeStatus): string {
  switch (status) {
    case 'active':
      return 'bg-blue-500'
    case 'completed':
      return 'bg-emerald-500'
    case 'approved':
      return 'bg-emerald-500'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-purple-500'
  }
}

/**
 * Text style type for different text elements
 */
export type TextStyleType = 'label' | 'name' | 'icon' | 'iconBg'

/**
 * Node theme for different node color schemes
 */
export type NodeTheme = 'slate' | 'indigo'

/**
 * Get text styling classes based on status and element type.
 * Centralizes skipped state styling to avoid duplication (DRY).
 *
 * @param status - Current node status
 * @param type - Type of text element (label, name, icon, iconBg)
 * @param theme - Color theme (slate for stages, indigo for groups)
 * @returns Tailwind CSS class string with dark mode variants
 *
 * @example
 * ```tsx
 * // Stage label
 * <span className={`text-xs ${getTextStatusClass('skipped', 'label', 'slate')}`}>
 *   Stage 2
 * </span>
 *
 * // Stage name with line-through when skipped
 * <span className={`text-sm font-semibold ${getTextStatusClass('skipped', 'name', 'slate')}`}>
 *   Document Analysis
 * </span>
 * ```
 */
export function getTextStatusClass(
  status: NodeStatus,
  type: TextStyleType,
  theme: NodeTheme = 'slate'
): string {
  const isSkipped = status === 'skipped'

  switch (type) {
    case 'label':
      // Stage label (small uppercase text)
      return isSkipped
        ? 'text-slate-400 dark:text-slate-500'
        : theme === 'indigo'
          ? 'text-indigo-500 dark:text-indigo-400'
          : 'text-slate-500 dark:text-slate-400'

    case 'name':
      // Stage name (main title) - includes line-through when skipped
      return isSkipped
        ? 'text-slate-500 dark:text-slate-400 line-through'
        : 'text-slate-900 dark:text-slate-100'

    case 'icon':
      // Icon color
      return isSkipped
        ? 'text-slate-400 dark:text-slate-500'
        : theme === 'indigo'
          ? 'text-indigo-600 dark:text-indigo-400'
          : 'text-slate-600 dark:text-slate-300'

    case 'iconBg':
      // Icon background (circular container)
      if (isSkipped) {
        return 'bg-slate-200 dark:bg-slate-600'
      }
      return theme === 'indigo'
        ? 'bg-indigo-100 dark:bg-indigo-900/30'
        : 'bg-slate-100 dark:bg-slate-700'

    default:
      return ''
  }
}

/**
 * Get combined icon container classes (background + text color).
 * Convenience function for icon containers that need both bg and text.
 *
 * @param status - Current node status
 * @param theme - Color theme
 * @param isActive - Whether node is in active state (special styling)
 * @returns Tailwind CSS class string
 */
export function getIconContainerClass(
  status: NodeStatus,
  theme: NodeTheme = 'indigo',
  isActive: boolean = false
): string {
  if (isActive) {
    return 'bg-white shadow-sm dark:bg-slate-700'
  }

  const bgClass = getTextStatusClass(status, 'iconBg', theme)
  const textClass = getTextStatusClass(status, 'icon', theme)

  return `${bgClass} ${textClass}`
}
