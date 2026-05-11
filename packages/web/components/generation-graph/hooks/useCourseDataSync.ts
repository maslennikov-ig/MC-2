'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrevious } from '@/lib/hooks/use-previous'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/client-logger'
import {
  COURSE_DATA_UPDATED_EVENT,
  isCourseDataUpdatedEvent,
  hasRelevantFieldChanges,
  type VisualStyle,
  type AnalysisResult,
  type Database,
  parseAnalysisResult,
} from '@megacampus/shared-types'
import type { CourseStructure } from '@megacampus/shared-types'
import { isVisualStyle } from '../GraphView.helpers'
import {
  selectLatestLessonContentStatusLabels,
  type LessonContentStatusLabels,
} from './moduleDashboardContentSelection'

type GenerationStatus = Database['public']['Enums']['generation_status']

interface UseCourseDataSyncParams {
  courseId: string
  initializeFromCourseStructure: (
    structure: CourseStructure,
    completedLabels: string[],
    reviewRequiredLabels?: string[]
  ) => void
  isConnected: boolean
  pipelineStatus: GenerationStatus | null
}

interface UseCourseDataSyncReturn {
  visualStyle: VisualStyle | null
  courseStyle: string | null
  analysisResult: AnalysisResult | null
  courseLanguage: string | null
}

type SectionLessonsRow = {
  order_index: number | null
  lessons?: Array<{
    id: string
    order_index: number | null
  }> | null
}

const emptyLessonContentStatusLabels: LessonContentStatusLabels = {
  completedLabels: [],
  reviewRequiredLabels: [],
}

async function fetchLessonContentStatusLabels(
  supabase: ReturnType<typeof createClient>,
  courseId: string,
  enabled: boolean
): Promise<LessonContentStatusLabels> {
  if (!enabled) return emptyLessonContentStatusLabels

  const [sectionsResult, contentsResult] = await Promise.all([
    supabase
      .from('sections')
      .select('order_index, lessons(id, order_index)')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true }),
    supabase
      .from('lesson_contents')
      .select('id, lesson_id, status, created_at')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
  ])

  if (sectionsResult.error) {
    logger.warn('[useCourseDataSync] Failed to fetch lesson indexes:', sectionsResult.error)
    return emptyLessonContentStatusLabels
  }

  if (contentsResult.error) {
    logger.warn(
      '[useCourseDataSync] Failed to fetch lesson content statuses:',
      contentsResult.error
    )
    return emptyLessonContentStatusLabels
  }

  const lessonLabelsById = new Map<string, string>()
  const sections = (sectionsResult.data || []) as SectionLessonsRow[]

  for (const section of sections) {
    if (typeof section.order_index !== 'number') continue

    const lessons = [...(section.lessons || [])].sort(
      (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
    )

    for (const lesson of lessons) {
      if (!lesson.id || typeof lesson.order_index !== 'number') continue
      lessonLabelsById.set(lesson.id, `${section.order_index}.${lesson.order_index}`)
    }
  }

  return selectLatestLessonContentStatusLabels(contentsResult.data || [], lessonLabelsById)
}

/**
 * Hook for syncing course data (structure, visual_style, style, analysis_result) from database.
 * Handles initial fetch, course-data-updated events, and stage transitions.
 *
 * Features:
 * - Prevents concurrent refetches (race condition protection)
 * - Change detection to avoid unnecessary graph rebuilds
 * - Fetches completed/review-required lesson labels from lesson_contents
 * - Guards against setState on unmounted component
 */
