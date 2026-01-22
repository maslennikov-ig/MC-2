'use client'

import { useState, useEffect } from 'react'

/**
 * Hook to track browser tab visibility state.
 * Returns true when the tab is visible, false when hidden.
 * Useful for pausing animations or heavy operations when user switches tabs.
 *
 * SSR-safe: Returns true during server-side rendering and in environments
 * where document is not available.
 */
export function useTabVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(() => {
    // SSR safety: default to visible when document is not available
    if (typeof document === 'undefined') return true
    return !document.hidden
  })

  useEffect(() => {
    // SSR safety: skip if document is not available
    if (typeof document === 'undefined') return

    // Set initial state based on current visibility
    setIsVisible(!document.hidden)

    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return isVisible
}
