'use client'

import { useState, useEffect } from 'react'

/**
 * Hook to track browser tab visibility state.
 * Returns true when the tab is visible, false when hidden.
 * Useful for pausing animations or heavy operations when user switches tabs.
 */
export function useTabVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
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
