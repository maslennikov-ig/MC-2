import * as React from 'react';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LinkProps } from '../types';

/**
 * Check if a URL is external (has http/https protocol)
 * Works on both server and client side
 */
function isExternalUrl(href: string): boolean {
  if (!href) return false;

  // Relative URLs are internal
  if (href.startsWith('/') || href.startsWith('#') || href.startsWith('.')) {
    return false;
  }

  // Check for absolute URLs with protocol
  return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//');
}

/**
 * Link Component
 *
 * Smart link component that differentiates between internal and external links.
 * - Internal links: Uses Next.js Link for client-side navigation
 * - External links: Opens in new tab with security attributes and visual indicator
 *
 * @example
 * ```tsx
 * // Internal link
 * <Link href="/about">About Us</Link>
 *
 * // External link (auto-detected)
 * <Link href="https://github.com">GitHub</Link>
 * ```
 */
export function Link({ href, children, className, title }: LinkProps) {
  // Handle empty or anchor-only links
  if (!href || href === '#') {
    return (
      <span className={className} title={title}>
        {children}
      </span>
    );
  }

  const isExternal = isExternalUrl(href);

  // Base link styles with focus indicators
  const linkClasses = cn(
    // Default prose link styling
    'text-primary underline underline-offset-4 decoration-primary/50',
    'hover:decoration-primary transition-colors',
    // Focus styles for keyboard navigation
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'rounded-sm', // For visible focus ring
    className
  );

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(linkClasses, 'inline-flex items-center gap-1')}
        title={title}
      >
        {children}
        <ExternalLinkIcon
          className="h-3.5 w-3.5 flex-shrink-0"
          aria-hidden="true"
        />
        <span className="sr-only">(opens in new tab)</span>
      </a>
    );
  }

  // Internal link - use regular anchor tag
  // Next.js Link has strict typing that conflicts with dynamic markdown hrefs
  return (
    <a href={href} className={linkClasses} title={title}>
      {children}
    </a>
  );
}
