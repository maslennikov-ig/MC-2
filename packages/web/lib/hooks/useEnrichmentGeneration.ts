'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSupabase } from '@/lib/supabase/browser-client'
import type { OnDemandEnrichmentType, GenerationStep } from '@megacampus/shared-types'

// Backend URL for tRPC calls (client-side)
const BACKEND_URL = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL || 'http://localhost:3456'
const TRPC_URL = `${BACKEND_URL}/trpc`

interface UseEnrichmentGenerationOptions {
  lessonId: string
  courseId: string
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
 * @example
 * ```tsx
 * const { generating, startGeneration, cancelGeneration, isGenerating } = useEnrichmentGeneration({
 *   lessonId: 'lesson-uuid',
 *   courseId: 'course-uuid',
 *   onComplete: (enrichmentId) => refetchEnrichments(),
 *   onError: (error) => toast.error(error),
 * });
 * ```
 */
export function useEnrichmentGeneration({
  lessonId,
  courseId: _courseId, // Reserved for future use (e.g., permission checks)
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
      // Clear all polling intervals on unmount
      pollingIntervalsRef.current.forEach((interval) => clearInterval(interval))
      pollingIntervalsRef.current.clear()
    }
  }, [])

  /**
   * Start generation for a specific enrichment type
   */
  const startGeneration = useCallback(
    async (
      type: OnDemandEnrichmentType,
      settings?: Record<string, unknown>
    ): Promise<string | null> => {
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
        })

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
        console.error('[useEnrichmentGeneration] Error:', error)
        onError?.(error instanceof Error ? error.message : 'Failed to start generation')
        return null
      }
    },
    [lessonId, onError, getAuthHeaders]
  )

  /**
   * Start polling for generation status
   */
  const startPolling = useCallback(
    (type: OnDemandEnrichmentType, enrichmentId: string) => {
      // Clear existing interval for this type if any
      const existingInterval = pollingIntervalsRef.current.get(type)
      if (existingInterval) {
        clearInterval(existingInterval)
      }

      const pollStatus = async () => {
        if (!mountedRef.current) return

        try {
          const headers = getAuthHeaders()

          const response = await fetch(
            `${TRPC_URL}/enrichment.getGenerationStatus?input=${encodeURIComponent(
              JSON.stringify({ enrichmentId })
            )}`,
            {
              method: 'GET',
              headers,
            }
          )

          if (!response.ok) {
            console.error('[useEnrichmentGeneration] Status poll failed')
            return
          }

          const result = await response.json()
          const status = result.result?.data as GenerationStatusResponse | undefined

          if (!status || !mountedRef.current) return

          if (status.status === 'completed') {
            // Stop polling and remove from generating
            const interval = pollingIntervalsRef.current.get(type)
            if (interval) {
              clearInterval(interval)
              pollingIntervalsRef.current.delete(type)
            }

            setGenerating((prev) => {
              const next = new Map(prev)
              next.delete(type)
              return next
            })

            onComplete?.(enrichmentId)
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            // Stop polling and remove from generating
            const interval = pollingIntervalsRef.current.get(type)
            if (interval) {
              clearInterval(interval)
              pollingIntervalsRef.current.delete(type)
            }

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
          console.error('[useEnrichmentGeneration] Poll error:', error)
        }
      }

      // Poll immediately, then every 2 seconds
      void pollStatus()
      const interval = setInterval(() => void pollStatus(), 2000)
      pollingIntervalsRef.current.set(type, interval)
    },
    [onComplete, onError, getAuthHeaders]
  )

  /**
   * Cancel generation for a specific enrichment type
   */
  const cancelGeneration = useCallback(
    async (type: string) => {
      const gen = generating.get(type)
      if (!gen) return

      // Stop polling immediately
      const interval = pollingIntervalsRef.current.get(type)
      if (interval) {
        clearInterval(interval)
        pollingIntervalsRef.current.delete(type)
      }

      try {
        const headers = getAuthHeaders()

        await fetch(`${TRPC_URL}/enrichment.cancel`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            enrichmentId: gen.enrichmentId,
          }),
        })

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
    [generating, getAuthHeaders]
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
