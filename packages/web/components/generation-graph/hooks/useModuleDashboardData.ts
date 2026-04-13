'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase/browser-client'
import { logger } from '@/lib/client-logger'
import type { Database } from '@/types/database.generated'
import type {
  MicroStepperState,
  Stage6NodeName,
  Stage6NodeStatus,
  CourseStructure,
} from '@megacampus/shared-types'
import {
  calculateReviewAwareAggregates,
  getReviewAwareModuleStatus,
  isReviewRequiredStatus,
  mapStage6LessonStatus,
  type ReviewAwareLessonMatrixRow,
  type ReviewAwareModuleDashboardData,
} from '../stage6-review-status'
import { getLatestLessonContentRow, getLatestUsableLessonContent } from './lessonInspectorContent'

/**
 * Metadata structure from lesson_contents.metadata JSONB column
 */
interface LessonMetadata {
  cost_usd?: number
  quality_score?: number
  generation_duration_ms?: number
  total_tokens?: number
  [key: string]: unknown
}

/**
 * Type alias for lesson_contents table row
 */
type LessonContentRow = Database['public']['Tables']['lesson_contents']['Row']

interface ModuleLessonContentRowSelection<T extends LessonContentRow> {
  statusRow: T | null
  usableContentRow: T | null
}

/**
 * Safely parse metadata from Json type
 */
function parseMetadata(
  metadata: Database['public']['Tables']['lesson_contents']['Row']['metadata']
): LessonMetadata | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }
  return metadata as LessonMetadata
}

export function resolveModuleLessonContentRows<T extends LessonContentRow>(
  rows: T[] | null | undefined
): ModuleLessonContentRowSelection<T> {
  return {
    statusRow: getLatestLessonContentRow(rows),
    usableContentRow: getLatestUsableLessonContent(rows),
  }
}

/**
 * Hook return type
 */
export interface UseModuleDashboardDataReturn {
  /** Aggregated module dashboard data */
  data: ReviewAwareModuleDashboardData | null
  /** Loading state */
  isLoading: boolean
  /** Error state */
  error: Error | null
  /** Manual refetch function */
  refetch: () => void
}

/**
 * Hook options
 */
export interface UseModuleDashboardDataOptions {
  /** Module ID (e.g., "module_1") - null when not viewing a module */
  moduleId: string | null
  /** Course ID */
  courseId: string
  /** Course structure from courses.course_structure */
  courseStructure?: CourseStructure | null
  /** Enable realtime subscriptions */
  enableRealtime?: boolean
  /** Whether hook should fetch data */
  enabled?: boolean
}

/**
 * Extract pipeline state from generation_trace or metadata
 *
 * FUTURE: When generation_trace JSONB column is added to lesson_contents,
 * parse it to extract detailed pipeline node states.
 * For now, we derive state from status column only.
 */
function extractPipelineState(status: string, _metadata: LessonMetadata | null): MicroStepperState {
  const lessonStatus = mapStage6LessonStatus(status)

  // Default pipeline: all nodes pending (3-node pipeline: generator → selfReviewer → judge)
  const nodes: Array<{ node: Stage6NodeName; status: Stage6NodeStatus }> = [
    { node: 'generator', status: 'pending' },
    { node: 'selfReviewer', status: 'pending' },
    { node: 'judge', status: 'pending' },
  ]

  // Map overall lesson status to pipeline state
  if (lessonStatus === 'completed') {
    // All nodes completed
    nodes.forEach((node) => {
      node.status = 'completed'
    })
  } else if (lessonStatus === 'active') {
    // First node active, rest pending (simplified)
    nodes[0].status = 'active'
  } else if (lessonStatus === 'error') {
    // First node error, rest pending (simplified)
    nodes[0].status = 'error'
  }

  return { nodes }
}

