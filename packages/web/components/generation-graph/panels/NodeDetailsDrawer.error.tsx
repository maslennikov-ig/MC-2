import React, { Component, ErrorInfo, ReactNode } from 'react'

/**
 * Error Boundary for LessonPanelWithTabs
 * Catches render errors and displays fallback UI instead of crashing the whole app
 */
interface LessonPanelErrorBoundaryProps {
  children: ReactNode
  lessonId: string
  onBack?: () => void
}

interface LessonPanelErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class LessonPanelErrorBoundary extends Component<
  LessonPanelErrorBoundaryProps,
  LessonPanelErrorBoundaryState
> {
  constructor(props: LessonPanelErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): LessonPanelErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('LessonPanelWithTabs error:', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="text-red-500">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Failed to load lesson
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Lesson ID: {this.props.lessonId}
          </p>
          {this.props.onBack && (
            <button
              onClick={this.props.onBack}
              className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Go back to module
            </button>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
