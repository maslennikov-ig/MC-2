/**
 * EnrichmentInspectorErrorBoundary Component
 *
 * Error boundary to catch and gracefully handle errors in the
 * enrichment inspector panel and its child components.
 *
 * @module components/generation-graph/panels/stage7/EnrichmentInspectorErrorBoundary
 */

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  /** Optional fallback for custom error UI */
  fallback?: ReactNode
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
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
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error for debugging
    console.error('[EnrichmentInspector] Error caught:', error)
    console.error('[EnrichmentInspector] Component stack:', errorInfo.componentStack)

    // Call optional error handler (e.g., for Sentry logging)
    this.props.onError?.(error, errorInfo)
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-slate-900">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <AlertTriangle size={24} />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Enrichment Panel Error
          </h2>
          <p className="mb-6 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Something went wrong while displaying the enrichments panel. Your data is safe. Try
            resetting the panel.
          </p>
          <Button onClick={this.handleRetry} variant="outline">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset Panel
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

export default EnrichmentInspectorErrorBoundary
