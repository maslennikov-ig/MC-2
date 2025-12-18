'use client';

import { useCallback, useRef } from 'react';
import { useReactFlow, Viewport } from '@xyflow/react';

interface UseViewportPreservationReturn {
  preserveViewport: () => void;
  restoreViewport: () => void;
}

export function useViewportPreservation(): UseViewportPreservationReturn {
  const { getViewport, setViewport } = useReactFlow();
  const savedViewport = useRef<Viewport | null>(null);

  const preserveViewport = useCallback(() => {
    savedViewport.current = getViewport();
  }, [getViewport]);

  const restoreViewport = useCallback(() => {
    if (savedViewport.current) {
      requestAnimationFrame(() => {
        if (savedViewport.current) {
          setViewport(savedViewport.current, { duration: 0 });
        }
      });
    }
  }, [setViewport]);

  return { preserveViewport, restoreViewport };
}