export function useCourseDataSync({
  courseId,
  initializeFromCourseStructure,
  isConnected,
  pipelineStatus,
}: UseCourseDataSyncParams): UseCourseDataSyncReturn {
  const [visualStyle, setVisualStyle] = useState<VisualStyle | null>(null)
  const [courseStyle, setCourseStyle] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [courseLanguage, setCourseLanguage] = useState<string | null>(null)

  // Ref to prevent concurrent refetches (race condition protection)
  const refetchInProgressRef = useRef(false)
  // Ref to prevent double-fetch in strict mode
  const courseStructureInitialized = useRef(false)
  // Ref to store previous course structure for change detection
  const prevCourseStructureRef = useRef<string | null>(null)
  // Ref to store previous Stage 6 lesson statuses for graph color updates
  const prevLessonStatusRef = useRef<string | null>(null)
  // Debounce lesson_contents realtime bursts during Stage 6 regeneration
  const lessonStatusRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Unified function to fetch course data from database.
   * Consolidates logic from initial fetch, event refetch, and Stage 5 complete fetch.
   *
   * @param fields - 'all' fetches course_structure, visual_style, style, analysis_result;
   *                 'structure_only' fetches only course_structure
   * @param includeCompletedLessons - Whether to also fetch completed/review-required lesson labels from lesson_contents
   * @param options - Additional options for fetch behavior
   */
  const fetchCourseData = useCallback(
    async (
      fields: 'all' | 'structure_only',
      includeCompletedLessons: boolean,
      options?: {
        source?: string
        checkMounted?: () => boolean
        onError?: (context: string) => void
      }
    ) => {
      // Prevent concurrent refetches (race condition protection)
      if (refetchInProgressRef.current) {
        logger.info('[useCourseDataSync] Refetch already in progress, skipping')
        return
      }

      refetchInProgressRef.current = true
      const startTime = performance.now()

      try {
        if (options?.source) {
          logger.info('[useCourseDataSync] Course data updated, refetching...', {
            source: options.source,
          })
        }

        const supabase = createClient()

        const lessonStatusLabelsPromise = fetchLessonContentStatusLabels(
          supabase,
          courseId,
          includeCompletedLessons
        )

        // Fetch based on fields parameter - use separate queries for type safety
        let courseStructure: CourseStructure | null = null
        let visualStyleData: unknown = null
        let styleData: string | null = null
        let analysisResultData: unknown = null

        if (fields === 'all') {
          // Fetch all fields
          const [courseResult, lessonStatusLabels] = await Promise.all([
            supabase
              .from('courses')
              .select('course_structure, visual_style, style, analysis_result, language')
              .eq('id', courseId)
              .single(),
            lessonStatusLabelsPromise,
          ])

          if (courseResult.error) {
            logger.error('[useCourseDataSync] Failed to fetch course data:', courseResult.error)
            options?.onError?.('course data')
            return
          }

          // Guard against setState on unmounted component
          if (options?.checkMounted && !options.checkMounted()) {
            logger.info('[useCourseDataSync] Component unmounted, skipping state update')
            return
          }

          courseStructure = courseResult.data?.course_structure as CourseStructure | null
          visualStyleData = courseResult.data?.visual_style
          styleData = courseResult.data?.style ?? null
          analysisResultData = courseResult.data?.analysis_result
          const languageData = courseResult.data?.language ?? null

          // Update visual style
          if (visualStyleData && isVisualStyle(visualStyleData)) {
            setVisualStyle(visualStyleData)
          }

          // Update course style
          if (styleData) {
            setCourseStyle(styleData)
          }

          // Update course language
          if (languageData) {
            setCourseLanguage(languageData)
          }

          // Update analysis result
          if (analysisResultData) {
            const parsed = parseAnalysisResult(analysisResultData)
            if (parsed) {
              setAnalysisResult(parsed)
            }
          }

          // Update course structure (only if changed)
          if (courseStructure) {
            const structureJson = JSON.stringify(courseStructure)
            const lessonStatusJson = JSON.stringify(lessonStatusLabels)
            const hasStructureChanged = prevCourseStructureRef.current !== structureJson
            const hasLessonStatusesChanged = prevLessonStatusRef.current !== lessonStatusJson

            if (hasStructureChanged || hasLessonStatusesChanged) {
              initializeFromCourseStructure(
                courseStructure,
                lessonStatusLabels.completedLabels,
                lessonStatusLabels.reviewRequiredLabels
              )
              prevCourseStructureRef.current = structureJson
              prevLessonStatusRef.current = lessonStatusJson
              logger.debug('[useCourseDataSync] Course structure updated')
            } else {
              logger.debug('[useCourseDataSync] Course structure unchanged, skipping rebuild')
            }
            courseStructureInitialized.current = true
          } else {
            // Reset flag if no structure found during initial load (might be added later)
            courseStructureInitialized.current = false
          }
        } else {
          // Fetch structure only
          const [courseResult, lessonStatusLabels] = await Promise.all([
            supabase.from('courses').select('course_structure').eq('id', courseId).single(),
            lessonStatusLabelsPromise,
          ])

          if (courseResult.error) {
            logger.error(
              '[useCourseDataSync] Failed to fetch course structure after Stage 5:',
              courseResult.error
            )
            options?.onError?.('course structure after Stage 5')
            return
          }

          // Guard against setState on unmounted component
          if (options?.checkMounted && !options.checkMounted()) {
            logger.info('[useCourseDataSync] Component unmounted, skipping state update')
            return
          }

          courseStructure = courseResult.data?.course_structure as CourseStructure | null

          // Update course structure (only if changed)
          if (courseStructure) {
            const structureJson = JSON.stringify(courseStructure)
            const lessonStatusJson = JSON.stringify(lessonStatusLabels)
            const hasStructureChanged = prevCourseStructureRef.current !== structureJson
            const hasLessonStatusesChanged = prevLessonStatusRef.current !== lessonStatusJson

            if (hasStructureChanged || hasLessonStatusesChanged) {
              initializeFromCourseStructure(
                courseStructure,
                lessonStatusLabels.completedLabels,
                lessonStatusLabels.reviewRequiredLabels
              )
              prevCourseStructureRef.current = structureJson
              prevLessonStatusRef.current = lessonStatusJson
              logger.debug('[useCourseDataSync] Course structure updated (structure_only)')
            } else {
              logger.debug('[useCourseDataSync] Course structure unchanged, skipping rebuild')
            }
            courseStructureInitialized.current = true
          }
        }

        const duration = performance.now() - startTime
        logger.info('[useCourseDataSync] Course data refreshed successfully', {
          fields,
          includeCompletedLessons,
          duration: `${duration.toFixed(2)}ms`,
        })
      } finally {
        refetchInProgressRef.current = false
      }
    },
    [courseId, initializeFromCourseStructure]
  )

  // Fetch course structure on mount to initialize modules/lessons
  // This ensures the structure appears immediately even on page refresh
  useEffect(() => {
    // Prevent double-fetch in strict mode
    if (courseStructureInitialized.current) return
    courseStructureInitialized.current = true

    // Initial fetch: all fields + completed lessons
    void fetchCourseData('all', true, {
      onError: () => {
        // Reset flag on error to allow retry on remount
        courseStructureInitialized.current = false
      },
    })
  }, [fetchCourseData])

  // Listen for course-data-updated events (dispatched by realtime provider)
  // This handles UI refresh after apply proposal (Stage 5) and clarifying answers (Stage 4)
  useEffect(() => {
    let isMounted = true

    const handleCourseDataUpdated = (event: Event) => {
      // Type-safe event validation
      if (!isCourseDataUpdatedEvent(event)) {
        logger.warn('[useCourseDataSync] Invalid course-data-updated event received')
        return
      }

      const { detail } = event

      // Only handle events for this course
      if (detail.courseId !== courseId) return

      // Only process realtime events when connected
      // Fallback polling handles disconnected state - avoid duplicate fetches
      if (detail.source === 'realtime' && !isConnected) {
        logger.info('[useCourseDataSync] Ignoring realtime event - using fallback polling')
        return
      }

      // Only refetch if relevant fields changed
      if (!hasRelevantFieldChanges(detail.updatedFields)) {
        logger.info('[useCourseDataSync] No relevant fields updated, skipping refetch', {
          updatedFields: detail.updatedFields,
        })
        return
      }

      // Event refetch: keep Stage 6 labels in sync with latest lesson_contents rows.
      void fetchCourseData('all', true, {
        source: detail.source,
        checkMounted: () => isMounted,
      })
    }

    window.addEventListener(COURSE_DATA_UPDATED_EVENT, handleCourseDataUpdated)
    return () => {
      isMounted = false
      window.removeEventListener(COURSE_DATA_UPDATED_EVENT, handleCourseDataUpdated)
      logger.info('[useCourseDataSync] Removed course-data-updated listener for', courseId)
    }
  }, [courseId, fetchCourseData, isConnected])

  // Keep the main graph in sync when Stage 6 writes new lesson_contents rows.
  // Without this, an open graph can keep showing a green completed card until reload.
  useEffect(() => {
    if (!courseId || !isConnected) return

    const supabase = createClient()
    const scheduleLessonStatusRefresh = () => {
      if (lessonStatusRefreshTimeoutRef.current) {
        clearTimeout(lessonStatusRefreshTimeoutRef.current)
      }

      lessonStatusRefreshTimeoutRef.current = setTimeout(() => {
        lessonStatusRefreshTimeoutRef.current = null
        void fetchCourseData('structure_only', true, {
          source: 'lesson_contents',
        })
      }, 500)
    }

    const channel = supabase
      .channel(`course_lesson_content_status:${courseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lesson_contents',
          filter: `course_id=eq.${courseId}`,
        },
        scheduleLessonStatusRefresh
      )
      .subscribe()

    return () => {
      if (lessonStatusRefreshTimeoutRef.current) {
        clearTimeout(lessonStatusRefreshTimeoutRef.current)
        lessonStatusRefreshTimeoutRef.current = null
      }
      void channel.unsubscribe()
    }
  }, [courseId, fetchCourseData, isConnected])

  // Re-fetch course structure when Stage 5 becomes complete
  const prevPipelineStatus = usePrevious(pipelineStatus)

  useEffect(() => {
    if (prevPipelineStatus === undefined) return // skip initial mount
    const wasNotComplete = prevPipelineStatus !== 'stage_5_complete'
    const isNowComplete = pipelineStatus === 'stage_5_complete'
    if (wasNotComplete && isNowComplete) {
      courseStructureInitialized.current = false
      void fetchCourseData('structure_only', true)
    }
  }, [pipelineStatus, prevPipelineStatus, fetchCourseData])

  // Re-fetch course data when stage transitions to awaiting_approval or complete
  useEffect(() => {
    if (prevPipelineStatus === undefined) return // skip initial mount
    const completionStatuses = [
      'stage_3_awaiting_approval',
      'stage_3_complete',
      'stage_4_awaiting_approval',
      'stage_4_complete',
      'stage_5_awaiting_approval',
      'stage_5_complete',
    ]
    const wasNotComplete = !completionStatuses.includes(prevPipelineStatus || '')
    const isNowComplete = completionStatuses.includes(pipelineStatus || '')
    if (wasNotComplete && isNowComplete) {
      void fetchCourseData('all', true, {
        source: `status-transition:${pipelineStatus}`,
      })
    }
  }, [pipelineStatus, prevPipelineStatus, courseId, fetchCourseData])

  return { visualStyle, courseStyle, analysisResult, courseLanguage }
}
