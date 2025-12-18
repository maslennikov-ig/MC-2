import * as React from 'react';
import { cn } from '@/lib/utils';
import type { ResponsiveTableProps } from '../types';

/**
 * ResponsiveTable Component
 *
 * Wraps markdown tables with horizontal scroll and enhanced styling.
 * Provides mobile-friendly table viewing with striped rows and hover effects.
 *
 * Features:
 * - Horizontal scroll wrapper for wide tables on mobile
 * - Alternating row colors (striped)
 * - Row hover highlight
 * - Proper border styling
 * - Dark mode support
 *
 * @example
 * ```tsx
 * <ResponsiveTable>
 *   <table>...</table>
 * </ResponsiveTable>
 * ```
 */
export function ResponsiveTable({ children, className }: ResponsiveTableProps) {
  return (
    <div
      className={cn(
        'responsive-table-wrapper my-6 overflow-x-auto',
        // Scrollbar styling
        'scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent',
        className
      )}
      role="region"
      aria-label="Scrollable table"
      tabIndex={0}
    >
      <div className="min-w-full inline-block align-middle">
        {children}
      </div>
    </div>
  );
}

/**
 * Styles to be added to tailwind.config.ts or global CSS:
 *
 * The prose table styles are already configured in tailwind.config.ts
 * This component adds the scroll wrapper for wide tables.
 *
 * For striped rows, ensure these classes are in your tailwind config:
 * - even:bg-muted/50
 * - hover:bg-muted
 */
