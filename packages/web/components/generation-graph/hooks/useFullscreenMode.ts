'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseFullscreenModeReturn {
  isFullscreen: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  toggleFullscreen: () => void
}

/**
 * Hook for managing fullscreen mode in the graph view.
 * Handles browser fullscreen API and syncs state with fullscreen events.
 */
export function useFullscreenMode(): UseFullscreenModeReturn {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err)
      })
    } else {
      void document.exitFullscreen()
    }
  }, [])

  // Sync fullscreen state with browser
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  return { isFullscreen, containerRef, toggleFullscreen }
}
