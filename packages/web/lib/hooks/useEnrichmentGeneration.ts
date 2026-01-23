'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSupabase } from '@/lib/supabase/browser-client'
import type { OnDemandEnrichmentType, GenerationStep } from '@megacampus/shared-types'

// Backend URL for tRPC calls (client-side)
// In production: uses '/api' (nginx proxies /api/trpc to API server)
// In development: uses env var or localhost:3456
const BACKEND_URL = (() => {
  // 1. If NEXT_PUBLIC_* is set → use it (CI/CD sets at build time)
  const url = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL
  if (url) return url // → '/api' for production builds

  // 2. Fallback: runtime detection by hostname
  if (typeof window !== 'undefined') {
    const isProduction =
      window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    if (isProduction) return '/api' // Relative URL - nginx proxies /api/trpc to API
  }

  // 3. Development fallback
  return 'http://localhost:3456'
})()
const TRPC_URL = `${BACKEND_URL}/trpc`

// Polling configuration
const DEFAULT_POLLING_INTERVAL = 2000 // 2 seconds
const MAX_POLL_FAILURES = 5
const MAX_BACKOFF_INTERVAL = 10000 // 10 seconds

// Optimistic UI prefix for temporary IDs before API response
const OPTIMISTIC_ID_PREFIX = 'optimistic-'

// Development-only logger to avoid exposing internal logic in production
const devLog = {
  warn: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[useEnrichmentGeneration]', ...args)
    }
  },
  error: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[useEnrichmentGeneration]', ...args)
    }
  },
}

interface UseEnrichmentGenerationOptions {
  lessonId: string
  courseId: string
  /** Polling interval in milliseconds (default: 2000) */
  pollingInterval?: number
  onComplete?: (enrichmentId: string) => void
  onError?: (error: string) => void
}

export interface GeneratingEnrichment {
  enrichmentId: string
  type: OnDemandEnrichmentType
  progress: number
  currentStep?: GenerationStep
}

interface GenerateOnDemandResponse {
  enrichmentId: string
  status: string
  jobId?: string
}

interface GenerationStatusResponse {
  status: string
  progress: number
  currentStep?: GenerationStep
  estimatedTimeRemaining?: number
  error?: string
}

/**
 * Hook for managing on-demand enrichment generation
 *
 * Provides state management for generating enrichments from placeholder cards.
 * Handles starting generation, polling for status, and cancellation.
 *
 * Features:
 * - Race condition protection (prevents duplicate generations)
 * - Exponential backoff on polling errors
 * - AbortController for request cancellation
 * - Proper cleanup on unmount
 *
 * @example
 * ```tsx
 * const { generating, startGeneration, cancelGeneration, isGenerating } = useEnrichmentGeneration({
 *   lessonId: 'lesson-uuid',
 *   courseId: 'course-uuid',
 *   pollingInterval: 2000,
 *   onComplete: (enrichmentId) => refetchEnrichments(),
 *   onError: (error) => toast.error(error),
 * });
 * ```
 */
