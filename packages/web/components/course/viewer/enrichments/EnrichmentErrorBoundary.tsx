'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
  enrichmentType: string;
  enrichmentId?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class EnrichmentErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Enrichment error:', {
      type: this.props.enrichmentType,
      id: this.props.enrichmentId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-orange-200 dark:border-orange-800/30 bg-orange-50 dark:bg-orange-900/10">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-orange-800 dark:text-orange-200">
                  Не удалось загрузить {this.props.enrichmentType}
                </p>
                <p className="text-sm text-orange-600 dark:text-orange-300 mt-1">
                  Произошла ошибка при отображении материала
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 gap-2"
                  onClick={this.handleRetry}
                >
                  <RefreshCw className="w-4 h-4" />
                  Попробовать снова
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
