'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Props {
  children: React.ReactNode
  enrichmentType: string
  enrichmentId?: string
  locale?: 'ru' | 'en'
}

interface State {
  hasError: boolean
  error?: Error
}

export class EnrichmentErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Enrichment error:', {
      type: this.props.enrichmentType,
      id: this.props.enrichmentId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      const translations = {
        ru: {
          loadFailed: 'Не удалось загрузить ' + this.props.enrichmentType,
          displayError: 'Произошла ошибка при отображении материала',
          retry: 'Попробовать снова',
        },
        en: {
          loadFailed: 'Failed to load ' + this.props.enrichmentType,
          displayError: 'An error occurred while displaying the material',
          retry: 'Try again',
        },
      }
      const t = translations[this.props.locale || 'en']

      return (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800/30 dark:bg-orange-900/10">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-orange-100 p-2 dark:bg-orange-900/30">
                <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-orange-800 dark:text-orange-200">{t.loadFailed}</p>
                <p className="mt-1 text-sm text-orange-600 dark:text-orange-300">
                  {t.displayError}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 gap-2"
                  onClick={this.handleRetry}
                >
                  <RefreshCw className="h-4 w-4" />
                  {t.retry}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}
