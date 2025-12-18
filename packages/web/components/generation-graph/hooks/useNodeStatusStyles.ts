import type { NodeStatus } from '@megacampus/shared-types';

/**
 * Node variant type for different node sizes and styles
 */
export type NodeVariant = 'stage' | 'document' | 'lesson' | 'module' | 'default';

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
export function getNodeStatusStyles(
  status: NodeStatus,
  variant: NodeVariant = 'default'
): string {
  switch (status) {
    case 'pending':
      return 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800';

    case 'active':
      // Stage nodes have stronger active effects (larger shadow, pulse animation)
      if (variant === 'stage') {
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105 animate-pulse';
      }
      // Document and lesson nodes have lighter active effects
      return 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-[0_0_10px_rgba(59,130,246,0.4)] scale-105 transition-transform';

    case 'completed':
      return 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30';

    case 'error':
      // Stage nodes have stronger error effects (larger shadow)
      if (variant === 'stage') {
        return 'border-red-500 bg-red-50 dark:bg-red-900/30 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
      }
      return 'border-red-500 bg-red-50 dark:bg-red-900/30';

    case 'awaiting':
      // Awaiting status with yellow/amber styling and pulse animation
      return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 shadow-[0_0_15px_rgba(234,179,8,0.6)] scale-105 animate-pulse';

    case 'skipped':
      return 'border-slate-400 bg-slate-100 dark:bg-slate-700 opacity-60';

    default:
      // Default/fallback styling for document/lesson/module nodes
      if (variant === 'document' || variant === 'lesson' || variant === 'module') {
        return 'border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500';
      }
      return 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800';
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
      return 'bg-blue-500 dark:bg-blue-600';
    case 'completed':
      return 'bg-emerald-500 dark:bg-emerald-600';
    case 'error':
      return 'bg-red-500 dark:bg-red-600';
    case 'awaiting':
      return 'bg-yellow-500 dark:bg-yellow-600';
    case 'skipped':
      return 'bg-slate-400 dark:bg-slate-500';
    default:
      return 'bg-slate-300 dark:bg-slate-600';
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
      return 'border-l-4 border-l-slate-300 dark:border-l-slate-600 bg-white dark:bg-slate-800 opacity-70';
    case 'active':
      return 'border-l-4 border-l-blue-500 dark:border-l-blue-400 bg-blue-50 dark:bg-blue-900/30 shadow-[0_0_10px_rgba(59,130,246,0.3)] animate-pulse';
    case 'completed':
      return 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400 bg-emerald-50 dark:bg-emerald-900/30';
    case 'error':
      return 'border-l-4 border-l-red-500 dark:border-l-red-400 bg-red-50 dark:bg-red-900/30';
    case 'awaiting':
      return 'border-l-4 border-l-yellow-500 dark:border-l-yellow-400 bg-yellow-50 dark:bg-yellow-900/30';
    case 'skipped':
      return 'border-l-4 border-l-slate-400 dark:border-l-slate-500 bg-slate-100 dark:bg-slate-700 opacity-60';
    default:
      return 'border-l-4 border-l-slate-300 dark:border-l-slate-600 bg-white dark:bg-slate-800';
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
      return 'bg-blue-500';
    case 'completed':
      return 'bg-emerald-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-purple-500';
  }
}