export function useEnrichmentGeneration({
  lessonId,
  courseId: _courseId, // Reserved for future use (e.g., permission checks)
  pollingInterval = DEFAULT_POLLING_INTERVAL,
  onComplete,
  onError,
}: UseEnrichmentGenerationOptions) {
  // Get supabase client for auth operations
  const { supabase } = useSupabase()

  // State for currently generating enrichments (by type)
  const [generating, setGenerating] = useState<Map<string, GeneratingEnrichment>>(new Map())

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true)

  // Track polling intervals by type
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Track AbortControllers for fetch cancellation
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  // Track poll failure counts for exponential backoff
  const pollFailuresRef = useRef<Map<string, number>>(new Map())

  /**
   * Get auth headers for backend requests
   * Always fetches fresh session to avoid stale token issues during long polling
   */
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
    }
  }, [supabase])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false

      // Abort all pending requests
      abortControllersRef.current.forEach((controller) => controller.abort())
      abortControllersRef.current.clear()

      // Clear all polling intervals
      pollingIntervalsRef.current.forEach((interval) => clearInterval(interval))
      pollingIntervalsRef.current.clear()
    }
  }, [])

  /**
   * Stop polling and cleanup for a specific type
   */
  const stopPolling = useCallback((type: string) => {
    const interval = pollingIntervalsRef.current.get(type)
    if (interval) {
      clearInterval(interval)
      pollingIntervalsRef.current.delete(type)
    }

    // Clean up polling-phase controller
    const controller = abortControllersRef.current.get(type)
    if (controller) {
      controller.abort()
      abortControllersRef.current.delete(type)
    }

    // Clean up generate-phase controller (prevents memory leak in optimistic phase)
    const generateController = abortControllersRef.current.get(`generate-${type}`)
    if (generateController) {
      generateController.abort()
      abortControllersRef.current.delete(`generate-${type}`)
    }

    pollFailuresRef.current.delete(type)
  }, [])

  /**
   * Start polling for generation status
   * @param type - Enrichment type
   * @param enrichmentId - UUID of enrichment to poll
   * @param isResume - If true, this is a resume after page reload (affects error messages)
   */
  const startPolling = useCallback(
    (type: OnDemandEnrichmentType, enrichmentId: string, isResume = false) => {
      // Guard: Don't start polling if unmounted
      if (!mountedRef.current) {
        devLog.warn('Attempted to start polling after unmount')
        return
      }

      // Clear existing interval for this type if any
      stopPolling(type)

      // Reset failure count
      pollFailuresRef.current.set(type, 0)

      let currentInterval = pollingInterval

      const pollStatus = async () => {
        if (!mountedRef.current) return

        // Create new AbortController for this poll
        const controller = new AbortController()
        abortControllersRef.current.set(type, controller)

        try {
          // Always get fresh token to avoid stale token during long polling
          const headers = await getAuthHeaders()

          const response = await fetch(
            `${TRPC_URL}/enrichment.getGenerationStatus?input=${encodeURIComponent(
              JSON.stringify({ enrichmentId })
            )}`,
            {
              method: 'GET',
              headers,
              signal: controller.signal,
            }
          )

          // Handle 401 Unauthorized - try to refresh session
          if (response.status === 401) {
            devLog.warn('401 Unauthorized during polling, attempting session refresh')
            const { data, error } = await supabase.auth.refreshSession()
            if (!error && data.session) {
              // Refresh succeeded - retry immediately without counting as failure
              devLog.warn('Session refreshed successfully, retrying poll')
              void pollStatus()
              return
            }
            // Refresh failed - treat as auth error
            devLog.error('Session refresh failed:', error)
            stopPolling(type)
            setGenerating((prev) => {
              const next = new Map(prev)
              next.delete(type)
              return next
            })
            onError?.('Session expired. Please log in again.')
            return
          }

          if (!response.ok) {
            throw new Error(`Status poll failed: ${response.status}`)
          }

          const result = await response.json()
          const status = result.result?.data as GenerationStatusResponse | undefined

          if (!status || !mountedRef.current) return

          // Reset failure count on success
          pollFailuresRef.current.set(type, 0)
          currentInterval = pollingInterval

          if (status.status === 'completed') {
            stopPolling(type)

            setGenerating((prev) => {
              const next = new Map(prev)
              next.delete(type)
              return next
            })

            onComplete?.(enrichmentId)
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            stopPolling(type)

            setGenerating((prev) => {
              const next = new Map(prev)
              next.delete(type)
              return next
            })

            if (status.status === 'failed') {
              onError?.(status.error || 'Generation failed')
            }
          } else {
            // Update progress
            setGenerating((prev) => {
              const next = new Map(prev)
              const current = next.get(type)
              if (current) {
                next.set(type, {
                  ...current,
                  progress: status.progress,
                  currentStep: status.currentStep,
                })
              }
              return next
            })
          }
        } catch (error) {
          // Ignore abort errors
          if (error instanceof Error && error.name === 'AbortError') {
            return
          }

          devLog.error('Poll error:', error)

          const failures = (pollFailuresRef.current.get(type) || 0) + 1
          pollFailuresRef.current.set(type, failures)

          if (failures >= MAX_POLL_FAILURES) {
            // Stop polling after too many failures
            stopPolling(type)

            setGenerating((prev) => {
              const next = new Map(prev)
              next.delete(type)
              return next
            })

            // #8 fix: Context-aware error message
            const errorMessage = isResume
              ? `Failed to resume ${type} generation. The enrichment may have been deleted or completed.`
              : 'Lost connection to server. Please refresh and try again.'
            onError?.(errorMessage)
          } else {
            // Exponential backoff
            currentInterval = Math.min(currentInterval * 1.5, MAX_BACKOFF_INTERVAL)
          }
        }
      }

      // Poll immediately, then at configured interval
      void pollStatus()
      const interval = setInterval(() => void pollStatus(), currentInterval)
      pollingIntervalsRef.current.set(type, interval)
    },
    [pollingInterval, onComplete, onError, getAuthHeaders, stopPolling, supabase]
  )

  /**
   * Start generation for a specific enrichment type
   *
   * Uses optimistic UI update pattern:
   * 1. Immediately shows loading state with temporary ID
   * 2. Makes API request
   * 3. Updates with real enrichmentId on success, or removes on failure
   */
  const startGeneration = useCallback(
    async (
      type: OnDemandEnrichmentType,
      settings?: Record<string, unknown>
    ): Promise<string | null> => {
      // Guard: Prevent concurrent generation for same type
      if (generating.has(type)) {
        devLog.warn('Generation already in progress for type:', type)
        return null
      }

      // OPTIMISTIC UPDATE: Immediately show loading state with temporary ID
      const optimisticId = `${OPTIMISTIC_ID_PREFIX}${type}-${Date.now()}`
      if (mountedRef.current) {
        setGenerating((prev) => {
          const next = new Map(prev)
          next.set(type, {
            enrichmentId: optimisticId,
            type,
            progress: 0,
            currentStep: 'queued',
          })
          return next
        })
      }

      // Create AbortController for this request
      const controller = new AbortController()
      abortControllersRef.current.set(`generate-${type}`, controller)

      try {
        const headers = await getAuthHeaders()

        const response = await fetch(`${TRPC_URL}/enrichment.generateOnDemand`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            lessonId,
            enrichmentType: type,
            settings: settings || {},
          }),
          signal: controller.signal,
        })

        abortControllersRef.current.delete(`generate-${type}`)

        if (!response.ok) {
          const errorText = await response.text()
          devLog.error('Generate failed:', errorText)

          // ROLLBACK: Remove optimistic state on error
          if (mountedRef.current) {
            setGenerating((prev) => {
              const next = new Map(prev)
              next.delete(type)
              return next
            })
          }

          // Try to parse error message from tRPC response
          let errorMessage = 'Failed to start generation'
          try {
            const errorJson = JSON.parse(errorText)
            if (errorJson.error?.message) {
              errorMessage = errorJson.error.message
            }
          } catch {
            // Keep default error message
          }

          onError?.(errorMessage)
          return null
        }

        const result = await response.json()
        const data = result.result?.data as GenerateOnDemandResponse | undefined

        if (!data?.enrichmentId) {
          // ROLLBACK: Remove optimistic state on invalid response
          if (mountedRef.current) {
            setGenerating((prev) => {
              const next = new Map(prev)
              next.delete(type)
              return next
            })
          }
          onError?.('Invalid response from server')
          return null
        }

        // UPDATE: Replace optimistic ID with real enrichmentId
        if (mountedRef.current) {
          setGenerating((prev) => {
            const next = new Map(prev)
            next.set(type, {
              enrichmentId: data.enrichmentId,
              type,
              progress: 0,
              currentStep: 'queued',
            })
            return next
          })
        }

        // Start polling for this enrichment
        startPolling(type, data.enrichmentId)

        return data.enrichmentId
      } catch (error) {
        abortControllersRef.current.delete(`generate-${type}`)

        // Ignore abort errors
        if (error instanceof Error && error.name === 'AbortError') {
          return null
        }

        // ROLLBACK: Remove optimistic state on error
        if (mountedRef.current) {
          setGenerating((prev) => {
            const next = new Map(prev)
            next.delete(type)
            return next
          })
        }

        devLog.error('Error:', error)
        onError?.(error instanceof Error ? error.message : 'Failed to start generation')
        return null
      }
    },
    [lessonId, onError, getAuthHeaders, generating, startPolling]
  )

  /**
   * Cancel generation for a specific enrichment type
   *
   * Handles both optimistic phase (before API response) and active generation.
   * In optimistic phase, only cleans up frontend state without backend call.
   */
  const cancelGeneration = useCallback(
    async (type: string) => {
      const gen = generating.get(type)
      if (!gen) return

      // Stop polling immediately
      stopPolling(type)

      // Check if still in optimistic phase (no backend job exists yet)
      if (gen.enrichmentId.startsWith(OPTIMISTIC_ID_PREFIX)) {
        // Only clean up frontend state - no backend call needed
        if (mountedRef.current) {
          setGenerating((prev) => {
            const next = new Map(prev)
            next.delete(type)
            return next
          })
        }
        return
      }

      // Backend job exists - send cancel request
      try {
        const headers = await getAuthHeaders()

        const response = await fetch(`${TRPC_URL}/enrichment.cancel`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            enrichmentId: gen.enrichmentId,
          }),
        })

        // Handle different response statuses
        if (!response.ok) {
          if (response.status === 404) {
            // Cancel endpoint not implemented - that's OK, we already stopped polling
            devLog.warn('Cancel endpoint not implemented')
          } else if (response.status === 403) {
            onError?.('You do not have permission to cancel this generation')
          } else {
            devLog.error('Cancel failed:', response.status)
          }
        }

        // Always remove from UI regardless of backend response
        if (mountedRef.current) {
          setGenerating((prev) => {
            const next = new Map(prev)
            next.delete(type)
            return next
          })
        }
      } catch (error) {
        devLog.error('Cancel error:', error)
        // Still remove from UI even if cancel fails
        if (mountedRef.current) {
          setGenerating((prev) => {
            const next = new Map(prev)
            next.delete(type)
            return next
          })
        }
      }
    },
    [generating, getAuthHeaders, onError, stopPolling]
  )

  /**
   * Check if a specific type is currently generating
   */
  const isGenerating = useCallback((type: string) => generating.has(type), [generating])

  /**
   * Get progress info for a specific type
   */
  const getProgress = useCallback((type: string) => generating.get(type), [generating])

  /**
   * Resume generation polling for an existing enrichment
   *
   * Used to restore progress tracking on page reload for enrichments
   * that are already being generated (status: pending, draft_generating,
   * draft_ready, or generating).
   *
   * Does NOT call backend to start new generation - only starts polling
   * for status updates of an existing enrichment.
   *
   * Race Condition Protection:
   * - Guards against resuming if already tracking the same type
   * - Guards against resuming after unmount
   *
   * Note: Currently only one enrichment per type is supported.
   * If multiple enrichments of the same type exist, only the first
   * will be tracked (others are silently ignored with a dev warning).
   *
   * @param enrichmentId - UUID of the existing enrichment
   * @param type - Type of enrichment (for UI state management)
   *
   * @example
   * ```tsx
   * // Auto-resume on mount for active enrichments
   * useEffect(() => {
   *   const active = enrichments.filter(e =>
   *     isActiveGenerationStatus(e.status) && isOnDemandType(e.enrichment_type)
   *   )
   *   active.forEach(e => {
   *     resumeGeneration(e.id, e.enrichment_type)
   *   })
   * }, [enrichments, resumeGeneration])
   * ```
   */
  const resumeGeneration = useCallback(
    (enrichmentId: string, type: OnDemandEnrichmentType) => {
      // Guard: Don't resume if already tracking this type
      if (generating.has(type)) {
        devLog.warn('Already tracking generation for type:', type)
        return
      }

      // Guard: Don't resume if unmounted
      if (!mountedRef.current) {
        devLog.warn('Attempted to resume generation after unmount')
        return
      }

      // Add to generating state with initial progress
      setGenerating((prev) => {
        const next = new Map(prev)
        next.set(type, {
          enrichmentId,
          type,
          progress: 0,
          currentStep: 'queued',
        })
        return next
      })

      // Start polling for this enrichment (isResume = true for context-aware errors)
      startPolling(type, enrichmentId, true)
    },
    [generating, startPolling]
  )

  return {
    generating,
    startGeneration,
    cancelGeneration,
    isGenerating,
    getProgress,
    resumeGeneration,
  }
}
