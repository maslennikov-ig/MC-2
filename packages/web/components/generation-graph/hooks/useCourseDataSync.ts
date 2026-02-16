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

type GenerationStatus = Database['public']['Enums']['generation_status']

interface UseCourseDataSyncParams {
  courseId: string
  initializeFromCourseStructure: (structure: CourseStructure, completedLabels: string[]) => void
  isConnected: boolean
  pipelineStatus: GenerationStatus | null
}

interface UseCourseDataSyncReturn {
  visualStyle: VisualStyle | null
  courseStyle: string | null
  analysisResult: AnalysisResult | null
  courseLanguage: string | null
}

/**
 * Hook for syncing course data (structure, visual_style, style, analysis_result) from database.
 * Handles initial fetch, course-data-updated events, and stage transitions.
 *
 * Features:
 * - Prevents concurrent refetches (race condition protection)
 * - Change detection to avoid unnecessary graph rebuilds
 * - Fetches completed lesson labels from generation_trace
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

  /**
   * Unified function to fetch course data from database.
   * Consolidates logic from initial fetch, event refetch, and Stage 5 complete fetch.
   *
   * @param fields - 'all' fetches course_structure, visual_style, style, analysis_result;
   *                 'structure_only' fetches only course_structure
   * @param includeCompletedLessons - Whether to also fetch completed lesson labels from generation_trace
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

        // Build completed lessons query if needed
        const lessonsQuery = includeCompletedLessons
          ? supabase
              .from('generation_trace')
              .select('input_data')
              .eq('course_id', courseId)
              .eq('stage', 'stage_6')
              .eq('step_name', 'finish')
              .not('input_data->lessonLabel', 'is', null)
          : null

        // Fetch based on fields parameter - use separate queries for type safety
        let courseStructure: CourseStructure | null = null
        let visualStyleData: unknown = null
        let styleData: string | null = null
        let analysisResultData: unknown = null

        if (fields === 'all') {
          // Fetch all fields
          const [courseResult, lessonsResult] = await Promise.all([
            supabase
              .from('courses')
              .select('course_structure, visual_style, style, analysis_result, language')
              .eq('id', courseId)
              .single(),
            lessonsQuery,
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

          // Extract completed labels
          const completedLabels =
            lessonsResult?.data && lessonsResult.data.length > 0
              ? [
                  ...new Set(
                    lessonsResult.data
                      .map((t) => (t.input_data as Record<string, unknown>)?.lessonLabel as string)
                      .filter(Boolean)
                  ),
                ]
              : []

          // Update course structure (only if changed)
          if (courseStructure) {
            const structureJson = JSON.stringify(courseStructure)
            const hasStructureChanged = prevCourseStructureRef.current !== structureJson

            if (hasStructureChanged) {
              initializeFromCourseStructure(courseStructure, completedLabels)
              prevCourseStructureRef.current = structureJson
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
          const [courseResult, lessonsResult] = await Promise.all([
            supabase.from('courses').select('course_structure').eq('id', courseId).single(),
            lessonsQuery,
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

          // Extract completed labels
          const completedLabels =
            lessonsResult?.data && lessonsResult.data.length > 0
              ? [
                  ...new Set(
                    lessonsResult.data
                      .map((t) => (t.input_data as Record<string, unknown>)?.lessonLabel as string)
                      .filter(Boolean)
                  ),
                ]
              : []

          // Update course structure (only if changed)
          if (courseStructure) {
            const structureJson = JSON.stringify(courseStructure)
            const hasStructureChanged = prevCourseStructureRef.current !== structureJson

            if (hasStructureChanged) {
              initializeFromCourseStructure(courseStructure, completedLabels)
              prevCourseStructureRef.current = structureJson
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

      // Event refetch: all fields, no completed lessons
      void fetchCourseData('all', false, {
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
      void fetchCourseData('all', false, {
        source: `status-transition:${pipelineStatus}`,
      })
    }
  }, [pipelineStatus, prevPipelineStatus, courseId, fetchCourseData])

  return { visualStyle, courseStyle, analysisResult, courseLanguage }
}
