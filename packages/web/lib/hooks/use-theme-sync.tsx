'use client'

import { useTheme } from 'next-themes'
import { useCallback, useEffect, useState } from 'react'

/**
 * Custom hook for theme synchronization across all components
 * Provides a single source of truth for theme management
 * Uses next-themes which handles localStorage persistence
 */
export function useThemeSync() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Ensure component is mounted before using theme
  useEffect(() => {
    setMounted(true)
  }, [])

  // Get effective theme (handles system theme)
  // Use theme directly since we disabled system theme in provider
  const effectiveTheme = theme || 'light'

  /**
   * Toggle between light and dark theme
   * Convenience method for theme toggle buttons
   */
  const toggleTheme = useCallback(() => {
    const newTheme = effectiveTheme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }, [effectiveTheme, setTheme])

  /**
   * Listen for storage events to sync theme across tabs
   */
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'theme' && e.newValue) {
        setTheme(e.newValue)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [setTheme])

  // Return safe theme value only when mounted
  if (!mounted) {
    return {
      theme: 'light',
      setTheme: () => {},
      toggleTheme: () => {},
      isSystemTheme: false,
      mounted: false
    }
  }

  return {
    theme: effectiveTheme,
    setTheme,
    toggleTheme,
    isSystemTheme: theme === 'system',
    mounted: true
  }
}