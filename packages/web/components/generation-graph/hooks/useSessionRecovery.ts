import { useEffect, useCallback } from 'react'
import { useReactFlow, Viewport } from '@xyflow/react'

const STORAGE_KEY_PREFIX = 'graph_viewport_'

type UseSessionRecoveryOptions = {
  restoreOnMount?: boolean
}

/**
 * Persists graph viewport position to localStorage per course.
 * Restores position only when explicitly enabled; default workflow loads rely on fitView.
 * T120: Persist graph positions to localStorage per TRD Open Question #1
 */
export function useSessionRecovery(
  courseId?: string,
  { restoreOnMount = false }: UseSessionRecoveryOptions = {}
) {
  const { setViewport, getViewport } = useReactFlow()
  const storageKey = courseId ? `${STORAGE_KEY_PREFIX}${courseId}` : `${STORAGE_KEY_PREFIX}default`

  // Save viewport to localStorage
  const saveViewport = useCallback(() => {
    try {
      const viewport = getViewport()
      localStorage.setItem(storageKey, JSON.stringify(viewport))
    } catch (e) {
      // localStorage might be full or disabled - log for debugging
      console.debug(
        '[useSessionRecovery] Failed to save viewport:',
        e instanceof Error ? e.message : 'Unknown error'
      )
    }
  }, [getViewport, storageKey])

  // Save periodically and on unmount
  useEffect(() => {
    const interval = setInterval(saveViewport, 2000)

    // Save on page unload
    const handleBeforeUnload = () => saveViewport()
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      saveViewport() // Save on unmount
    }
  }, [saveViewport])

  // Restoring stale viewport on workflow load fights the initial fit-to-workflow behavior.
  // Keep persistence available for explicit future opt-in, but default reloads to a clean fit.
  useEffect(() => {
    if (!restoreOnMount) {
      try {
        localStorage.removeItem(storageKey)
      } catch (e) {
        console.debug(
          '[useSessionRecovery] Failed to clear saved viewport:',
          e instanceof Error ? e.message : 'Unknown error'
        )
      }
      return
    }

    // Try localStorage first
    const saved = localStorage.getItem(storageKey)

    if (saved) {
      try {
        const viewport = JSON.parse(saved) as Viewport
        if (viewport.x !== undefined && viewport.zoom !== undefined) {
          // Set viewport immediately
          void setViewport(viewport)
        }
      } catch (e) {
        // Invalid storage data - log for debugging
        console.debug(
          '[useSessionRecovery] Failed to parse viewport:',
          e instanceof Error ? e.message : 'Unknown error'
        )
      }
    }
  }, [restoreOnMount, setViewport, storageKey])
}
