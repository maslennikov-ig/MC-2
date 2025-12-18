'use client';

import { useState, useCallback } from 'react';

export type DegradationMode = 'full' | 'polling' | 'static';

interface UseGracefulDegradationReturn {
  degradationMode: DegradationMode;
  handleRealtimeFailure: () => void;
  handlePollingFailure: () => void;
  reset: () => void;
  statusMessage: string | null;
}

export function useGracefulDegradation(): UseGracefulDegradationReturn {
  const [mode, setMode] = useState<DegradationMode>('full');

  const handleRealtimeFailure = useCallback(() => {
    setMode('polling');
  }, []);

  const handlePollingFailure = useCallback(() => {
    setMode('static');
  }, []);

  const reset = useCallback(() => {
    setMode('full');
  }, []);

  const statusMessage = mode === 'full'
    ? null
    : mode === 'polling'
      ? 'Live updates temporarily unavailable. Refreshing periodically.'
      : 'Unable to fetch updates. Showing last known state.';

  return {
    degradationMode: mode,
    handleRealtimeFailure,
    handlePollingFailure,
    reset,
    statusMessage
  };
}
