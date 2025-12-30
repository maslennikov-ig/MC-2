"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import type { Course, Section, Lesson } from "@/types/database"

export function useViewerState(course: Course, rawSections: Section[], rawLessons: Lesson[]) {
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

  // Sort sections and lessons
  const sections = useMemo(() => {
    const safeSections = rawSections || []
    return safeSections.length > 0 
      ? [...safeSections].sort((a, b) => Number(a?.section_number || 0) - Number(b?.section_number || 0))
      : []
  }, [rawSections])
  
  const lessons = useMemo(() => {
    const safeLessons = rawLessons || []
    return safeLessons.length > 0
      ? [...safeLessons].sort((a, b) => Number(a?.lesson_number || 0) - Number(b?.lesson_number || 0))
      : []
  }, [rawLessons])

  // Group lessons by section
  const lessonsBySection = useMemo(() => {
    return sections.reduce((acc, section) => {
      acc[section.id] = lessons
        .filter(lesson => lesson.section_id === section.id)
        .sort((a, b) => Number(a.lesson_number) - Number(b.lesson_number))
      return acc
    }, {} as Record<string, Lesson[]>)
  }, [sections, lessons])

  // Mobile detection
  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 1024)
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
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
    } catch (e) {}
  }, [course.id])

  useEffect(() => {
    const storageKey = `course-progress-${course.id}`
    const progressData = {
      completedLessons: Array.from(completedLessons),
      lastUpdated: new Date().toISOString()
    }
    localStorage.setItem(storageKey, JSON.stringify(progressData))
  }, [course.id, completedLessons])

  // Initial lesson selection
  useEffect(() => {
    if (!currentLessonId && sections.length > 0 && lessonsBySection[sections[0].id]?.length > 0) {
      setCurrentLessonId(lessonsBySection[sections[0].id][0].id)
      setExpandedSections(new Set([sections[0].id]))
    }
  }, [sections, lessonsBySection, currentLessonId])

  const currentLesson = useMemo(() => lessons.find(l => l.id === currentLessonId), [lessons, currentLessonId])
  const currentSection = useMemo(() => sections.find(s => s.id === currentLesson?.section_id), [sections, currentLesson])

  const allLessonsOrdered = useMemo(() => sections.flatMap(section => lessonsBySection[section.id] || []), [sections, lessonsBySection])
  const currentIndex = useMemo(() => allLessonsOrdered.findIndex(l => l.id === currentLessonId), [allLessonsOrdered, currentLessonId])
  const prevLesson = currentIndex > 0 ? allLessonsOrdered[currentIndex - 1] : null
  const nextLesson = currentIndex < allLessonsOrdered.length - 1 ? allLessonsOrdered[currentIndex + 1] : null

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
  const totalMinutes = useMemo(() => lessons.reduce((sum, lesson) => sum + (lesson.duration_minutes || 5), 0), [lessons])
  const completedMinutes = useMemo(() => Array.from(completedLessons).reduce((sum, lessonId) => {
    const lesson = lessons.find(l => l.id === lessonId)
    return sum + (lesson?.duration_minutes || 5)
  }, 0), [completedLessons, lessons])
  const remainingMinutes = totalMinutes - completedMinutes

  // Handlers
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

  const markLessonComplete = useCallback((lessonId: string) => {
    setCompletedLessons(prev => {
      const next = new Set(prev)
      if (next.has(lessonId)) next.delete(lessonId)
      else next.add(lessonId)
      return next
    })
  }, [])

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
    markLessonComplete
  }
}
