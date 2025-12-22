'use client';

import React, { Component, ReactNode } from 'react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Home, Mail } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorCount: number;
  lastError: Date | null;
}

class GenerationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      lastError: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorCount: 0,
      lastError: new Date(),
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Error will be logged to monitoring service
    // In production, this would be sent to error tracking service

    // Update state with error details
    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Store error in sessionStorage for recovery
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('lastGenerationError', JSON.stringify({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  handleReset = () => {
    // Clear error from sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('lastGenerationError');
    }

    // Call parent reset handler if provided
    if (this.props.onReset) {
      this.props.onReset();
    }

    // Reset state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50/30 to-orange-50/30 dark:from-gray-900 dark:via-red-950/20 dark:to-orange-950/20 py-12">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
            <Alert variant="destructive" className="border-2">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle className="text-lg font-semibold">
                Something went wrong
              </AlertTitle>
              <AlertDescription className="mt-3 space-y-4">
                <p className="text-sm">
                  {this.state.error?.message || 'An unexpected error occurred while generating your course.'}
                </p>

                {this.state.errorCount > 2 && (
                  <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-md">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200">
                      Multiple errors detected
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                      The application has encountered {this.state.errorCount} errors.
                      A page reload is recommended.
                    </p>
                  </div>
                )}

                {/* Error details for debugging (only in development) */}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mt-4">
                    <summary className="text-xs font-medium cursor-pointer text-gray-600 dark:text-gray-400">
                      Technical Details
                    </summary>
                    <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto max-h-48">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}

                <div className="flex flex-wrap gap-3 pt-4">
                  <Button
                    onClick={this.handleReload}
                    variant="default"
                    size="sm"
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reload Page
                  </Button>

                  <Button
                    onClick={this.handleReset}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    Try Again
                  </Button>

                  <Link href="/courses">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                    >
                      <Home className="h-4 w-4" />
                      Back to Courses
                    </Button>
                  </Link>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    If this problem persists, please{' '}
                    <a
                      href="mailto:support@megacampus.ai?subject=Generation Error"
                      className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                    >
                      <Mail className="inline h-3 w-3 mr-1" />
                      contact support
                    </a>
                  </p>
                </div>
              </AlertDescription>
            </Alert>

            {/* Additional help content */}
            <div className="mt-8 space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Common Solutions
                </h3>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Check your internet connection is stable</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Clear your browser cache and cookies</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Try using a different browser</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Disable browser extensions temporarily</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GenerationErrorBoundary;