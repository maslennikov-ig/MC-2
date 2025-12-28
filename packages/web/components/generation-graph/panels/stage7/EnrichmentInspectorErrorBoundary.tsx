/**
 * EnrichmentInspectorErrorBoundary Component
 *
 * Error boundary to catch and gracefully handle errors in the
 * enrichment inspector panel and its child components.
 *
 * @module components/generation-graph/panels/stage7/EnrichmentInspectorErrorBoundary
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Optional fallback for custom error UI */
  fallback?: ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for enrichment inspector components.
 *
 * Catches JavaScript errors in child component tree and displays
 * a user-friendly error message with recovery options.
 *
 * @example
 * ```tsx
 * <EnrichmentInspectorErrorBoundary>
 *   <EnrichmentInspectorPanel lessonId="lesson-123" />
 * </EnrichmentInspectorErrorBoundary>
 * ```
 */
export class EnrichmentInspectorErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error for debugging
    console.error('[EnrichmentInspector] Error caught:', error);
    console.error('[EnrichmentInspector] Component stack:', errorInfo.componentStack);

    // Call optional error handler (e.g., for Sentry logging)
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-6 text-center">
          <div className="h-12 w-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 mb-4">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Enrichment Panel Error
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6 text-sm">
            Something went wrong while displaying the enrichments panel.
            Your data is safe. Try resetting the panel.
          </p>
          <Button onClick={this.handleRetry} variant="outline">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Panel
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default EnrichmentInspectorErrorBoundary;
