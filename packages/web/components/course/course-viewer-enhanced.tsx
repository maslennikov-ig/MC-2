'use client'

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { usePrevious } from '@/lib/hooks/use-previous'
import { motion } from 'framer-motion'
import Header from '@/components/layouts/header'
import ContentGenerationPanel from '@/components/common/content-generation-panel'
import { useSwipe } from '@/lib/hooks/use-swipe'
import { toast } from 'sonner'
import { useViewerState } from './viewer/hooks/useViewerState'
import { Sidebar } from './viewer/components/Sidebar'
import { Toolbar } from './viewer/components/Toolbar'
import { LessonView } from './viewer/components/LessonView'
import { FAB } from './viewer/components/FAB'
import { SharedCourseBanner } from './viewer/components/SharedCourseBanner'
import { BreadcrumbNav } from './viewer/components/BreadcrumbNav'
import type { CourseViewerProps } from './viewer/types'
import { useServerData } from '@/lib/hooks/useServerData'
import { getLessonEnrichments } from '@/app/actions/enrichment-actions'
import { getSupabaseClient } from '@/lib/supabase/browser-client'
import { createLogger } from '@/lib/client-logger'
import type { Database } from '@/types/database.generated'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

const HIDDEN_ENRICHMENT_STATUSES = new Set<EnrichmentRow['status']>(['failed', 'cancelled'])
const REALTIME_FALLBACK_INTERVAL_MS = 15000
const log = createLogger({ component: 'CourseViewerEnhanced' })

