'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSupabase } from '@/lib/supabase/browser-client'
import type { OnDemandEnrichmentType, GenerationStep } from '@megacampus/shared-types'

// Backend URL for tRPC calls (client-side)
const BACKEND_URL = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL || 'http://localhost:3456'
const TRPC_URL = `${BACKEND_URL}/trpc`

// Polling configuration
const DEFAULT_POLLING_INTERVAL = 2000 // 2 seconds
const MAX_POLL_FAILURES = 5
const MAX_BACKOFF_INTERVAL = 10000 // 10 seconds

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
  // Get session from Supabase provider for auth headers
  const { session } = useSupabase()

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
   */
  const getAuthHeaders = useCallback((): Record<string, string> => {
    return {
      'Content-Type': 'application/json',
      Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
    }
  }, [session])

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

    const controller = abortControllersRef.current.get(type)
    if (controller) {
      controller.abort()
      abortControllersRef.current.delete(type)
    }

    pollFailuresRef.current.delete(type)
  }, [])

  /**
   * Start polling for generation status
   */
  const startPolling = useCallback(
    (type: OnDemandEnrichmentType, enrichmentId: string) => {
      // Guard: Don't start polling if unmounted
      if (!mountedRef.current) {
        console.warn('[useEnrichmentGeneration] Attempted to start polling after unmount')
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
          const headers = getAuthHeaders()

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

          console.error('[useEnrichmentGeneration] Poll error:', error)

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

            onError?.('Lost connection to server. Please refresh and try again.')
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
    [pollingInterval, onComplete, onError, getAuthHeaders, stopPolling]
  )

  /**
   * Start generation for a specific enrichment type
   */
  const startGeneration = useCallback(
    async (
      type: OnDemandEnrichmentType,
      settings?: Record<string, unknown>
    ): Promise<string | null> => {
      // Guard: Prevent concurrent generation for same type
      if (generating.has(type)) {
        console.warn('[useEnrichmentGeneration] Generation already in progress for type:', type)
        return null
      }

      // Create AbortController for this request
      const controller = new AbortController()
      abortControllersRef.current.set(`generate-${type}`, controller)

      try {
        const headers = getAuthHeaders()

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
          console.error('[useEnrichmentGeneration] Generate failed:', errorText)

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
          onError?.('Invalid response from server')
          return null
        }

        // Add to generating map
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

        console.error('[useEnrichmentGeneration] Error:', error)
        onError?.(error instanceof Error ? error.message : 'Failed to start generation')
        return null
      }
    },
    [lessonId, onError, getAuthHeaders, generating, startPolling]
  )

  /**
   * Cancel generation for a specific enrichment type
   */
  const cancelGeneration = useCallback(
    async (type: string) => {
      const gen = generating.get(type)
      if (!gen) return

      // Stop polling immediately
      stopPolling(type)

      try {
        const headers = getAuthHeaders()

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
            console.warn('[useEnrichmentGeneration] Cancel endpoint not implemented')
          } else if (response.status === 403) {
            onError?.('You do not have permission to cancel this generation')
          } else {
            console.error('[useEnrichmentGeneration] Cancel failed:', response.status)
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
        console.error('[useEnrichmentGeneration] Cancel error:', error)
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

  return {
    generating,
    startGeneration,
    cancelGeneration,
    isGenerating,
    getProgress,
  }
}
