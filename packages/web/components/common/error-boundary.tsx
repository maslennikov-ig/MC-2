'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { logger } from '@/lib/client-logger'

interface Props {
  children: ReactNode
  fallback?: ReactNode | ((error?: Error, resetError?: () => void) => ReactNode)
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  isolate?: boolean
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Uncaught error:', error, errorInfo)

    // Call optional error handler
    this.props.onError?.(error, errorInfo)

    // In production, you might want to send error to logging service
    if (process.env.NODE_ENV === 'production') {
      // logErrorToService(error, errorInfo);
    }
  }

  private resetError = () => {
    this.setState({ hasError: false, error: undefined })
  }

  public render() {
    if (this.state.hasError) {
      // Handle function fallback
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.resetError)
      }

      // Handle ReactNode fallback
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      const containerClasses = this.props.isolate
        ? 'p-4 border border-red-200 rounded-lg bg-red-50'
        : 'min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500'

      return (
        <div className={containerClasses}>
          <div
            className={
              this.props.isolate
                ? 'text-center'
                : 'mx-4 w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-2xl backdrop-blur-sm'
            }
          >
            <div className="text-center">
              <div className="mb-4">
                <AlertTriangle
                  className={`mx-auto text-red-500 ${this.props.isolate ? 'h-8 w-8' : 'h-16 w-16'}`}
                />
              </div>
              <h2
                className={`mb-2 font-bold text-gray-900 ${this.props.isolate ? 'text-lg' : 'text-2xl'}`}
              >
                Что-то пошло не так
              </h2>
              <p className="mb-4 text-gray-600">
                {this.props.isolate
                  ? 'Этот компонент временно недоступен'
                  : 'Произошла непредвиденная ошибка. Пожалуйста, попробуйте обновить страницу.'}
              </p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mb-4 rounded-lg bg-gray-100 p-4 text-left">
                  <summary className="cursor-pointer font-semibold text-gray-700">
                    Подробности ошибки (dev mode)
                  </summary>
                  <pre className="mt-2 max-h-32 overflow-auto text-xs text-gray-600">
                    {this.state.error.toString()}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
              <div className="flex justify-center gap-2">
                <Button onClick={this.resetError} variant="outline" size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Повторить
                </Button>

                {!this.props.isolate && (
                  <Button onClick={() => window.location.reload()} variant="default" size="sm">
                    Обновить страницу
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Specialized error boundaries for specific use cases
export function CourseErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        logger.error('Course component error:', { error, errorInfo })
      }}
      isolate
    >
      {children}
    </ErrorBoundary>
  )
}

export function VideoErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(_error, resetError) => (
        <div className="flex h-64 items-center justify-center rounded-lg bg-gray-100">
          <div className="text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-gray-500" />
            <p className="mb-4 text-gray-600">Видеоплеер недоступен</p>
            <Button onClick={resetError} variant="outline" size="sm">
              Попробовать снова
            </Button>
          </div>
        </div>
      )}
      onError={(error) => {
        logger.error('Video player error:', error)
      }}
      isolate
    >
      {children}
    </ErrorBoundary>
  )
}

export function ContentErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(_error, resetError) => (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-center">
            <AlertTriangle className="mr-2 h-5 w-5 text-yellow-600" />
            <span className="text-yellow-800">Контент временно недоступен</span>
            <Button onClick={resetError} variant="ghost" size="sm" className="ml-auto">
              Обновить
            </Button>
          </div>
        </div>
      )}
      isolate
    >
      {children}
    </ErrorBoundary>
  )
}