export default function CourseViewerEnhanced({
  course,
  sections: rawSections,
  lessons: rawLessons,
  assets,
  enrichments,
  enrichmentsLoadError,
  lessonContents,
  readOnly = false,
  initialLessonLabel,
  orgSlug,
}: CourseViewerProps) {
  // Runtime validation: orgSlug is required (no fallback to old URL format)
  if (!orgSlug) {
    console.error('[CourseViewerEnhanced] orgSlug is required but missing')
    throw new Error('Organization slug is required for course viewer')
  }
  const {
    sections,
    lessons,
    lessonsBySection,
    currentLessonId,
    setCurrentLessonId,
    currentLesson,
    currentSection,
    prevLesson,
    nextLesson,
    allLessonsOrdered,
    currentIndex,
    sidebarOpen,
    setSidebarOpen,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    completedLessons,
    expandedSections,
    generationPanelOpen,
    setGenerationPanelOpen,
    focusMode,
    setFocusMode,
    showFab,
    isMobile,
    totalLessons,
    completedCount,
    progressPercentage,
    totalMinutes,
    remainingMinutes,
    toggleSection,
    markLessonComplete,
  } = useViewerState(course, orgSlug, rawSections, rawLessons, initialLessonLabel)

  // Manage enrichments with refetch capability
  const {
    data: localEnrichments,
    refetch: refetchEnrichments,
    isRefetching: isEnrichmentsRefetching,
    setData: setLocalEnrichments,
  } = useServerData({
    initialData: enrichments,
    key: 'enrichments',
  })
  const localEnrichmentsRef = useRef(localEnrichments)
  const currentLessonIdRef = useRef(currentLessonId)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)

  useEffect(() => {
    localEnrichmentsRef.current = localEnrichments
  }, [localEnrichments])

  useEffect(() => {
    currentLessonIdRef.current = currentLessonId
  }, [currentLessonId])

  // Callback to refresh enrichments for current lesson.
  // Uses ref for localEnrichments to avoid capturing stale state on rapid lesson switching.
  const refreshEnrichments = useCallback(
    async (lessonIdToRefresh?: string) => {
      const lid = lessonIdToRefresh ?? currentLessonIdRef.current
      if (!lid || !course.id) return

      await refetchEnrichments(async () => {
        const result = await getLessonEnrichments({
          lessonId: lid,
          courseId: course.id,
        })

        if (result.success && result.enrichments) {
          // Use ref to read latest state and merge — avoids overwriting
          // concurrent updates from other lessons or Realtime events
          return {
            ...(localEnrichmentsRef.current ?? {}),
            [lid]: result.enrichments,
          }
        }
        return null
      })
    },
    [course.id, refetchEnrichments]
  )

  const applyRealtimeEnrichmentUpdate = useCallback(
    (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      nextRecord?: Partial<EnrichmentRow>,
      previousRecord?: Partial<EnrichmentRow>
    ) => {
      // For DELETE events, Supabase sends the old record only (new is empty).
      // For INSERT/UPDATE, prefer the new record.
      const record = eventType === 'DELETE' ? previousRecord : nextRecord
      const lessonId = record?.lesson_id ?? previousRecord?.lesson_id
      const enrichmentId = record?.id ?? previousRecord?.id
      if (!lessonId || !enrichmentId) return

      setLocalEnrichments((prev) => {
        const nextState = { ...(prev ?? {}) }
        const currentLessonItems = [...(nextState[lessonId] ?? [])]
        const existingIndex = currentLessonItems.findIndex((item) => item.id === enrichmentId)

        const shouldRemove =
          eventType === 'DELETE' ||
          (typeof nextRecord?.status === 'string' &&
            HIDDEN_ENRICHMENT_STATUSES.has(nextRecord.status))

        if (shouldRemove) {
          if (existingIndex >= 0) {
            currentLessonItems.splice(existingIndex, 1)
          }
        } else if (nextRecord) {
          // Filter out undefined values from partial UPDATE payloads to prevent
          // overwriting existing fields with undefined
          const cleanRecord = Object.fromEntries(
            Object.entries(nextRecord).filter(([, v]) => v !== undefined)
          )
          const mergedRow =
            existingIndex >= 0
              ? ({ ...currentLessonItems[existingIndex], ...cleanRecord } as EnrichmentRow)
              : (nextRecord as EnrichmentRow)

          if (existingIndex >= 0) {
            currentLessonItems[existingIndex] = mergedRow
          } else {
            currentLessonItems.push(mergedRow)
          }

          currentLessonItems.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        }

        if (currentLessonItems.length > 0) {
          nextState[lessonId] = currentLessonItems
        } else {
          delete nextState[lessonId]
        }

        return nextState
      })
    },
    [setLocalEnrichments]
  )

  // Track previous lesson to detect lesson changes (SPA navigation)
  const prevLessonId = usePrevious(currentLessonId)

  // Auto-refresh enrichments when switching lessons via SPA navigation
  // This ensures fresh data instead of stale SSR cache
  useEffect(() => {
    if (prevLessonId === undefined) return undefined

    if (prevLessonId !== currentLessonId && currentLessonId) {
      void refreshEnrichments(currentLessonId)
    }
    return undefined
  }, [currentLessonId, prevLessonId, refreshEnrichments])

  useEffect(() => {
    if (!course.id) return undefined

    const supabase = getSupabaseClient()
    let isMounted = true

    const channel = supabase
      .channel(`viewer:enrichments:${course.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lesson_enrichments',
          filter: `course_id=eq.${course.id}`,
        },
        (payload) => {
          applyRealtimeEnrichmentUpdate(
            payload.eventType,
            payload.new as Partial<EnrichmentRow>,
            payload.old as Partial<EnrichmentRow>
          )
        }
      )
      .subscribe((status, err) => {
        if (!isMounted) return
        const s = status as string

        if (s === 'SUBSCRIBED') {
          setIsRealtimeConnected(true)
          log.info('Realtime connected', { courseId: course.id })
          return
        }

        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setIsRealtimeConnected(false)
          log.warn('Realtime disconnected in course viewer', {
            status: s,
            courseId: course.id,
            error: err?.message,
          })
        }
      })

    return () => {
      isMounted = false
      setIsRealtimeConnected(false)
      void supabase.removeChannel(channel)
    }
  }, [applyRealtimeEnrichmentUpdate, course.id])

  useEffect(() => {
    if (isRealtimeConnected || !currentLessonId) return undefined

    const interval = setInterval(() => {
      // Read from ref to avoid stale closure capturing old lessonId
      const lid = currentLessonIdRef.current
      if (lid) void refreshEnrichments(lid)
    }, REALTIME_FALLBACK_INTERVAL_MS)

    return () => {
      clearInterval(interval)
    }
    // currentLessonId triggers re-subscribe, ref ensures fresh value inside callback
  }, [currentLessonId, isRealtimeConnected, refreshEnrichments])

  // Swipe logic for mobile navigation
  const swipeHandlers = useSwipe(
    {
      onSwipeLeft: () => {
        if (nextLesson && currentLessonId) {
          setCurrentLessonId(nextLesson.id)
          toast.success(`Переход к уроку: ${nextLesson.title}`, {
            duration: 2000,
            position: 'top-center',
          })
        } else if (!nextLesson && currentLessonId) {
          toast.info('Это последний урок в курсе', {
            duration: 2000,
            position: 'top-center',
          })
        }
      },
      onSwipeRight: () => {
        if (prevLesson && currentLessonId) {
          setCurrentLessonId(prevLesson.id)
          toast.success(`Переход к уроку: ${prevLesson.title}`, {
            duration: 2000,
            position: 'top-center',
          })
        } else if (!prevLesson && currentLessonId) {
          toast.info('Это первый урок в курсе', {
            duration: 2000,
            position: 'top-center',
          })
        }
      },
    },
    {
      threshold: 75,
      preventDefaultTouchmoveEvent: false,
    }
  )

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}ч ${mins}м`
    }
    return `${mins} мин`
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Subtle gradient overlay */}
      {!focusMode && (
        <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-transparent via-purple-50/10 to-purple-100/20 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />
      )}

      {!focusMode && <Header />}

      {/* Shared Course Banner - shown when readOnly is true */}
      {readOnly && !focusMode && <SharedCourseBanner />}

      <div className="relative z-10 flex min-h-screen">
        <Sidebar
          course={course}
          sections={sections}
          lessonsBySection={lessonsBySection}
          currentLessonId={currentLessonId}
          completedLessons={completedLessons}
          expandedSections={expandedSections}
          sidebarOpen={sidebarOpen}
          mobileSidebarOpen={mobileSidebarOpen}
          focusMode={focusMode}
          completedCount={completedCount}
          totalLessons={totalLessons}
          remainingMinutes={remainingMinutes}
          orgSlug={orgSlug}
          readOnly={readOnly}
          onToggleSidebar={setSidebarOpen}
          onToggleMobileSidebar={setMobileSidebarOpen}
          onToggleSection={toggleSection}
          onSelectLesson={setCurrentLessonId}
        />

        <motion.div
          className="flex flex-1 flex-col"
          animate={{
            width: sidebarOpen && !focusMode ? 'auto' : '100%',
          }}
          transition={{
            type: 'spring',
            damping: 25,
            stiffness: 300,
            mass: 0.5,
          }}
        >
          <BreadcrumbNav
            course={course}
            currentSection={currentSection}
            currentLesson={currentLesson}
            focusMode={focusMode}
            orgSlug={orgSlug}
          />
          <Toolbar
            currentSection={currentSection}
            currentLesson={currentLesson}
            course={course}
            isMobile={isMobile}
            sidebarOpen={sidebarOpen}
            focusMode={focusMode}
            totalLessons={totalLessons}
            totalTime={formatTime(totalMinutes)}
            progressPercentage={progressPercentage}
            hasPrev={!!prevLesson}
            hasNext={!!nextLesson}
            readOnly={readOnly}
            orgSlug={orgSlug}
            onToggleSidebar={() => setSidebarOpen(true)}
            onToggleMobileSidebar={() => setMobileSidebarOpen(true)}
            onToggleFocusMode={() => setFocusMode(!focusMode)}
            onPrev={() => prevLesson && setCurrentLessonId(prevLesson.id)}
            onNext={() => nextLesson && setCurrentLessonId(nextLesson.id)}
          />

          <div className="flex-1 overflow-y-auto">
            {currentLesson ? (
              <Suspense
                fallback={
                  <div className="flex min-h-[400px] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                  </div>
                }
              >
                <LessonView
                  currentLesson={currentLesson}
                  currentSection={currentSection}
                  assets={currentLessonId ? assets?.[currentLessonId] : undefined}
                  enrichments={currentLessonId ? localEnrichments?.[currentLessonId] : undefined}
                  enrichmentsLoadError={enrichmentsLoadError}
                  isEnrichmentsLoading={isEnrichmentsRefetching}
                  lessonContent={currentLessonId ? lessonContents?.[currentLessonId] : undefined}
                  focusMode={focusMode}
                  currentIndex={currentIndex}
                  totalLessonsOrdered={allLessonsOrdered.length}
                  completedLessons={completedLessons}
                  allLessonsOrdered={allLessonsOrdered}
                  sections={sections}
                  lessonsBySection={lessonsBySection}
                  completedCount={completedCount}
                  remainingTime={formatTime(remainingMinutes)}
                  progressPercentage={progressPercentage}
                  swipeHandlers={swipeHandlers}
                  onPrev={() => prevLesson && setCurrentLessonId(prevLesson.id)}
                  onNext={() => nextLesson && setCurrentLessonId(nextLesson.id)}
                  onSelectLesson={setCurrentLessonId}
                  onMarkComplete={markLessonComplete}
                  onExitFocus={() => setFocusMode(false)}
                  onRefreshEnrichments={() => void refreshEnrichments()}
                  courseLanguage={
                    (course.request_data?.language as string) || course.language || 'ru'
                  }
                />
              </Suspense>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-gray-500 dark:text-white/50">
                  <p>Выберите урок для начала обучения</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Floating Action Button for Generation - Desktop only, hidden in readOnly mode */}
      {!readOnly && !focusMode && currentLesson && !isMobile && (
        <FAB showFab={showFab} onOpenPanel={() => setGenerationPanelOpen(true)} />
      )}

      {/* Content Generation Panel - hidden in readOnly mode */}
      {!readOnly && (
        <ContentGenerationPanel
          open={generationPanelOpen}
          onClose={() => setGenerationPanelOpen(false)}
          courseId={course.id}
          courseTitle={course.title}
          courseLanguage={(course.request_data?.language as string) || course.language || 'ru'}
          sections={sections}
          lessons={lessons}
          selectedLessons={currentLessonId ? [currentLessonId] : []}
        />
      )}
    </div>
  )
}
