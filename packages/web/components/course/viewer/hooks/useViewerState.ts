'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { Course, Section, Lesson } from '@/types/database'
import { findLessonIdByLabel, getLessonLabel } from '@/lib/course-data-utils'

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

  // Refs for preventing race conditions
  const hasInitializedRef = useRef(false)
  const lastSyncedLabelRef = useRef<string | null>(null)

  const router = useRouter()
  const pathname = usePathname()

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

  // Mobile detection
  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 1024)
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  // Get current user for server sync
  useEffect(() => {
    const getUserId = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const data = await response.json()
          setUserId(data.user?.id || null)
        }
      } catch {
        // Offline or error - continue with localStorage only
      }
    }
    getUserId()
  }, [])

  // Progress persistence
  useEffect(() => {
    const storageKey = `course-progress-${course.id}`
    try {
      const savedProgress = localStorage.getItem(storageKey)
      if (savedProgress) {
        const { completedLessons: saved } = JSON.parse(savedProgress)
        setCompletedLessons(new Set(saved))
      }
    } catch (_e) {
      // Silent failure acceptable - progress persistence is a nice-to-have feature
      // localStorage may be unavailable or corrupted; user can continue without saved progress
    }
  }, [course.id])

  useEffect(() => {
    const storageKey = `course-progress-${course.id}`
    const progressData = {
      completedLessons: Array.from(completedLessons),
      lastUpdated: new Date().toISOString(),
    }
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

  // Fetch server progress and merge with localStorage
  useEffect(() => {
    if (!userId || !course.slug) return

    let cancelled = false

    const fetchServerProgress = async () => {
      try {
        const response = await fetch(`/api/courses/${course.slug}/progress`)
        if (response.ok && !cancelled) {
          const data = await response.json()
          if (data.lessons_completed && Array.isArray(data.lessons_completed)) {
            setCompletedLessons((prev) => {
              const merged = new Set([...prev, ...data.lessons_completed])
              return merged
            })
          }
        }
      } catch {
        // Offline - use localStorage only
      }
    }

    fetchServerProgress()

    return () => {
      cancelled = true
    }
  }, [userId, course.slug])

  // Initial lesson selection from URL or first lesson
  useEffect(() => {
    if (hasInitializedRef.current || currentLessonId) return

    if (sections.length === 0 || Object.keys(lessonsBySection).length === 0) return

    let initialLessonId: string | null = null

    if (initialLessonLabel) {
      initialLessonId = findLessonIdByLabel(sections, lessons, initialLessonLabel)
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
  }, [sections, lessonsBySection, lessons, initialLessonLabel])

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
  }
}
