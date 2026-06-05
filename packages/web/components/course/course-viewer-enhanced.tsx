'use client'

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { BookOpen, CheckCircle2, Clock, GitBranch, LayoutGrid, TimerReset } from 'lucide-react'
import { usePrevious } from '@/lib/hooks/use-previous'
import { motion } from 'framer-motion'
import Header from '@/components/layouts/header'
import ContentGenerationPanel from '@/components/common/content-generation-panel'
import { Button } from '@/components/ui/button'
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
import { buildCourseGeneratingUrl, buildCourseLessonsUrl } from '@/lib/helpers/course-urls'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database.generated'
import type { Course, Lesson, Section } from '@/types/database'

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
  const [inspectorOpen, setInspectorOpen] = useState(true)

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
    <div
      className={cn('career-playbook-zone min-h-screen', focusMode && 'bg-white dark:bg-gray-950')}
    >
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
          className="flex min-w-0 flex-1 flex-col"
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
            inspectorOpen={inspectorOpen}
            onToggleSidebar={() => setSidebarOpen((open) => !open)}
            onToggleMobileSidebar={() => setMobileSidebarOpen(true)}
            onToggleInspector={() => setInspectorOpen((open) => !open)}
            onToggleFocusMode={() => setFocusMode(!focusMode)}
            onPrev={() => prevLesson && setCurrentLessonId(prevLesson.id)}
            onNext={() => nextLesson && setCurrentLessonId(nextLesson.id)}
          />

          <div
            className={cn(
              'grid min-h-0 flex-1 grid-cols-1',
              inspectorOpen && !focusMode && currentLesson
                ? 'xl:grid-cols-[minmax(0,1fr)_22rem]'
                : ''
            )}
          >
            <div className="min-w-0 overflow-y-auto">
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
            {inspectorOpen && !focusMode && currentLesson ? (
              <CourseReaderInspector
                course={course}
                currentLesson={currentLesson}
                currentSection={currentSection}
                completedLessons={completedLessons}
                completedCount={completedCount}
                totalLessons={totalLessons}
                progressPercentage={progressPercentage}
                remainingTime={formatTime(remainingMinutes)}
                readOnly={readOnly}
                orgSlug={orgSlug}
                onMarkComplete={markLessonComplete}
              />
            ) : null}
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

interface CourseReaderInspectorProps {
  course: Course
  currentLesson: Lesson
  currentSection?: Section
  completedLessons: Set<string>
  completedCount: number
  totalLessons: number
  progressPercentage: number
  remainingTime: string
  readOnly: boolean
  orgSlug: string
  onMarkComplete: (lessonId: string) => void
}

function CourseReaderInspector({
  course,
  currentLesson,
  currentSection,
  completedLessons,
  completedCount,
  totalLessons,
  progressPercentage,
  remainingTime,
  readOnly,
  orgSlug,
  onMarkComplete,
}: CourseReaderInspectorProps) {
  const t = useTranslations('course.viewer')
  const isCompleted = completedLessons.has(currentLesson.id)
  const courseKey = course.slug || course.id

  return (
    <aside
      role="complementary"
      aria-label={t('inspectorTitle')}
      className="career-playbook-panel m-4 hidden min-w-0 space-y-4 p-4 xl:sticky xl:top-24 xl:block xl:self-start"
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-[0.08em] text-purple-700 uppercase dark:text-purple-300">
          {t('inspectorTitle')}
        </p>
        <h2 className="text-lg leading-snug font-semibold text-gray-950 dark:text-white">
          {currentLesson.title}
        </h2>
        {currentSection ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('section')} {currentSection.section_number}: {currentSection.title}
          </p>
        ) : null}
      </div>

      <div className="career-playbook-muted-card space-y-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('overallProgress')}
          </span>
          <span className="text-sm font-semibold text-gray-950 dark:text-white">
            {Math.round(progressPercentage)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800">
          <div
            className="h-2 rounded-full bg-purple-600 transition-all dark:bg-purple-400"
            style={{ width: `${Math.min(100, Math.max(0, progressPercentage))}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="career-playbook-soft-card p-2">
            <CheckCircle2 className="mb-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <p className="font-semibold text-gray-950 dark:text-white">
              {completedCount}/{totalLessons}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('completed')}</p>
          </div>
          <div className="career-playbook-soft-card p-2">
            <TimerReset className="mb-2 h-4 w-4 text-blue-600 dark:text-blue-400" />
            <p className="font-semibold text-gray-950 dark:text-white">{remainingTime}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('timeRemaining')}</p>
          </div>
        </div>
      </div>

      <div className="career-playbook-muted-card space-y-3 p-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('inspectorCurrentLesson')}
        </p>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Clock className="h-4 w-4" />
          {t('readingTime', { minutes: currentLesson.duration_minutes ?? 0 })}
        </div>
        <Button
          type="button"
          onClick={() => onMarkComplete(currentLesson.id)}
          variant={isCompleted ? 'secondary' : 'default'}
          className="w-full justify-center"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {isCompleted ? t('markedComplete') : t('markComplete')}
        </Button>
      </div>

      <div className="grid gap-2">
        <Button asChild variant="outline" className="justify-start">
          <Link href={buildCourseLessonsUrl(orgSlug, courseKey)}>
            <LayoutGrid className="mr-2 h-4 w-4" />
            {t('allLessons')}
          </Link>
        </Button>
        {!readOnly ? (
          <Button asChild variant="outline" className="justify-start">
            <Link href={buildCourseGeneratingUrl(orgSlug, courseKey, true)} target="_blank">
              <GitBranch className="mr-2 h-4 w-4" />
              {t('constructor')}
            </Link>
          </Button>
        ) : null}
        <div className="career-playbook-muted-card flex items-center gap-2 p-3 text-sm text-gray-600 dark:text-gray-400">
          <BookOpen className="h-4 w-4" />
          <span>{t('inspectorNextStep')}</span>
        </div>
      </div>
    </aside>
  )
}
