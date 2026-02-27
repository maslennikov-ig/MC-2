'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { TRPCClientError } from '@trpc/client'
import { getBrowserTrpcClient } from '@/lib/trpc/browser-client'
import { createLogger } from '@/lib/client-logger'
import type { OnDemandEnrichmentType, GenerationStep } from '@megacampus/shared-types'

// Polling configuration
const DEFAULT_POLLING_INTERVAL = 2000 // 2 seconds
const MAX_POLL_FAILURES = 5
const MAX_BACKOFF_INTERVAL = 10000 // 10 seconds
const NLM_AUDIO_MAX_DURATION_MS = 60 * 60 * 1000 // 60 minutes
const NLM_VIDEO_MAX_DURATION_MS = 60 * 60 * 1000 // 60 minutes
const MAX_GENERATING_ENTRIES = 50 // Safety cap for allGenerating Map

// Optimistic UI prefix for temporary IDs before API response
const OPTIMISTIC_ID_PREFIX = 'optimistic-'
const log = createLogger({ hook: 'useEnrichmentGeneration' })

export function getMaxDurationForType(type: OnDemandEnrichmentType): number | undefined {
  switch (type) {
    case 'nlm_audio':
      return NLM_AUDIO_MAX_DURATION_MS
    case 'nlm_video':
      return NLM_VIDEO_MAX_DURATION_MS
    default:
      return undefined
  }
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof Error) {
    const normalizedMessage = error.message.toLowerCase()
    if (error.name === 'AbortError') return true
    if (normalizedMessage.includes('signal is aborted')) return true
    if (normalizedMessage.includes('operation was aborted')) return true
  }

  return false
}

