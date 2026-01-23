'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { Course, Section, Lesson } from '@/types/database'
import { getLessonLabel } from '@/lib/course-data-utils'
import { BREAKPOINTS } from '@/lib/constants/breakpoints'
import { useAuth } from '@/lib/hooks/use-auth'

/** Structure for localStorage progress with timestamps (CR-005) */
interface LocalProgressData {
  completedLessons: string[]
  lastUpdated: string
}

export function useViewerState(
  course: Course,
  rawSections: Section[],
  rawLessons: Lesson[],
  initialLessonLabel?: string
) {
  const [currentLessonId, setCurrentLessonId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [generationPanelOpen, setGenerationPanelOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [showFab, setShowFab] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  // CR-019: Loading state for sync
  const [isSyncingProgress, setIsSyncingProgress] = useState(false)

  // Refs for preventing race conditions
  const hasInitializedRef = useRef(false)
  const lastSyncedLabelRef = useRef<string | null>(null)

  const router = useRouter()
  const pathname = usePathname()
  const { user: authUser } = useAuth()

  // Sort sections and lessons
  const sections = useMemo(() => {
    const safeSections = rawSections || []
    return safeSections.length > 0
      ? [...safeSections].sort(
          (a, b) => Number(a?.section_number || 0) - Number(b?.section_number || 0)
        )
      : []
  }, [rawSections])

  const lessons = useMemo(() => {
    const safeLessons = rawLessons || []
    return safeLessons.length > 0
      ? [...safeLessons].sort(
          (a, b) => Number(a?.lesson_number || 0) - Number(b?.lesson_number || 0)
        )
      : []
  }, [rawLessons])

  // Group lessons by section
  const lessonsBySection = useMemo(() => {
    return sections.reduce(
      (acc, section) => {
        acc[section.id] = lessons
          .filter((lesson) => lesson.section_id === section.id)
          .sort((a, b) => Number(a.lesson_number) - Number(b.lesson_number))
        return acc
      },
      {} as Record<string, Lesson[]>
    )
  }, [sections, lessons])

  // CR-011: Memoized lookup map for O(1) label-to-lessonId resolution
  const lessonLabelMap = useMemo(() => {
    const map = new Map<string, string>() // label -> lessonId
    for (const section of sections) {
      const sectionLessons = lessonsBySection[section.id] || []
      for (const lesson of sectionLessons) {
        const label = getLessonLabel(lesson, sections)
        if (label) {
          map.set(label, lesson.id)
        }
      }
    }
    return map
  }, [sections, lessonsBySection])

  // Mobile detection (CR-015: use constant instead of magic number)
  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < BREAKPOINTS.lg)
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  // Sync userId from auth hook
  useEffect(() => {
    setUserId(authUser?.id || null)
  }, [authUser?.id])

  // CR-005: Ref to track local progress timestamp for conflict resolution
  const localProgressTimestampRef = useRef<string | null>(null)

  // Progress persistence - load from localStorage
  useEffect(() => {
    const storageKey = `course-progress-${course.id}`
    try {
      const savedProgress = localStorage.getItem(storageKey)
      if (savedProgress) {
        const parsed: LocalProgressData = JSON.parse(savedProgress)
        setCompletedLessons(new Set(parsed.completedLessons || []))
        localProgressTimestampRef.current = parsed.lastUpdated || null
      }
    } catch (_e) {
      // Silent failure acceptable - progress persistence is a nice-to-have feature
      // localStorage may be unavailable or corrupted; user can continue without saved progress
    }
  }, [course.id])

  // Progress persistence - save to localStorage
  useEffect(() => {
    const storageKey = `course-progress-${course.id}`
    const now = new Date().toISOString()
    const progressData: LocalProgressData = {
      completedLessons: Array.from(completedLessons),
      lastUpdated: now,
    }
    localProgressTimestampRef.current = now
    localStorage.setItem(storageKey, JSON.stringify(progressData))
  }, [course.id, completedLessons])

  // Sync progress to server (fire and forget)
  const syncProgressToServer = useCallback(
    async (lessonId: string, action: 'mark_complete' | 'mark_incomplete') => {
      if (!userId) return

      try {
        await fetch(`/api/courses/${course.slug}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lesson_id: lessonId, action }),
        })
      } catch {
        // Offline - progress already saved to localStorage
      }
    },
    [userId, course.slug]
  )

  // Fetch server progress with conflict resolution (CR-005) and sync loading state (CR-019)
  useEffect(() => {
    if (!userId || !course.slug) return

    let cancelled = false

    const fetchServerProgress = async () => {
      setIsSyncingProgress(true)
      try {
        const response = await fetch(`/api/courses/${course.slug}/progress`)
        if (response.ok && !cancelled) {
          const data = await response.json()
          if (data.lessons_completed && Array.isArray(data.lessons_completed)) {
            // CR-005: Conflict resolution using "last-write-wins" with timestamps
            // Compare server's last_accessed with local timestamp
            const serverTimestamp = data.last_accessed ? new Date(data.last_accessed).getTime() : 0
            const localTimestamp = localProgressTimestampRef.current
              ? new Date(localProgressTimestampRef.current).getTime()
              : 0

            if (serverTimestamp > localTimestamp) {
              // Server is newer - use server data (handles mark_incomplete from other device)
              setCompletedLessons(new Set(data.lessons_completed))
            } else {
              // Local is newer or equal - merge (add-only for local changes)
              setCompletedLessons((prev) => {
                const merged = new Set([...prev, ...data.lessons_completed])
                return merged
              })
            }
          }
        }
      } catch {
        // Offline - use localStorage only
      } finally {
        if (!cancelled) {
          setIsSyncingProgress(false)
        }
      }
    }

    fetchServerProgress()

    return () => {
      cancelled = true
    }
  }, [userId, course.slug])

  // Initial lesson selection from URL or first lesson
  // CR-011: Uses memoized lessonLabelMap for O(1) lookup instead of O(n+m) findLessonIdByLabel
  useEffect(() => {
    if (hasInitializedRef.current || currentLessonId) return

    if (sections.length === 0 || Object.keys(lessonsBySection).length === 0) return

    let initialLessonId: string | null = null

    if (initialLessonLabel) {
      // CR-011: O(1) lookup using memoized map
      initialLessonId = lessonLabelMap.get(initialLessonLabel) || null
    }

    if (!initialLessonId && sections[0] && lessonsBySection[sections[0].id]?.length > 0) {
      initialLessonId = lessonsBySection[sections[0].id][0].id
    }

    if (initialLessonId) {
      setCurrentLessonId(initialLessonId)
      const lesson = lessons.find((l) => l.id === initialLessonId)
      if (lesson?.section_id) {
        setExpandedSections(new Set([lesson.section_id]))
      }
      hasInitializedRef.current = true
    }
  }, [sections, lessonsBySection, lessons, initialLessonLabel, lessonLabelMap])

  // Sync URL when lesson changes
  useEffect(() => {
    if (!currentLessonId) return

    const currentLesson = lessons.find((l) => l.id === currentLessonId)
    if (!currentLesson) return

    const label = getLessonLabel(currentLesson, sections)
    if (!label) return

    // Only sync if different from last synced value (prevents infinite loop)
    if (lastSyncedLabelRef.current !== label) {
      const params = new URLSearchParams(window.location.search)
      params.set('lesson', label)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      lastSyncedLabelRef.current = label
    }
  }, [currentLessonId, lessons, sections, pathname])

  const currentLesson = useMemo(
    () => lessons.find((l) => l.id === currentLessonId),
    [lessons, currentLessonId]
  )
  const currentSection = useMemo(
    () => sections.find((s) => s.id === currentLesson?.section_id),
    [sections, currentLesson]
  )

  const allLessonsOrdered = useMemo(
    () => sections.flatMap((section) => lessonsBySection[section.id] || []),
    [sections, lessonsBySection]
  )
  const currentIndex = useMemo(
    () => allLessonsOrdered.findIndex((l) => l.id === currentLessonId),
    [allLessonsOrdered, currentLessonId]
  )
  const prevLesson = currentIndex > 0 ? allLessonsOrdered[currentIndex - 1] : null
  const nextLesson =
    currentIndex < allLessonsOrdered.length - 1 ? allLessonsOrdered[currentIndex + 1] : null

  // FAB visibility
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const scrollingDown = currentScrollY > lastScrollY
      const scrollThreshold = 100
      if (!scrollingDown || currentScrollY < scrollThreshold) setShowFab(true)
      else if (scrollingDown && currentScrollY > scrollThreshold) setShowFab(false)
      setLastScrollY(currentScrollY)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY])

  // Calculations
  const totalLessons = lessons.length
  const completedCount = completedLessons.size
  const progressPercentage = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0
  const totalMinutes = useMemo(
    () => lessons.reduce((sum, lesson) => sum + (lesson.duration_minutes || 5), 0),
    [lessons]
  )
  const completedMinutes = useMemo(
    () =>
      Array.from(completedLessons).reduce((sum, lessonId) => {
        const lesson = lessons.find((l) => l.id === lessonId)
        return sum + (lesson?.duration_minutes || 5)
      }, 0),
    [completedLessons, lessons]
  )
  const remainingMinutes = totalMinutes - completedMinutes

  // Handlers
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

  const markLessonComplete = useCallback(
    (lessonId: string) => {
      setCompletedLessons((prev) => {
        const next = new Set(prev)
        const isCompleting = !next.has(lessonId)
        if (isCompleting) {
          next.add(lessonId)
        } else {
          next.delete(lessonId)
        }

        // Async sync to server (fire and forget)
        syncProgressToServer(lessonId, isCompleting ? 'mark_complete' : 'mark_incomplete')

        return next
      })
    },
    [syncProgressToServer]
  )

  return {
    sections,
    lessons,
    lessonsBySection,
    // CR-011: Memoized label-to-lessonId map for O(1) lookups
    lessonLabelMap,
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
    // CR-019: Loading state for progress sync
    isSyncingProgress,
    totalLessons,
    completedCount,
    progressPercentage,
    totalMinutes,
    remainingMinutes,
    toggleSection,
    markLessonComplete,
  }
}