/**
 * Hook for fetching and aggregating module dashboard data
 *
 * Combines course structure with lesson_contents data to build a complete
 * module dashboard view. Supports realtime updates via Supabase subscriptions.
 *
 * Data flow:
 * 1. Extract module metadata from course_structure
 * 2. Find all lessons belonging to this module
 * 3. Query lesson_contents for each lesson
 * 4. Aggregate metrics (cost, quality, duration)
 * 5. Subscribe to realtime updates
 *
 * @param options - Hook options
 * @returns Dashboard data, loading state, error, and refetch function
 *
 * @example
 * ```tsx
 * function ModuleDashboard({ moduleId, courseId, courseStructure }) {
 *   const { data, isLoading, error, refetch } = useModuleDashboardData({
 *     moduleId,
 *     courseId,
 *     courseStructure,
 *     enableRealtime: true,
 *   });
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <ErrorMessage error={error} />;
 *   if (!data) return <EmptyState />;
 *
 *   return <ModuleDashboardView data={data} />;
 * }
 * ```
 */
export function useModuleDashboardData({
  moduleId,
  courseId,
  courseStructure: externalCourseStructure,
  enableRealtime = true,
  enabled = true,
}: UseModuleDashboardDataOptions): UseModuleDashboardDataReturn {
  const [data, setData] = useState<ReviewAwareModuleDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [internalCourseStructure, setInternalCourseStructure] = useState<CourseStructure | null>(
    null
  )

  // Track current fetch to avoid race conditions
  const fetchIdRef = useRef(0)
  // Track lesson content IDs in this module for filtering realtime updates
  const moduleContentIdsRef = useRef<Set<string>>(new Set())
  // Track lesson IDs (from lessons table) for this module - used to detect new INSERTs
  const moduleLessonIdsRef = useRef<Set<string>>(new Set())
  const supabase = getSupabaseClient()

  // Use external courseStructure if provided, otherwise use internal
  const courseStructure = externalCourseStructure ?? internalCourseStructure

  // Skip hook if disabled or missing moduleId
  const shouldFetch = enabled && !!moduleId

  // Fetch courseStructure from database if not provided externally
  useEffect(() => {
    if (!shouldFetch || !courseId || externalCourseStructure) return

    // Race condition guard: prevents stale responses from updating state
    // when user rapidly switches between modules
    let ignore = false

    logger.debug('[useModuleDashboardData] Fetching course structure', { courseId, moduleId })

    const fetchCourseStructure = async () => {
      try {
        const { data: courseData, error: courseError } = await supabase
          .from('courses')
          .select('course_structure')
          .eq('id', courseId)
          .single()

        // Skip state update if effect was cleaned up (user switched modules)
        if (ignore) return

        if (courseError) throw courseError

        if (courseData?.course_structure) {
          logger.debug('[useModuleDashboardData] Course structure loaded', {
            courseId,
            sectionsCount: (courseData.course_structure as CourseStructure)?.sections?.length,
          })
          setInternalCourseStructure(courseData.course_structure as CourseStructure)
        } else {
          logger.warn('[useModuleDashboardData] Course structure is empty', { courseId })
        }
      } catch (err) {
        // Skip error handling if effect was cleaned up (user switched modules)
        if (ignore) return
        console.error('[useModuleDashboardData] Course structure fetch error:', err)
        logger.error('Failed to fetch course structure', { courseId, error: err })
      }
    }

    void fetchCourseStructure()

    return () => {
      ignore = true
    }
  }, [shouldFetch, courseId, externalCourseStructure, supabase, moduleId])

  /**
   * Get expected lesson count for this module from course structure
   * Used for displaying lessons that don't have content yet
   */
  const getLessonCountForModule = useCallback(
    (modId: string): number => {
      if (!courseStructure?.sections) return 0

      // Extract module number from moduleId (e.g., "module_1" -> 1)
      const moduleNumber = parseInt(modId.replace('module_', ''), 10)
      if (isNaN(moduleNumber)) return 0

      // Find the corresponding section (moduleNumber is 1-based)
      const sectionIndex = moduleNumber - 1
      const section = courseStructure.sections[sectionIndex]

      return section?.lessons?.length ?? 0
    },
    [courseStructure]
  )

  /**
   * Fetch lesson content data from database
   *
   * Data flow:
   * 1. Get section UUID from sections table (by course_id and order_index)
   * 2. Get lesson UUIDs from lessons table (by section_id)
   * 3. Get lesson contents from lesson_contents table (by lesson UUIDs)
   */
  const fetchLessonData = useCallback(async () => {
    logger.debug('[useModuleDashboardData] fetchLessonData called', {
      shouldFetch,
      courseId: courseId || 'undefined',
      moduleId: moduleId || 'undefined',
      hasCourseStructure: !!courseStructure,
      sectionsCount: courseStructure?.sections?.length ?? 0,
    })

    if (!shouldFetch || !courseId || !moduleId || !courseStructure) {
      setData(null)
      setIsLoading(false)
      return
    }

    const fetchId = ++fetchIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      // Extract module metadata from course structure
      const moduleNumber = parseInt(moduleId.replace('module_', ''), 10)
      if (isNaN(moduleNumber)) {
        throw new Error(`Invalid module ID: ${moduleId}`)
      }

      const sectionIndex = moduleNumber - 1
      const section = courseStructure.sections?.[sectionIndex]

      logger.debug('[useModuleDashboardData] Looking for section', {
        moduleId,
        moduleNumber,
        sectionIndex,
        availableSections: courseStructure.sections?.length ?? 0,
        foundSection: !!section,
      })

      if (!section) {
        throw new Error(
          `Module ${moduleNumber} not found in course structure (sections: ${courseStructure.sections?.length ?? 0})`
        )
      }

      const moduleTitle = section.section_title || `Модуль ${moduleNumber}`
      const expectedLessonCount = getLessonCountForModule(moduleId)

      if (expectedLessonCount === 0) {
        // Empty module - return empty dashboard
        setData({
          moduleId,
          moduleNumber,
          title: moduleTitle,
          status: 'pending',
          lessons: [],
          aggregates: {
            totalLessons: 0,
            completedLessons: 0,
            approvedLessons: 0,
            activeLessons: 0,
            errorLessons: 0,
            pendingLessons: 0,
            reviewRequiredLessons: 0,
            totalCostUsd: 0,
            avgQualityScore: null,
            totalDurationMs: 0,
            estimatedTimeRemainingMs: null,
            totalTokens: 0,
          },
          needsReview: false,
        })
        setIsLoading(false)
        return
      }

      // Step 1: Get section UUID from sections table
      const { data: sectionData, error: sectionError } = await supabase
        .from('sections')
        .select('id, title')
        .eq('course_id', courseId)
        .eq('order_index', moduleNumber) // order_index is 1-based
        .single()

      if (fetchId !== fetchIdRef.current) return

      if (sectionError || !sectionData) {
        logger.warn(
          '[useModuleDashboardData] Section not found in database, returning empty data',
          {
            moduleNumber,
            courseId,
            error: sectionError?.message,
          }
        )
        // Section not yet created in DB - show pending state with expected lessons
        const pendingLessons: ReviewAwareLessonMatrixRow[] = Array.from(
          { length: expectedLessonCount },
          (_, idx) => ({
            lessonId: `${moduleNumber}.${idx + 1}`,
            lessonNumber: idx + 1,
            title: section.lessons?.[idx]?.lesson_title || `Урок ${idx + 1}`,
            status: 'pending' as const,
            pipelineState: extractPipelineState('pending', null),
            qualityScore: null,
            costUsd: 0,
            durationMs: null,
            retryCount: 0,
            canRetry: false,
            totalTokens: null,
            needsReview: false,
          })
        )

        setData({
          moduleId,
          moduleNumber,
          title: moduleTitle,
          status: 'pending',
          lessons: pendingLessons,
          aggregates: calculateReviewAwareAggregates(pendingLessons),
          needsReview: false,
        })
        setIsLoading(false)
        return
      }

      const sectionId = sectionData.id

      // Step 2: Get lessons from lessons table
      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, title, order_index')
        .eq('section_id', sectionId)
        .order('order_index', { ascending: true })

      if (fetchId !== fetchIdRef.current) return

      if (lessonsError) {
        throw new Error(`Failed to fetch lessons: ${lessonsError.message}`)
      }

      const lessons = lessonsData || []
      const lessonIds = lessons.map((l) => l.id)

      // Store lesson IDs for filtering realtime INSERT events
      moduleLessonIdsRef.current = new Set(lessonIds)

      logger.debug('[useModuleDashboardData] Fetched lessons from DB', {
        sectionId,
        lessonsCount: lessons.length,
        lessonIds,
      })

      // Step 3: Get lesson contents (only if we have lessons)
      let lessonContents: LessonContentRow[] = []
      if (lessonIds.length > 0) {
        const { data: contentsData, error: contentsError } = await supabase
          .from('lesson_contents')
          .select('*')
          .eq('course_id', courseId)
          .in('lesson_id', lessonIds)

        if (fetchId !== fetchIdRef.current) return

        if (contentsError) {
          throw new Error(`Failed to fetch lesson contents: ${contentsError.message}`)
        }

        lessonContents = contentsData || []

        // Store lesson content IDs for filtering realtime updates
        moduleContentIdsRef.current = new Set(lessonContents.map((lc) => lc.id))
      }

      // Build lesson matrix rows
      // Use lessons from DB if available, otherwise use expected count from course structure
      const lessonRows: ReviewAwareLessonMatrixRow[] = []
      const lessonContentsByLessonId = new Map<string, LessonContentRow[]>()

      for (const lessonContent of lessonContents) {
        const existingRows = lessonContentsByLessonId.get(lessonContent.lesson_id) ?? []
        existingRows.push(lessonContent)
        lessonContentsByLessonId.set(lessonContent.lesson_id, existingRows)
      }

      if (lessons.length > 0) {
        // Use actual lessons from database
        for (const lesson of lessons) {
          const { statusRow, usableContentRow } = resolveModuleLessonContentRows(
            lessonContentsByLessonId.get(lesson.id)
          )
          const lessonNumber = lesson.order_index
          const lessonTitle =
            lesson.title ||
            section.lessons?.[lessonNumber - 1]?.lesson_title ||
            `Урок ${lessonNumber}`
          const lessonLabel = `${moduleNumber}.${lessonNumber}`

          if (!statusRow) {
            lessonRows.push({
              lessonId: lessonLabel,
              lessonNumber,
              title: lessonTitle,
              status: 'pending' as const,
              pipelineState: extractPipelineState('pending', null),
              qualityScore: null,
              costUsd: 0,
              durationMs: null,
              retryCount: 0,
              canRetry: false,
              totalTokens: null,
              needsReview: false,
            })
          } else {
            const metricsRow = usableContentRow ?? statusRow
            const statusMetadata = parseMetadata(statusRow.metadata)
            const metricsMetadata = parseMetadata(metricsRow.metadata)
            const status = mapStage6LessonStatus(statusRow.status)
            const pipelineState = extractPipelineState(statusRow.status, statusMetadata)
            const needsReview = isReviewRequiredStatus(statusRow.status)

            lessonRows.push({
              lessonId: lessonLabel,
              lessonNumber,
              title: lessonTitle,
              status,
              pipelineState,
              qualityScore: metricsMetadata?.quality_score ?? null,
              costUsd: metricsMetadata?.cost_usd ?? 0,
              durationMs: metricsMetadata?.generation_duration_ms ?? null,
              retryCount: statusRow.generation_attempt > 1 ? statusRow.generation_attempt - 1 : 0,
              canRetry: status === 'error',
              totalTokens: metricsMetadata?.total_tokens ?? null,
              needsReview,
            })
          }
        }
      } else {
        // No lessons in DB yet - show pending based on course structure
        for (let idx = 0; idx < expectedLessonCount; idx++) {
          const lessonNumber = idx + 1
          const lessonTitle = section.lessons?.[idx]?.lesson_title || `Урок ${lessonNumber}`
          const lessonLabel = `${moduleNumber}.${lessonNumber}`

          lessonRows.push({
            lessonId: lessonLabel,
            lessonNumber,
            title: lessonTitle,
            status: 'pending' as const,
            pipelineState: extractPipelineState('pending', null),
            qualityScore: null,
            costUsd: 0,
            durationMs: null,
            retryCount: 0,
            canRetry: false,
            totalTokens: null,
            needsReview: false,
          })
        }
      }

      // Calculate aggregates
      const aggregates = calculateReviewAwareAggregates(lessonRows)

      // Determine module status
      const moduleStatus = getReviewAwareModuleStatus(lessonRows)

      const dashboardData: ReviewAwareModuleDashboardData = {
        moduleId,
        moduleNumber,
        title: moduleTitle,
        status: moduleStatus,
        lessons: lessonRows,
        aggregates,
        needsReview: aggregates.reviewRequiredLessons > 0,
      }

      setData(dashboardData)

      logger.debug('Module dashboard data fetched', {
        moduleId,
        courseId,
        lessonsCount: lessonRows.length,
        status: moduleStatus,
      })
    } catch (err) {
      // Skip if a newer fetch was started
      if (fetchId !== fetchIdRef.current) return

      const fetchError = err instanceof Error ? err : new Error('Ошибка загрузки данных')
      setError(fetchError)
      setData(null)

      // Log the actual error for debugging
      console.error('[useModuleDashboardData] Fetch error:', err)
      logger.error('Failed to fetch module dashboard data', {
        moduleId: moduleId || 'undefined',
        courseId: courseId || 'undefined',
        error: fetchError.message,
        stack: fetchError.stack,
      })
    } finally {
      // Skip if a newer fetch was started
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [shouldFetch, courseId, moduleId, courseStructure, getLessonCountForModule, supabase])

  // Fetch on mount and when dependencies change
  useEffect(() => {
    // Race condition guard: capture current fetchId BEFORE calling fetchLessonData
    // fetchLessonData increments fetchIdRef.current internally and checks against it
    // When user rapidly switches modules, old requests will be ignored
    const fetchIdRefLocal = fetchIdRef
    void fetchLessonData()

    return () => {
      // Cleanup: increment fetchId to mark current fetch as stale
      // This ensures any pending setState calls in fetchLessonData are skipped
      fetchIdRefLocal.current++
    }
  }, [fetchLessonData])

  // Set up realtime subscription
  useEffect(() => {
    if (!enableRealtime || !courseId || !moduleId) return

    const expectedLessonCount = getLessonCountForModule(moduleId)
    if (expectedLessonCount === 0) return

    logger.debug('Setting up realtime subscription for module', {
      moduleId,
      courseId,
      lessonCount: expectedLessonCount,
    })

    // Subscribe to changes in lesson_contents for this course
    // We filter by course_id (simpler Postgres filter) but only react to changes
    // relevant to the current module by checking against moduleContentIdsRef
    const channel = supabase
      .channel(`module_dashboard:${moduleId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'lesson_contents',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          const newRow = payload.new as Partial<LessonContentRow> | undefined
          const oldRow = payload.old as Partial<LessonContentRow> | undefined
          const changedId = newRow?.id || oldRow?.id
          const lessonId = newRow?.lesson_id || oldRow?.lesson_id

          // Only refetch if the changed lesson content is in THIS module
          // For UPDATE/DELETE: check if content ID is in our tracked set
          // For INSERT: check if the lesson_id belongs to this module
          const isExistingContentInModule = changedId && moduleContentIdsRef.current.has(changedId)
          const isNewContentForModuleLesson =
            payload.eventType === 'INSERT' && lessonId && moduleLessonIdsRef.current.has(lessonId)

          if (isExistingContentInModule || isNewContentForModuleLesson) {
            logger.debug('Realtime update received for module lesson', {
              event: payload.eventType,
              lessonContentId: changedId,
              lessonId,
              isExistingContentInModule,
              isNewContentForModuleLesson,
            })

            // Refetch data to get updated state
            void fetchLessonData()
          } else {
            logger.debug('Realtime update ignored (not in current module)', {
              event: payload.eventType,
              lessonContentId: changedId,
              lessonId,
            })
          }
        }
      )
      .subscribe()

    return () => {
      logger.debug('Unsubscribing from realtime channel', { moduleId })
      void channel.unsubscribe()
    }
  }, [enableRealtime, courseId, moduleId, getLessonCountForModule, fetchLessonData, supabase])

  // Refetch function for manual refresh
  const refetch = useCallback(() => {
    void fetchLessonData()
  }, [fetchLessonData])

  return {
    data,
    isLoading,
    error,
    refetch,
  }
}