function getGenerationKey(lessonId: string, type: string): string {
  return `${lessonId}:${type}`
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
  startedAtMs: number
  maxDurationMs?: number
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
  // State for currently generating enrichments (keyed by lessonId:type)
  const [allGenerating, setAllGenerating] = useState<Map<string, GeneratingEnrichment>>(new Map())

  // Track types that just completed generation (for showing skeleton instead of placeholder)
  // This bridges the gap between generation complete and data refetch
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set())

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true)
  const lessonIdRef = useRef(lessonId)
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)
  const generatingRef = useRef(allGenerating)

  // Track polling intervals by type
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Track AbortControllers for fetch cancellation
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  // Track poll failure counts for exponential backoff
  const pollFailuresRef = useRef<Map<string, number>>(new Map())

  // Evict stale entries from allGenerating when it exceeds safety cap.
  // Keeps entries for the current lesson, removes oldest entries first.
  const evictStaleEntries = useCallback(
    (map: Map<string, GeneratingEnrichment>): Map<string, GeneratingEnrichment> => {
      if (map.size <= MAX_GENERATING_ENTRIES) return map
      const currentPrefix = `${lessonIdRef.current}:`
      const entries = [...map.entries()]
      // Sort by startedAtMs ascending (oldest first), but keep current lesson entries
      entries.sort((a, b) => {
        const aIsCurrent = a[0].startsWith(currentPrefix)
        const bIsCurrent = b[0].startsWith(currentPrefix)
        if (aIsCurrent && !bIsCurrent) return 1 // keep current lesson last
        if (!aIsCurrent && bIsCurrent) return -1
        return a[1].startedAtMs - b[1].startedAtMs
      })
      // Keep only the last MAX_GENERATING_ENTRIES entries
      const trimmed = entries.slice(entries.length - MAX_GENERATING_ENTRIES)
      return new Map(trimmed)
    },
    []
  )

  useEffect(() => {
    lessonIdRef.current = lessonId
  }, [lessonId])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    generatingRef.current = allGenerating
  }, [allGenerating])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false

      // Abort all pending requests
      abortControllersRef.current.forEach((controller) => controller.abort())
      abortControllersRef.current.clear()

      // Clear all polling timeouts
      pollingIntervalsRef.current.forEach((handle) => clearTimeout(handle))
      pollingIntervalsRef.current.clear()
    }
  }, [])

  /**
   * Stop polling and cleanup for a specific type
   */
  const stopPolling = useCallback((generationKey: string) => {
    const handle = pollingIntervalsRef.current.get(generationKey)
    if (handle) {
      clearTimeout(handle)
      pollingIntervalsRef.current.delete(generationKey)
    }

    // Clean up polling-phase controller
    const controller = abortControllersRef.current.get(generationKey)
    if (controller) {
      controller.abort()
      abortControllersRef.current.delete(generationKey)
    }

    // Clean up generate-phase controller (prevents memory leak in optimistic phase)
    const generateController = abortControllersRef.current.get(`generate-${generationKey}`)
    if (generateController) {
      generateController.abort()
      abortControllersRef.current.delete(`generate-${generationKey}`)
    }

    pollFailuresRef.current.delete(generationKey)
  }, [])

  /**
   * Start polling for generation status
   * @param type - Enrichment type
   * @param enrichmentId - UUID of enrichment to poll
   * @param isResume - If true, this is a resume after page reload (affects error messages)
   */
  const startPolling = useCallback(
    (
      type: OnDemandEnrichmentType,
      enrichmentId: string,
      isResume = false,
      targetLessonId = lessonIdRef.current
    ) => {
      // Guard: Don't start polling if unmounted
      if (!mountedRef.current) {
        log.warn('Attempted to start polling after unmount')
        return
      }

      const generationKey = getGenerationKey(targetLessonId, type)

      // Clear existing interval for this type if any
      stopPolling(generationKey)

      // Reset failure count
      pollFailuresRef.current.set(generationKey, 0)

      let currentInterval = pollingInterval

      const pollStatus = async () => {
        if (!mountedRef.current) return

        // Create new AbortController for this poll
        const controller = new AbortController()
        abortControllersRef.current.set(generationKey, controller)

        try {
          const client = getBrowserTrpcClient()
          const status = (await client.enrichment.getGenerationStatus.query(
            { enrichmentId },
            { signal: controller.signal }
          )) as GenerationStatusResponse | undefined

          if (!status || !mountedRef.current) return

          // Reset failure count on success
          pollFailuresRef.current.set(generationKey, 0)
          currentInterval = pollingInterval

          if (status.status === 'completed') {
            stopPolling(generationKey)

            setAllGenerating((prev) => {
              const next = new Map(prev)
              next.delete(generationKey)
              return next
            })

            // Mark as recently completed to show skeleton instead of placeholder
            // while data is being refetched
            setRecentlyCompleted((prev) => new Set(prev).add(generationKey))

            onCompleteRef.current?.(enrichmentId)
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            stopPolling(generationKey)

            setAllGenerating((prev) => {
              const next = new Map(prev)
              next.delete(generationKey)
              return next
            })

            if (status.status === 'failed') {
              onErrorRef.current?.(status.error || 'Generation failed')
            }
          } else {
            // Update progress
            setAllGenerating((prev) => {
              const next = new Map(prev)
              const current = next.get(generationKey)
              if (current) {
                next.set(generationKey, {
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
          if (isAbortLikeError(error)) {
            return
          }

          // Distinguish permanent (NOT_FOUND = enrichment deleted) from transient errors
          // (server restart, network issue). Only permanent errors count toward stop limit.
          const isNotFound = error instanceof TRPCClientError && error.data?.code === 'NOT_FOUND'

          if (isNotFound) {
            log.error('Poll error (enrichment not found):', error)

            const failures = (pollFailuresRef.current.get(generationKey) || 0) + 1
            pollFailuresRef.current.set(generationKey, failures)

            if (failures >= MAX_POLL_FAILURES) {
              stopPolling(generationKey)

              setAllGenerating((prev) => {
                const next = new Map(prev)
                next.delete(generationKey)
                return next
              })

              const errorMessage = isResume
                ? `Failed to resume ${type} generation. The enrichment may have been deleted or completed.`
                : 'Lost connection to server. Please refresh and try again.'
              onErrorRef.current?.(errorMessage)
            }
          } else {
            // Transient error (server restart, network) — backoff but keep retrying indefinitely
            log.warn('Poll error (transient, will retry):', error)
            currentInterval = Math.min(currentInterval * 2, MAX_BACKOFF_INTERVAL)
          }
        }
      }

      // Schedule next poll after current one completes.
      // Uses recursive setTimeout (not setInterval) so that currentInterval
      // mutations from backoff logic are applied to each subsequent delay.
      const scheduleNext = () => {
        if (!mountedRef.current) return
        const handle = setTimeout(() => {
          void pollStatus().then(scheduleNext)
        }, currentInterval)
        pollingIntervalsRef.current.set(generationKey, handle)
      }

      // Poll immediately, then schedule recursively
      void pollStatus().then(scheduleNext)
    },
    [pollingInterval, stopPolling]
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
      const currentLessonId = lessonIdRef.current
      if (!currentLessonId) {
        onErrorRef.current?.('Lesson is required to start generation')
        return null
      }

      const generationKey = getGenerationKey(currentLessonId, type)

      // Guard: Prevent concurrent generation for same type
      if (generatingRef.current.has(generationKey)) {
        log.warn('Generation already in progress for type:', type)
        return null
      }

      // OPTIMISTIC UPDATE: Immediately show loading state with temporary ID
      const optimisticId = `${OPTIMISTIC_ID_PREFIX}${type}-${Date.now()}`
      const generationStartedAtMs = Date.now()
      const maxDurationMs = getMaxDurationForType(type)
      if (mountedRef.current) {
        setAllGenerating((prev) => {
          const next = new Map(prev)
          next.set(generationKey, {
            enrichmentId: optimisticId,
            type,
            progress: 0,
            currentStep: 'queued',
            startedAtMs: generationStartedAtMs,
            maxDurationMs,
          })
          return evictStaleEntries(next)
        })
      }

      // Create AbortController for this request
      const controller = new AbortController()
      abortControllersRef.current.set(`generate-${generationKey}`, controller)

      try {
        const client = getBrowserTrpcClient()
        const data = (await client.enrichment.generateOnDemand.mutate(
          {
            lessonId: currentLessonId,
            enrichmentType: type,
            settings: settings && Object.keys(settings).length > 0 ? settings : undefined,
          },
          { signal: controller.signal }
        )) as GenerateOnDemandResponse | undefined

        abortControllersRef.current.delete(`generate-${generationKey}`)

        if (!data?.enrichmentId) {
          // ROLLBACK: Remove optimistic state on invalid response
          if (mountedRef.current) {
            setAllGenerating((prev) => {
              const next = new Map(prev)
              next.delete(generationKey)
              return next
            })
          }
          onErrorRef.current?.('Invalid response from server')
          return null
        }

        // UPDATE: Replace optimistic ID with real enrichmentId
        if (mountedRef.current) {
          setAllGenerating((prev) => {
            const next = new Map(prev)
            const previous = next.get(generationKey)
            next.set(generationKey, {
              enrichmentId: data.enrichmentId,
              type,
              progress: 0,
              currentStep: 'queued',
              startedAtMs: previous?.startedAtMs ?? generationStartedAtMs,
              maxDurationMs: previous?.maxDurationMs ?? maxDurationMs,
            })
            return next
          })
        }

        // Start polling for this enrichment
        startPolling(type, data.enrichmentId, false, currentLessonId)

        return data.enrichmentId
      } catch (error) {
        abortControllersRef.current.delete(`generate-${generationKey}`)

        // Ignore abort errors
        if (isAbortLikeError(error)) {
          return null
        }

        // ROLLBACK: Remove optimistic state on error
        if (mountedRef.current) {
          setAllGenerating((prev) => {
            const next = new Map(prev)
            next.delete(generationKey)
            return next
          })
        }

        log.error('Error:', error)

        if (error instanceof TRPCClientError) {
          onErrorRef.current?.(error.message)
        } else {
          onErrorRef.current?.(
            error instanceof Error ? error.message : 'Failed to start generation'
          )
        }
        return null
      }
    },
    [startPolling, evictStaleEntries]
  )

  /**
   * Cancel generation for a specific enrichment type
   *
   * Handles both optimistic phase (before API response) and active generation.
   * In optimistic phase, only cleans up frontend state without backend call.
   */
  const cancelGeneration = useCallback(
    async (type: string) => {
      const generationKey = getGenerationKey(lessonIdRef.current, type)
      const gen = generatingRef.current.get(generationKey)
      if (!gen) return

      // Stop polling immediately
      stopPolling(generationKey)

      // Check if still in optimistic phase (no backend job exists yet)
      if (gen.enrichmentId.startsWith(OPTIMISTIC_ID_PREFIX)) {
        // Only clean up frontend state - no backend call needed
        if (mountedRef.current) {
          setAllGenerating((prev) => {
            const next = new Map(prev)
            next.delete(generationKey)
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
        if (isAbortLikeError(error)) {
          return
        }

        log.error('Cancel error:', error)

        if (error instanceof TRPCClientError) {
          // Surface permission errors to the user
          if (error.message.includes('permission') || error.message.includes('forbidden')) {
            onErrorRef.current?.('You do not have permission to cancel this generation')
          }
        }
      }

      // Always remove from UI regardless of backend response
      if (mountedRef.current) {
        setAllGenerating((prev) => {
          const next = new Map(prev)
          next.delete(generationKey)
          return next
        })
      }
    },
    [stopPolling]
  )

  /**
   * Check if a specific type is currently generating
   */
  const isGenerating = useCallback(
    (type: string) => {
      return allGenerating.has(getGenerationKey(lessonIdRef.current, type))
    },
    [allGenerating]
  )

  /**
   * Get progress info for a specific type
   */
  const getProgress = useCallback(
    (type: string) => {
      return allGenerating.get(getGenerationKey(lessonIdRef.current, type))
    },
    [allGenerating]
  )

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
    (enrichmentId: string, type: OnDemandEnrichmentType, startedAtMs?: number) => {
      const currentLessonId = lessonIdRef.current
      const generationKey = getGenerationKey(currentLessonId, type)

      // Guard: Don't resume if already tracking this type
      if (generatingRef.current.has(generationKey)) {
        log.warn('Already tracking generation for type:', type)
        return
      }

      // Guard: Don't resume if unmounted
      if (!mountedRef.current) {
        log.warn('Attempted to resume generation after unmount')
        return
      }

      const parsedStartedAtMs =
        typeof startedAtMs === 'number' && Number.isFinite(startedAtMs) && startedAtMs > 0
          ? startedAtMs
          : Date.now()

      // Add to generating state with unknown progress (-1 means "syncing")
      // Real progress will be fetched on first poll
      setAllGenerating((prev) => {
        const next = new Map(prev)
        next.set(generationKey, {
          enrichmentId,
          type,
          progress: -1, // -1 indicates "loading progress", not actual 0%
          currentStep: 'syncing',
          startedAtMs: parsedStartedAtMs,
          maxDurationMs: getMaxDurationForType(type),
        })
        return evictStaleEntries(next)
      })

      // Start polling for this enrichment (isResume = true for context-aware errors)
      startPolling(type, enrichmentId, true, currentLessonId)
    },
    [startPolling, evictStaleEntries]
  )

  /**
   * Check if a type just completed generation
   * Used to show skeleton instead of placeholder while data refetches
   */
  const isRecentlyCompleted = useCallback(
    (type: string): boolean => recentlyCompleted.has(getGenerationKey(lessonIdRef.current, type)),
    [recentlyCompleted]
  )

  /**
   * Clear recently completed status for a type
   * Called by parent component when new data arrives with the image
   */
  const clearRecentlyCompleted = useCallback((type: string) => {
    const completedKey = getGenerationKey(lessonIdRef.current, type)
    setRecentlyCompleted((prev) => {
      const next = new Set(prev)
      next.delete(completedKey)
      return next
    })
  }, [])

  const generating = useMemo(() => {
    const currentLessonGenerating = new Map<string, GeneratingEnrichment>()
    const lessonPrefix = `${lessonId}:`

    allGenerating.forEach((value, key) => {
      if (key.startsWith(lessonPrefix)) {
        currentLessonGenerating.set(value.type, value)
      }
    })

    return currentLessonGenerating
  }, [allGenerating, lessonId])

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
