import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class GenerationGraphErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // In production, log to monitoring service (e.g. Sentry)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle size={24} />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Graph Visualization Error</h2>
          <p className="mb-6 max-w-md text-slate-500">
            Something went wrong while rendering the pipeline graph. The generation process is
            likely still running in the background.
          </p>
          <Button onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      )
    }

    return this.props.children
  }
}
