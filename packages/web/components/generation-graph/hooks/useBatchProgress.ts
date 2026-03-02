'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { trpc } from '@/lib/trpc/react'
import { useSupabase } from '@/lib/supabase/browser-client'
import { logger } from '@/lib/client-logger'

/**
 * Status info for a single enrichment in the batch
 */
export interface EnrichmentProgressStatus {
  status: string
  progress: number
  currentStep?: string
  error?: string
}

/**
 * Return value from useBatchProgress hook
 */
export interface BatchProgressResult {
  /** Map of enrichmentId to its current status */
  statuses: Map<string, EnrichmentProgressStatus>
  /** Number of enrichments that completed successfully */
  completedCount: number
  /** Number of enrichments that failed */
  failedCount: number
  /** Whether all enrichments have reached a terminal state */
  isComplete: boolean
  /** Overall progress percentage (0-100) */
  overallProgress: number
}

/** Terminal enrichment statuses that stop polling */
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

/** Polling interval in milliseconds */
const POLL_INTERVAL_MS = 3000

/**
 * Hook for tracking batch enrichment progress
 *
 * Combines tRPC polling with Supabase Realtime subscriptions to provide
 * near-real-time status updates for batch-created enrichments.
 *
 * Polling stops automatically when all enrichments reach a terminal state.
 *
 * @param enrichmentIds - Array of enrichment UUIDs to track
 * @param courseId - Course UUID for Realtime channel filtering
 *
 * @example
 * ```tsx
 * const { statuses, completedCount, failedCount, isComplete, overallProgress } =
 *   useBatchProgress(enrichmentIds, courseId)
 * ```
 */
export function useBatchProgress(enrichmentIds: string[], courseId: string): BatchProgressResult {
  const { supabase, session } = useSupabase()
  const [statuses, setStatuses] = useState<Map<string, EnrichmentProgressStatus>>(new Map())
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mountedRef = useRef(true)
  const isCompleteRef = useRef(false)

  // Use tRPC utils for direct queries (not React Query hooks, since we poll manually)
  const trpcUtils = trpc.useUtils()

  /**
   * Fetch status for all enrichment IDs in parallel
   */
  const pollStatuses = useCallback(async () => {
    if (!mountedRef.current || enrichmentIds.length === 0) return

    try {
      const results = await Promise.allSettled(
        enrichmentIds.map((enrichmentId) =>
          trpcUtils.enrichment.getGenerationStatus.fetch({ enrichmentId })
        )
      )

      if (!mountedRef.current) return

      setStatuses((prev) => {
        const next = new Map(prev)
        results.forEach((result, idx) => {
          const enrichmentId = enrichmentIds[idx]
          if (result.status === 'fulfilled') {
            next.set(enrichmentId, {
              status: result.value.status,
              progress: result.value.progress,
              currentStep: result.value.currentStep,
              error: result.value.error,
            })
          } else {
            // Keep previous status on fetch error, or set unknown
            if (!next.has(enrichmentId)) {
              next.set(enrichmentId, {
                status: 'pending',
                progress: 0,
              })
            }
          }
        })
        return next
      })
    } catch (err) {
      logger.warn('[useBatchProgress] Polling error', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [enrichmentIds, trpcUtils.enrichment.getGenerationStatus])

  // Derive computed values from statuses
  const completedCount = Array.from(statuses.values()).filter(
    (s) => s.status === 'completed'
  ).length

  const failedCount = Array.from(statuses.values()).filter(
    (s) => s.status === 'failed' || s.status === 'cancelled'
  ).length

  const isComplete =
    enrichmentIds.length > 0 &&
    enrichmentIds.every((id) => {
      const s = statuses.get(id)
      return s && TERMINAL_STATUSES.has(s.status)
    })

  const overallProgress =
    enrichmentIds.length === 0
      ? 0
      : Math.round(
          Array.from(statuses.values()).reduce((sum, s) => sum + s.progress, 0) /
            enrichmentIds.length
        )

  // Keep ref in sync so polling interval reads latest value
  useEffect(() => {
    isCompleteRef.current = isComplete
  }, [isComplete])

  // Polling loop
  useEffect(() => {
    mountedRef.current = true

    if (enrichmentIds.length === 0) return

    // Initial poll
    void pollStatuses()

    // Set up interval polling (use ref to avoid stale closure over isComplete)
    pollTimerRef.current = setInterval(() => {
      if (!isCompleteRef.current) {
        void pollStatuses()
      }
    }, POLL_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [enrichmentIds, pollStatuses])

  // Stop polling once complete
  useEffect(() => {
    if (isComplete && pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
      logger.debug('[useBatchProgress] All enrichments complete, stopping poll')
    }
  }, [isComplete])

  // Supabase Realtime subscription for status changes
  useEffect(() => {
    if (!session || !courseId || enrichmentIds.length === 0) return

    let isMounted = true

    const channel = supabase
      .channel(`batch-progress:${courseId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lesson_enrichments',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          if (!isMounted) return

          const updated = payload.new as { id: string; status: string }
          // Only process if this enrichment is in our batch
          if (enrichmentIds.includes(updated.id)) {
            logger.debug('[useBatchProgress] Realtime update', {
              enrichmentId: updated.id,
              status: updated.status,
            })
            // Trigger an immediate poll to get full status details
            void pollStatuses()
          }
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'SUBSCRIBED') {
          logger.debug('[useBatchProgress] Realtime subscription active', {
            courseId,
            trackingCount: enrichmentIds.length,
          })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.warn('[useBatchProgress] Realtime subscription error', {
            status,
            error: err?.message,
            courseId,
          })
          // Continue polling even if realtime fails - polling is the primary mechanism
        }
      })

    channelRef.current = channel

    return () => {
      isMounted = false
      if (channelRef.current) {
        void channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
  }, [session, courseId, enrichmentIds, supabase, pollStatuses])

  return {
    statuses,
    completedCount,
    failedCount,
    isComplete,
    overallProgress,
  }
}
