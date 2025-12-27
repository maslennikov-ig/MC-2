import { useState, useEffect, useCallback, useRef } from 'react'

interface WorkerReadinessState {
  /** Whether the worker is ready to accept jobs */
  ready: boolean
  /** Whether the check is currently loading */
  loading: boolean
  /** Error message if check failed */
  error: string | null
  /** Human-readable status message */
  message: string | null
  /** Detailed check results */
  checks: Array<{
    name: string
    passed: boolean
    message?: string
  }> | null
}

interface UseWorkerReadinessOptions {
  /** Whether to start polling immediately (default: true) */
  enabled?: boolean
  /** Polling interval in milliseconds (default: 10000) */
  pollInterval?: number
  /** Whether to continue polling when ready (default: false) */
  pollWhenReady?: boolean
}

/**
 * Hook to check and monitor worker readiness status
 *
 * Polls the /api/worker/readiness endpoint to determine if the
 * course generation worker is ready to accept jobs.
 *
 * @example
 * ```tsx
 * const { ready, loading, error, refetch } = useWorkerReadiness()
 *
 * if (loading) return <Spinner />
 * if (!ready) return <div>Worker not ready: {error}</div>
 * return <SubmitButton />
 * ```
 */
export function useWorkerReadiness(options: UseWorkerReadinessOptions = {}): WorkerReadinessState & {
  refetch: () => Promise<void>
} {
  const {
    enabled = true,
    pollInterval = 10000,
    pollWhenReady = false,
  } = options

  const [state, setState] = useState<WorkerReadinessState>({
    ready: false,
    loading: true,
    error: null,
    message: null,
    checks: null,
  })

  // Use ref to track ready state to avoid re-render loops
  const readyRef = useRef(false)

  // Sync state.ready to ref
  useEffect(() => {
    readyRef.current = state.ready
  }, [state.ready])

  const checkReadiness = useCallback(async () => {
    try {
      const response = await fetch('/api/worker/readiness', {
        method: 'GET',
        cache: 'no-store',
      })

      const data = await response.json()

      if (response.ok && data.ready) {
        setState({
          ready: true,
          loading: false,
          error: null,
          message: data.message || 'Worker ready',
          checks: data.checks || null,
        })
      } else {
        setState({
          ready: false,
          loading: false,
          error: data.message || 'Worker not ready',
          message: data.message || null,
          checks: data.checks || null,
        })
      }
    } catch (error) {
      setState({
        ready: false,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to check worker readiness',
        message: null,
        checks: null,
      })
    }
  }, [])

  // Initial check and polling
  useEffect(() => {
    if (!enabled) {
      setState(prev => ({ ...prev, loading: false }))
      return
    }

    // Initial check
    checkReadiness()

    // Set up polling
    const intervalId = setInterval(() => {
      // Only poll if not ready, or if pollWhenReady is true
      // Use readyRef to avoid dependency on state.ready
      if (!readyRef.current || pollWhenReady) {
        checkReadiness()
      }
    }, pollInterval)

    return () => clearInterval(intervalId)
  }, [enabled, pollInterval, pollWhenReady, checkReadiness])

  return {
    ...state,
    refetch: checkReadiness,
  }
}
