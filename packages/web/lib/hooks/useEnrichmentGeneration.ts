'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { TRPCClientError } from '@trpc/client'
import { getBrowserTrpcClient } from '@/lib/trpc/browser-client'
import type { OnDemandEnrichmentType, GenerationStep } from '@megacampus/shared-types'

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

/** Frontend-only step for when resuming tracking (waiting for first poll) */
type FrontendOnlyStep = 'syncing'

export interface GeneratingEnrichment {
  enrichmentId: string
  type: OnDemandEnrichmentType
  progress: number
  currentStep?: GenerationStep | FrontendOnlyStep
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
  // State for currently generating enrichments (by type)
  const [generating, setGenerating] = useState<Map<string, GeneratingEnrichment>>(new Map())

  // Track types that just completed generation (for showing skeleton instead of placeholder)
  // This bridges the gap between generation complete and data refetch
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set())

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true)

  // Track polling intervals by type
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Track AbortControllers for fetch cancellation
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  // Track poll failure counts for exponential backoff
  const pollFailuresRef = useRef<Map<string, number>>(new Map())

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

  // Reset state when lessonId changes (user navigates to different lesson)
  // This prevents generation state from "leaking" between lessons
  useEffect(() => {
    // Clear all polling and abort controllers
    abortControllersRef.current.forEach((controller) => controller.abort())
    abortControllersRef.current.clear()
    pollingIntervalsRef.current.forEach((interval) => clearInterval(interval))
    pollingIntervalsRef.current.clear()
    pollFailuresRef.current.clear()

    // Reset generating state
    setGenerating(new Map())
    setRecentlyCompleted(new Set())
  }, [lessonId])

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
          const client = getBrowserTrpcClient()
          const status = (await client.enrichment.getGenerationStatus.query(
            { enrichmentId },
            { signal: controller.signal }
          )) as GenerationStatusResponse | undefined

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

            // Mark as recently completed to show skeleton instead of placeholder
            // while data is being refetched
            setRecentlyCompleted((prev) => new Set(prev).add(type))

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
    [pollingInterval, onComplete, onError, stopPolling]
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
        const client = getBrowserTrpcClient()
        const data = (await client.enrichment.generateOnDemand.mutate(
          { lessonId, enrichmentType: type, settings: settings || {} },
          { signal: controller.signal }
        )) as GenerateOnDemandResponse | undefined

        abortControllersRef.current.delete(`generate-${type}`)

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

        if (error instanceof TRPCClientError) {
          onError?.(error.message)
        } else {
          onError?.(error instanceof Error ? error.message : 'Failed to start generation')
        }
        return null
      }
    },
    [lessonId, onError, generating, startPolling]
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
        const client = getBrowserTrpcClient()
        await client.enrichment.cancel.mutate({ enrichmentId: gen.enrichmentId })
      } catch (error) {
        devLog.error('Cancel error:', error)

        if (error instanceof TRPCClientError) {
          // Surface permission errors to the user
          if (error.message.includes('permission') || error.message.includes('forbidden')) {
            onError?.('You do not have permission to cancel this generation')
          }
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
    },
    [generating, onError, stopPolling]
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

      // Add to generating state with unknown progress (-1 means "syncing")
      // Real progress will be fetched on first poll
      setGenerating((prev) => {
        const next = new Map(prev)
        next.set(type, {
          enrichmentId,
          type,
          progress: -1, // -1 indicates "loading progress", not actual 0%
          currentStep: 'syncing',
        })
        return next
      })

      // Start polling for this enrichment (isResume = true for context-aware errors)
      startPolling(type, enrichmentId, true)
    },
    [generating, startPolling]
  )

  /**
   * Check if a type just completed generation
   * Used to show skeleton instead of placeholder while data refetches
   */
  const isRecentlyCompleted = useCallback(
    (type: string): boolean => recentlyCompleted.has(type),
    [recentlyCompleted]
  )

  /**
   * Clear recently completed status for a type
   * Called by parent component when new data arrives with the image
   */
  const clearRecentlyCompleted = useCallback((type: string) => {
    setRecentlyCompleted((prev) => {
      const next = new Set(prev)
      next.delete(type)
      return next
    })
  }, [])

  return {
    generating,
    startGeneration,
    cancelGeneration,
    isGenerating,
    getProgress,
    resumeGeneration,
    isRecentlyCompleted,
    clearRecentlyCompleted,
  }
}
