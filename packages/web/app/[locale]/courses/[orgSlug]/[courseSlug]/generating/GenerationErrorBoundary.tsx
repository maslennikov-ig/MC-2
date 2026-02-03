'use client'

import React, { Component, ReactNode } from 'react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw, Home, Mail } from 'lucide-react'
import { Link } from '@/src/i18n/navigation'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  errorCount: number
  lastError: Date | null
}

class GenerationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      lastError: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorCount: 0,
      lastError: new Date(),
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Error will be logged to monitoring service
    // In production, this would be sent to error tracking service

    // Update state with error details
    this.setState((prevState) => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }))

    // Store error in sessionStorage for recovery
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(
        'lastGenerationError',
        JSON.stringify({
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        })
      )
    }
  }

  handleReset = () => {
    // Clear error from sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('lastGenerationError')
    }

    // Call parent reset handler if provided
    if (this.props.onReset) {
      this.props.onReset()
    }

    // Reset state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50/30 to-orange-50/30 py-12 dark:from-gray-900 dark:via-red-950/20 dark:to-orange-950/20">
          <div className="container mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <Alert variant="destructive" className="border-2">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle className="text-lg font-semibold">Something went wrong</AlertTitle>
              <AlertDescription className="mt-3 space-y-4">
                <p className="text-sm">
                  {this.state.error?.message ||
                    'An unexpected error occurred while generating your course.'}
                </p>

                {this.state.errorCount > 2 && (
                  <div className="rounded-md bg-red-50 p-3 dark:bg-red-950/30">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200">
                      Multiple errors detected
                    </p>
                    <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                      The application has encountered {this.state.errorCount} errors. A page reload
                      is recommended.
                    </p>
                  </div>
                )}

                {/* Error details for debugging (only in development) */}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-400">
                      Technical Details
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}

                <div className="flex flex-wrap gap-3 pt-4">
                  <Button onClick={this.handleReload} variant="default" size="sm" className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Reload Page
                  </Button>

                  <Button onClick={this.handleReset} variant="outline" size="sm" className="gap-2">
                    Try Again
                  </Button>

                  <Button asChild variant="ghost" size="sm" className="gap-2">
                    <Link href="/courses">
                      <Home className="h-4 w-4" />
                      Back to Courses
                    </Link>
                  </Button>
                </div>

                <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    If this problem persists, please{' '}
                    <a
                      href="mailto:support@ai.megacampus.ru?subject=Generation Error"
                      className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <Mail className="mr-1 inline h-3 w-3" />
                      contact support
                    </a>
                  </p>
                </div>
              </AlertDescription>
            </Alert>

            {/* Additional help content */}
            <div className="mt-8 space-y-4">
              <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Common Solutions
                </h3>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-green-500">•</span>
                    <span>Check your internet connection is stable</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-green-500">•</span>
                    <span>Clear your browser cache and cookies</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-green-500">•</span>
                    <span>Try using a different browser</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-green-500">•</span>
                    <span>Disable browser extensions temporarily</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default GenerationErrorBoundary
