'use client'

import { useState, useCallback, useRef } from 'react'

interface UseServerDataOptions<T> {
  /** Initial data (from SSR) */
  initialData: T
  /** Unique key for this data (for future caching) */
  key?: string
}

interface UseServerDataResult<T> {
  /** Current data */
  data: T
  /** Whether a refetch is in progress */
  isRefetching: boolean
  /** Refetch data using provided fetcher */
  refetch: (fetcher: () => Promise<T | null>) => Promise<void>
  /** Update data optimistically */
  setData: React.Dispatch<React.SetStateAction<T>>
}

/**
 * Hook for managing server data with refetch capability.
 *
 * Designed for SSR data that needs client-side updates after mutations.
 *
 * @example
 * const { data: enrichments, refetch } = useServerData({
 *   initialData: enrichmentsFromSSR,
 *   key: 'enrichments'
 * })
 *
 * // After mutation:
 * await refetch(() => getLessonEnrichments({ lessonId, courseId }))
 */
export function useServerData<T>(options: UseServerDataOptions<T>): UseServerDataResult<T> {
  const { initialData } = options

  const [data, setData] = useState<T>(initialData)
  const [isRefetching, setIsRefetching] = useState(false)
  const fetchIdRef = useRef(0)

  const refetch = useCallback(async (fetcher: () => Promise<T | null>) => {
    const fetchId = ++fetchIdRef.current
    setIsRefetching(true)

    try {
      const result = await fetcher()

      // Ignore stale responses (race condition prevention)
      if (fetchId !== fetchIdRef.current) return

      if (result !== null) {
        setData(result)
      }
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsRefetching(false)
      }
    }
  }, [])

  return { data, isRefetching, refetch, setData }
}
