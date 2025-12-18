'use client';

import { useState, useEffect, useRef } from 'react';
import { GenerationTrace } from '@/components/generation-celestial/utils';

const POLLING_INTERVAL = 5000; // 5 seconds

export function useFallbackPolling(
  courseId: string,
  isRealtimeConnected: boolean
): GenerationTrace[] {
  const [polledTraces, setPolledTraces] = useState<GenerationTrace[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    // If realtime is connected, don't poll
    if (isRealtimeConnected) {
      return;
    }

    // Fallback polling function
    const pollTraces = async () => {
      try {
        const response = await fetch(`/api/courses/${courseId}/traces`);
        if (response.ok) {
          const data = await response.json();
          setPolledTraces(data.traces || []);
        }
      } catch (_err) {
        // Silently fail on polling errors
      }
    };

    // Poll immediately, then at interval
    pollTraces();
    pollingRef.current = setInterval(pollTraces, POLLING_INTERVAL);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [courseId, isRealtimeConnected]);

  return polledTraces;
}
