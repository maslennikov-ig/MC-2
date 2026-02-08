'use client'

import { useEffect } from 'react'

/**
 * Hides the initial HTML loader after React hydration completes.
 * This component should be placed early in the component tree.
 *
 * IMPORTANT: We only hide the loader, NOT remove it from DOM.
 * Removing DOM elements created via dangerouslySetInnerHTML causes
 * React hydration errors when router.refresh() is called.
 */
export function InitialLoaderHide() {
  useEffect(() => {
    // Small delay to ensure smooth transition
    const timer = setTimeout(() => {
      const loader = document.getElementById('initial-loader')
      if (loader) {
        loader.classList.add('hidden')
        // NOTE: Do NOT call loader.remove() here!
        // It causes "insertBefore/removeChild" errors when React
        // tries to reconcile DOM after router.refresh() on auth changes.
        // The loader stays in DOM but hidden (display: none via CSS).
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  return null
}
