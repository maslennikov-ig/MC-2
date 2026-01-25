'use client'

import { useState, useEffect, useRef } from 'react'
import { GenerationTrace } from '@/components/generation-celestial/utils'

const POLLING_INTERVAL = 5000 // 5 seconds

/**
 * Fallback polling for generation traces when realtime is disconnected.
 *
 * @param orgSlug - Organization slug for API route
 * @param courseSlug - Course slug for API route
 * @param isRealtimeConnected - Whether realtime subscription is active
 * @returns Array of generation traces from polling
 */
export function useFallbackPolling(
  orgSlug: string | undefined,
  courseSlug: string | undefined,
  isRealtimeConnected: boolean
): GenerationTrace[] {
  const [polledTraces, setPolledTraces] = useState<GenerationTrace[]>([])
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Clear polled data when course changes to avoid showing stale data
    setPolledTraces([])

    // Clear any existing interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    // If realtime is connected or slugs not available, don't poll
    if (isRealtimeConnected || !orgSlug || !courseSlug) {
      return
    }

    // Fallback polling function
    const pollTraces = async () => {
      try {
        const response = await fetch(`/api/courses/${orgSlug}/${courseSlug}/traces`)
        if (response.ok) {
          const data = await response.json()
          setPolledTraces(data.traces || [])
        }
      } catch (err) {
        // Log polling errors for debugging - these are expected during network issues
        if (process.env.NODE_ENV === 'development') {
          console.debug(
            '[useFallbackPolling] Polling failed:',
            err instanceof Error ? err.message : 'Unknown error'
          )
        }
      }
    }

    // Poll immediately, then at interval
    void pollTraces()
    pollingRef.current = setInterval(() => void pollTraces(), POLLING_INTERVAL)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [orgSlug, courseSlug, isRealtimeConnected])

  return polledTraces
}
