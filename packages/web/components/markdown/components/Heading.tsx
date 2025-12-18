'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { Link2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HeadingProps } from '../types';

/**
 * Heading component with anchor link support
 *
 * Renders semantic headings (h1-h6) with hover-reveal anchor links.
 * Works with rehype-slug for auto-generated IDs and provides
 * copy-to-clipboard functionality for sharing deep links.
 *
 * @example
 * ```tsx
 * <Heading level={2} id="getting-started" showAnchor>
 *   Getting Started
 * </Heading>
 * ```
 */
export function Heading({
  level,
  id,
  children,
  showAnchor = true,
  className,
}: HeadingProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(
    async (e: React.MouseEvent | React.KeyboardEvent) => {
      // Only copy on Ctrl/Cmd + Click, otherwise let default anchor behavior happen
      if ('ctrlKey' in e && !e.ctrlKey && !e.metaKey) {
        // Normal click - just navigate (don't prevent default)
        return;
      }
      e.preventDefault();
      if (!id) return;

      const url = `${window.location.origin}${window.location.pathname}#${id}`;

      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback: update URL in address bar
        window.location.hash = id;
      }
    },
    [id]
  );

  // Create the heading element based on level
  const Tag = `h${level}` as const;

  // Base styles for the heading with anchor link
  const headingClasses = cn(
    'group relative scroll-mt-20',
    className
  );

  // Anchor link button styles
  const anchorClasses = cn(
    'absolute -left-6 top-1/2 -translate-y-1/2',
    'opacity-0 group-hover:opacity-100 focus:opacity-100',
    'transition-opacity duration-200',
    'text-muted-foreground hover:text-primary',
    'p-1 -ml-1 rounded',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
  );

  return (
    <Tag id={id} className={headingClasses}>
      {showAnchor && id && (
        <a
          href={`#${id}`}
          onClick={handleCopyLink}
          className={anchorClasses}
          aria-label={copied ? "Link copied to clipboard" : `Copy link to ${typeof children === 'string' ? children : 'this section'}`}
          aria-live="polite"
          title={copied ? "Copied!" : "Ctrl+Click to copy link"}
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
        </a>
      )}
      {children}
    </Tag>
  );
}

/**
 * Create heading components for each level (h1-h6)
 * These can be used directly in MDX component maps
 */
export const H1 = (props: Omit<HeadingProps, 'level'>) => (
  <Heading {...props} level={1} />
);

export const H2 = (props: Omit<HeadingProps, 'level'>) => (
  <Heading {...props} level={2} />
);

export const H3 = (props: Omit<HeadingProps, 'level'>) => (
  <Heading {...props} level={3} />
);

export const H4 = (props: Omit<HeadingProps, 'level'>) => (
  <Heading {...props} level={4} />
);

export const H5 = (props: Omit<HeadingProps, 'level'>) => (
  <Heading {...props} level={5} />
);

export const H6 = (props: Omit<HeadingProps, 'level'>) => (
  <Heading {...props} level={6} />
);
