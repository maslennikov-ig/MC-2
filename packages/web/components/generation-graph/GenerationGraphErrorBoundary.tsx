import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GenerationGraphErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // In production, log to monitoring service (e.g. Sentry)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Graph Visualization Error</h2>
          <p className="text-slate-500 max-w-md mb-6">
            Something went wrong while rendering the pipeline graph. 
            The generation process is likely still running in the background.
          </p>
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
