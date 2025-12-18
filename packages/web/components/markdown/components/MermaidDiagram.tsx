'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type { MermaidDiagramProps } from '../types';

/**
 * Lazy-loaded MermaidIframe component
 *
 * Loaded dynamically to avoid server-side rendering issues with Mermaid
 * and to reduce initial bundle size for pages that don't use diagrams.
 */
const MermaidIframe = dynamic(
  () => import('./MermaidIframe').then((mod) => ({ default: mod.MermaidIframe })),
  {
    ssr: false, // Mermaid requires client-side execution
    loading: () => <MermaidSkeleton />,
  }
);

/**
 * Loading skeleton displayed while MermaidIframe component is being loaded
 *
 * Shows a placeholder with animated pulse effect to indicate loading state.
 */
function MermaidSkeleton() {
  return (
    <div className="mermaid-skeleton flex items-center justify-center min-h-[200px] bg-muted/50 rounded-lg animate-pulse">
      <div className="text-muted-foreground text-sm">Loading diagram...</div>
    </div>
  );
}

/**
 * Error fallback component displayed when Mermaid diagram fails to render
 *
 * Shows a user-friendly error message and the raw chart code for debugging.
 * This helps identify syntax errors in Mermaid diagrams.
 *
 * @param chart - The Mermaid chart syntax that failed to render
 */
function MermaidError({ chart }: { chart: string }) {
  return (
    <div className="mermaid-error border border-destructive/50 bg-destructive/10 rounded-lg p-4">
      <div className="text-destructive font-medium mb-2">Diagram Error</div>
      <div className="text-muted-foreground text-sm mb-2">
        Failed to render Mermaid diagram. Check the syntax.
      </div>
      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
        {chart}
      </pre>
    </div>
  );
}

/**
 * Error boundary to catch rendering errors from MermaidIframe
 *
 * Catches errors that occur during diagram rendering and displays
 * a user-friendly error message with the chart code for debugging.
 */
class MermaidErrorBoundary extends React.Component<
  { children: React.ReactNode; chart: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; chart: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for debugging purposes
    console.error('Mermaid diagram rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <MermaidError chart={this.props.chart} />;
    }
    return this.props.children;
  }
}

/**
 * MermaidDiagram component for rendering Mermaid diagrams
 *
 * This is the public-facing wrapper component that handles lazy loading,
 * loading states, and error boundaries for Mermaid diagrams.
 *
 * Features:
 * - Lazy loads MermaidIframe to reduce bundle size
 * - Shows skeleton loader while component loads
 * - Catches and displays errors gracefully
 * - Validates chart input before rendering
 *
 * @example
 * ```tsx
 * <MermaidDiagram
 *   chart="graph TD\n  A-->B\n  B-->C"
 *   ariaLabel="Flow diagram showing A to B to C"
 * />
 * ```
 *
 * @param chart - Mermaid syntax definition for the diagram
 * @param className - Optional custom CSS classes for styling
 * @param ariaLabel - Accessible label describing the diagram content
 */
export function MermaidDiagram({ chart, className, ariaLabel }: MermaidDiagramProps) {
  // Basic validation - return null for empty/invalid input
  if (!chart || chart.trim() === '') {
    return null;
  }

  return (
    <MermaidErrorBoundary chart={chart}>
      <div className={cn('mermaid-wrapper my-6', className)}>
        <MermaidIframe chart={chart} className={className} ariaLabel={ariaLabel} />
      </div>
    </MermaidErrorBoundary>
  );
}
