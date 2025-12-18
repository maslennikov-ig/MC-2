'use client';

import React, { createContext, useContext, RefObject, ReactNode } from 'react';

interface FullscreenContextValue {
  /** Container ref for portaling dialogs in fullscreen mode */
  portalContainerRef: RefObject<HTMLDivElement | null>;
  /** Whether the graph is currently in fullscreen mode */
  isFullscreen: boolean;
}

const FullscreenContext = createContext<FullscreenContextValue | null>(null);

export function useFullscreenContext() {
  const context = useContext(FullscreenContext);
  if (!context) {
    // Return defaults if not wrapped - modal will portal to body
    return {
      portalContainerRef: { current: null },
      isFullscreen: false
    };
  }
  return context;
}

interface FullscreenProviderProps {
  children: ReactNode;
  portalContainerRef: RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
}

export function FullscreenProvider({ children, portalContainerRef, isFullscreen }: FullscreenProviderProps) {
  return (
    <FullscreenContext.Provider value={{ portalContainerRef, isFullscreen }}>
      {children}
    </FullscreenContext.Provider>
  );
}
