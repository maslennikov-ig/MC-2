'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SkipToContentProps {
  /** Target element ID to skip to (without #) */
  targetId?: string;
  /** Custom label text */
  label?: string;
  /** Custom className */
  className?: string;
}

/**
 * SkipToContent Component
 *
 * Accessibility feature that allows keyboard users to skip navigation
 * and jump directly to main content. Visually hidden until focused.
 *
 * @example
 * ```tsx
 * // In layout.tsx, as first child of body
 * <body>
 *   <SkipToContent targetId="main-content" />
 *   <Header />
 *   <main id="main-content">...</main>
 * </body>
 * ```
 */
export function SkipToContent({
  targetId = 'main-content',
  label = 'Skip to content',
  className,
}: SkipToContentProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        // Visually hidden by default
        'sr-only',
        // Visible on focus
        'focus:not-sr-only',
        'focus:fixed focus:top-4 focus:left-4 focus:z-[100]',
        // Styling when visible
        'focus:bg-background focus:text-foreground',
        'focus:px-4 focus:py-2 focus:rounded-md',
        'focus:border focus:border-border',
        'focus:shadow-lg',
        // Focus ring
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        // Transition
        'transition-all',
        className
      )}
    >
      {label}
    </a>
  );
}
