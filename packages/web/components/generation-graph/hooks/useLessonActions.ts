'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { retryLessonGeneration } from '@/app/actions/lesson-actions'
import { pauseGeneration, resumeGeneration } from '@/app/actions/admin-generation'
import { toast } from 'sonner'
import { logger } from '@/lib/client-logger'

/**
 * Loading state with granular tracking
 * - retrying: Set of lessonIds currently being retried (allows multiple parallel retries)
 * - pausing: boolean for pause operation
 * - resuming: boolean for resume operation
 */
interface LoadingState {
  retrying: Set<string>
  pausing: boolean
  resuming: boolean
}

interface UseLessonActionsOptions {
  courseId: string
  onSuccess?: (action: 'retry' | 'pause' | 'resume', lessonId?: string) => void
  onError?: (action: 'retry' | 'pause' | 'resume', error: Error, lessonId?: string) => void
}

/**
 * Hook for managing lesson generation actions (retry, pause, resume)
 *
 * Features:
 * - Granular loading states (parallel retries supported)
 * - Race condition prevention via synchronous ref checks
 * - Memory leak prevention via mounted ref
 * - Input validation
 * - Contextual callbacks with action type
 *
 * @example
 * ```tsx
 * const { retryLesson, pause, resume, isRetrying, isPausing, isResuming } = useLessonActions({
 *   courseId: 'course-123',
 *   onSuccess: (action, lessonId) => console.log(`${action} succeeded`, lessonId),
 *   onError: (action, error) => console.error(`${action} failed`, error),
 * })
 * ```
 */
export function useLessonActions({ courseId, onSuccess, onError }: UseLessonActionsOptions) {
  const t = useTranslations('generation.lessonActions')

  // Granular loading state
  const [loadingState, setLoadingState] = useState<LoadingState>({
    retrying: new Set(),
    pausing: false,
    resuming: false,
  })

  // Ref for synchronous access to loading state (prevents race conditions)
  const loadingStateRef = useRef<LoadingState>(loadingState)

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true)

  // Keep ref in sync with state
  useEffect(() => {
    loadingStateRef.current = loadingState
  }, [loadingState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Safe state setter that checks mounted status
  const safeSetLoadingState = useCallback((updater: (prev: LoadingState) => LoadingState) => {
    if (mountedRef.current) {
      setLoadingState(updater)
    }
  }, [])

  const retryLesson = useCallback(
    async (lessonId: string) => {
      // Input validation
      if (!courseId?.trim()) {
        const error = new Error('courseId is required')
        logger.error('retryLesson: invalid courseId', { courseId })
        onError?.('retry', error, lessonId)
        return
      }
      if (!lessonId?.trim()) {
        const error = new Error('lessonId is required')
        logger.error('retryLesson: invalid lessonId', { lessonId })
        onError?.('retry', error, lessonId)
        return
      }

      // Race condition check: prevent duplicate retries for same lesson
      if (loadingStateRef.current.retrying.has(lessonId)) {
        logger.debug('retryLesson: already retrying', { lessonId })
        return
      }

      // Add to retrying set
      safeSetLoadingState((prev) => ({
        ...prev,
        retrying: new Set([...prev.retrying, lessonId]),
      }))

      try {
        await retryLessonGeneration(courseId, lessonId)
        if (mountedRef.current) {
          toast.success(t('retrySuccess'))
          onSuccess?.('retry', lessonId)
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        logger.error('retryLesson failed', { courseId, lessonId, error: err.message })
        if (mountedRef.current) {
          toast.error(t('retryError'), {
            description: `${t('lessonPrefix')} ${lessonId}: ${err.message}`,
          })
          onError?.('retry', err, lessonId)
        }
      } finally {
        // Remove from retrying set
        safeSetLoadingState((prev) => {
          const newRetrying = new Set(prev.retrying)
          newRetrying.delete(lessonId)
          return { ...prev, retrying: newRetrying }
        })
      }
    },
    [courseId, onSuccess, onError, safeSetLoadingState, t]
  )

  const pause = useCallback(async () => {
    // Input validation
    if (!courseId?.trim()) {
      const error = new Error('courseId is required')
      logger.error('pause: invalid courseId', { courseId })
      onError?.('pause', error)
      return
    }

    // Race condition check
    if (loadingStateRef.current.pausing) {
      logger.debug('pause: already pausing')
      return
    }

    safeSetLoadingState((prev) => ({ ...prev, pausing: true }))

    try {
      await pauseGeneration(courseId)
      if (mountedRef.current) {
        toast.success(t('pauseSuccess'))
        onSuccess?.('pause')
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('pause failed', { courseId, error: err.message })
      if (mountedRef.current) {
        toast.error(t('pauseError'), { description: err.message })
        onError?.('pause', err)
      }
    } finally {
      safeSetLoadingState((prev) => ({ ...prev, pausing: false }))
    }
  }, [courseId, onSuccess, onError, safeSetLoadingState, t])

  const resume = useCallback(async () => {
    // Input validation
    if (!courseId?.trim()) {
      const error = new Error('courseId is required')
      logger.error('resume: invalid courseId', { courseId })
      onError?.('resume', error)
      return
    }

    // Race condition check
    if (loadingStateRef.current.resuming) {
      logger.debug('resume: already resuming')
      return
    }

    safeSetLoadingState((prev) => ({ ...prev, resuming: true }))

    try {
      await resumeGeneration(courseId)
      if (mountedRef.current) {
        toast.success(t('resumeSuccess'))
        onSuccess?.('resume')
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('resume failed', { courseId, error: err.message })
      if (mountedRef.current) {
        toast.error(t('resumeError'), { description: err.message })
        onError?.('resume', err)
      }
    } finally {
      safeSetLoadingState((prev) => ({ ...prev, resuming: false }))
    }
  }, [courseId, onSuccess, onError, safeSetLoadingState, t])

  return {
    retryLesson,
    pause,
    resume,
    // Granular loading states
    isRetrying: (lessonId: string) => loadingState.retrying.has(lessonId),
    isAnyRetrying: loadingState.retrying.size > 0,
    isPausing: loadingState.pausing,
    isResuming: loadingState.resuming,
    // Legacy: any action in progress
    isLoading: loadingState.retrying.size > 0 || loadingState.pausing || loadingState.resuming,
  }
}
