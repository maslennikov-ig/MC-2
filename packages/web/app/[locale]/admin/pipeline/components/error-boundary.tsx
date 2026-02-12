/**
 * ErrorBoundary Component
 *
 * React Error Boundary for graceful error handling in Pipeline Admin.
 *
 * Features:
 * - Catches JavaScript errors in component tree
 * - Displays friendly error UI with details
 * - Provides retry button to reset error state
 * - Logs errors for debugging
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 *
 * @module app/admin/pipeline/components/error-boundary
 */

'use client'

import { Component, ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

/**
 * Error Boundary component that catches React errors
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  /**
   * Update state when error is caught
   */
  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    }
  }

  /**
   * Log error details
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error Boundary caught an error:', error)
    console.error('Error Info:', errorInfo)
    this.setState({
      error,
      errorInfo,
    })
  }

  /**
   * Reset error state
   */
  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="flex justify-center">
              <div className="bg-destructive/10 rounded-full p-4">
                <AlertCircle className="text-destructive h-12 w-12" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">Something went wrong</h2>
              <p className="text-muted-foreground">
                An unexpected error occurred while rendering this component.
              </p>
            </div>

            {/* Error details (development only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="bg-muted/50 rounded-lg border p-4 text-left">
                <p className="mb-2 text-sm font-medium">Error Details:</p>
                <pre className="text-destructive max-h-32 overflow-auto text-xs">
                  {this.state.error.message}
                </pre>
                {this.state.errorInfo && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium">
                      Component Stack
                    </summary>
                    <pre className="text-muted-foreground mt-1 max-h-32 overflow-auto text-xs">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-center gap-2">
              <Button onClick={this.handleReset} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button onClick={() => window.location.reload()}>Reload Page</Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
