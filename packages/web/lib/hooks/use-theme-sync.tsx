'use client'

import { useTheme } from 'next-themes'
import { useCallback, useEffect, useState } from 'react'

/**
 * Return type for useThemeSync hook
 * Provides type-safe theme management with hydration safety
 */
export interface UseThemeSyncReturn {
  /** User's theme preference: 'light' | 'dark' | 'system' */
  theme: string
  /** Actual applied theme (resolves 'system' to actual value): 'light' | 'dark' */
  resolvedTheme: 'light' | 'dark'
  /** Set theme preference */
  setTheme: (theme: string) => void
  /** Toggle between light and dark (ignores system) */
  toggleTheme: () => void
  /** Whether current theme is 'system' */
  isSystemTheme: boolean
  /** System preference if available: 'light' | 'dark' | undefined */
  systemTheme: 'light' | 'dark' | undefined
  /** Whether component is mounted (safe to render theme-dependent UI) */
  mounted: boolean
}

/**
 * Custom hook for theme synchronization across all components.
 *
 * IMPORTANT: This is the ONLY hook that should be used for theme access.
 * Do NOT use useTheme from next-themes directly - it causes hydration errors.
 *
 * @example
 * ```tsx
 * const { resolvedTheme, mounted, toggleTheme } = useThemeSync()
 *
 * // Always check mounted before rendering theme-dependent UI
 * if (!mounted) return <Skeleton />
 *
 * return <div className={resolvedTheme === 'dark' ? 'bg-black' : 'bg-white'}>
 *   <button onClick={toggleTheme}>Toggle</button>
 * </div>
 * ```
 */
export function useThemeSync(): UseThemeSyncReturn {
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Ensure component is mounted before using theme
  // This prevents hydration mismatch because server doesn't know the theme
  useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * Toggle between light and dark theme.
   * If current theme is 'system', switches based on resolved value.
   */
  const toggleTheme = useCallback(() => {
    const currentResolved = resolvedTheme || 'light'
    const newTheme = currentResolved === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }, [resolvedTheme, setTheme])

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

  // CRITICAL: Return safe default values when not mounted
  // This prevents hydration mismatch - server and initial client render match
  if (!mounted) {
    return {
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: () => {},
      toggleTheme: () => {},
      isSystemTheme: false,
      systemTheme: undefined,
      mounted: false,
    }
  }

  // After mounting, return actual values
  return {
    theme: theme || 'light',
    resolvedTheme: (resolvedTheme as 'light' | 'dark') || 'light',
    setTheme,
    toggleTheme,
    isSystemTheme: theme === 'system',
    systemTheme: systemTheme as 'light' | 'dark' | undefined,
    mounted: true,
  }
}
