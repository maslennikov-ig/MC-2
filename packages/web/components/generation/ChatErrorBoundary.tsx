'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

interface Props {
  children: React.ReactNode
  onReset?: () => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class ChatErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Chat component error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-background fixed right-0 bottom-0 left-0 z-40 border-t p-4 shadow-lg">
          <div className="mx-auto flex max-w-md items-center justify-between">
            <div className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">Chat Error</span>
            </div>
            <Button size="sm" variant="outline" onClick={this.handleReset} className="gap-1">
              <RefreshCcw className="h-3 w-3" />
              Reset
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
