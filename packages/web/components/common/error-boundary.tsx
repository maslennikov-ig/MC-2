'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { logger } from '@/lib/client-logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error?: Error, resetError?: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  isolate?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Uncaught error:', error, errorInfo);
    
    // Call optional error handler
    this.props.onError?.(error, errorInfo);
    
    // In production, you might want to send error to logging service
    if (process.env.NODE_ENV === 'production') {
      // logErrorToService(error, errorInfo);
    }
  }

  private resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      // Handle function fallback
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.resetError);
      }
      
      // Handle ReactNode fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      const containerClasses = this.props.isolate
        ? 'p-4 border border-red-200 rounded-lg bg-red-50'
        : 'min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500';

      return (
        <div className={containerClasses}>
          <div className={this.props.isolate ? 'text-center' : 'bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4'}>
            <div className="text-center">
              <div className="mb-4">
                <AlertTriangle className={`mx-auto text-red-500 ${this.props.isolate ? 'w-8 h-8' : 'w-16 h-16'}`} />
              </div>
              <h2 className={`font-bold text-gray-900 mb-2 ${this.props.isolate ? 'text-lg' : 'text-2xl'}`}>
                Что-то пошло не так
              </h2>
              <p className="text-gray-600 mb-4">
                {this.props.isolate 
                  ? 'Этот компонент временно недоступен'
                  : 'Произошла непредвиденная ошибка. Пожалуйста, попробуйте обновить страницу.'
                }
              </p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="text-left bg-gray-100 rounded-lg p-4 mb-4">
                  <summary className="cursor-pointer font-semibold text-gray-700">
                    Подробности ошибки (dev mode)
                  </summary>
                  <pre className="mt-2 text-xs text-gray-600 overflow-auto max-h-32">
                    {this.state.error.toString()}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={this.resetError}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Повторить
                </Button>
                
                {!this.props.isolate && (
                  <Button
                    onClick={() => window.location.reload()}
                    variant="default"
                    size="sm"
                  >
                    Обновить страницу
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Specialized error boundaries for specific use cases
export function CourseErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        logger.error('Course component error:', { error, errorInfo });
      }}
      isolate
    >
      {children}
    </ErrorBoundary>
  );
}

export function VideoErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(_error, resetError) => (
        <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
          <div className="text-center">
            <AlertTriangle className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-600 mb-4">Видеоплеер недоступен</p>
            <Button onClick={resetError} variant="outline" size="sm">
              Попробовать снова
            </Button>
          </div>
        </div>
      )}
      onError={(error) => {
        logger.error('Video player error:', error);
      }}
      isolate
    >
      {children}
    </ErrorBoundary>
  );
}

export function ContentErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(_error, resetError) => (
        <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
            <span className="text-yellow-800">Контент временно недоступен</span>
            <Button 
              onClick={resetError} 
              variant="ghost" 
              size="sm" 
              className="ml-auto"
            >
              Обновить
            </Button>
          </div>
        </div>
      )}
      isolate
    >
      {children}
    </ErrorBoundary>
  );
}