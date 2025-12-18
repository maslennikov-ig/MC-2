"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Clock, 
  Activity, 
  X, 
  Home, 
  ArrowLeft,
  GraduationCap,
  BarChart3,
  CheckCircle2,
  Circle,
  Trophy,
  Layers,
  Sparkles,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeft
} from "lucide-react"
import Link from "next/link"
import Header from "@/components/layouts/header"
import LessonContent from "@/components/common/lesson-content"
import ThemeToggle from "@/components/common/theme-toggle"
import ContentFormatSwitcher from "@/components/common/content-format-switcher"
import { Progress } from "@/components/ui/progress"
import LessonProgressCard from "@/components/common/lesson-progress-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ContentGenerationPanel from "@/components/common/content-generation-panel"
import { useSwipe } from "@/lib/hooks/use-swipe"
import { toast } from "sonner"
import type { Course, Section, Lesson, Asset, LessonActivity } from "@/types/database"

interface CourseViewerProps {
  course: Course
  sections: Section[]
  lessons: Lesson[]
  assets?: Record<string, Asset[]>
}

// Type guard to check if activity is an object
function isActivityObject(activity: string | LessonActivity): activity is LessonActivity {
  return typeof activity === 'object' && activity !== null && 'exercise_title' in activity
}

export default function CourseViewerEnhanced({ course, sections: rawSections, lessons: rawLessons, assets }: CourseViewerProps) {
  const [currentLessonId, setCurrentLessonId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [completedActivities, setCompletedActivities] = useState<Record<string, Set<number>>>({}) // Track completed activities per lesson
  const [generationPanelOpen, setGenerationPanelOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [showFab, setShowFab] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  // Sort sections and lessons to ensure correct order
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

  // Assets are loaded and processed in background

  // Group lessons by section and sort by lesson_number
  const lessonsBySection = sections.reduce((acc, section) => {
    acc[section.id] = lessons
      .filter(lesson => lesson.section_id === section.id)
      .sort((a, b) => Number(a.lesson_number) - Number(b.lesson_number))
    return acc
  }, {} as Record<string, Lesson[]>)

  // Track if we're on mobile
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  // Load progress from localStorage on mount
  useEffect(() => {
    const storageKey = `course-progress-${course.id}`
    try {
      const savedProgress = localStorage.getItem(storageKey)
      if (savedProgress) {
        const { completedLessons: saved, completedActivities: savedActivities } = JSON.parse(savedProgress)
        setCompletedLessons(new Set(saved))
        // Convert activities back to Sets
        const activitiesMap: Record<string, Set<number>> = {}
        for (const [lessonId, activities] of Object.entries(savedActivities || {})) {
          activitiesMap[lessonId] = new Set(activities as number[])
        }
        setCompletedActivities(activitiesMap)
      }
    } catch {
      // Progress loading failed, continue with default state
    }
  }, [course.id])

  // Save progress to localStorage whenever it changes
  useEffect(() => {
    const storageKey = `course-progress-${course.id}`
    // Convert Sets to arrays for JSON serialization
    const activitiesArray: Record<string, number[]> = {}
    for (const [lessonId, activities] of Object.entries(completedActivities)) {
      activitiesArray[lessonId] = Array.from(activities)
    }
    const progressData = {
      completedLessons: Array.from(completedLessons),
      completedActivities: activitiesArray,
      lastUpdated: new Date().toISOString()
    }
    localStorage.setItem(storageKey, JSON.stringify(progressData))
  }, [course.id, completedLessons, completedActivities])

  // Set initial lesson and expand first section
  useEffect(() => {
    if (!currentLessonId && sections.length > 0 && lessonsBySection[sections[0].id]?.length > 0) {
      setCurrentLessonId(lessonsBySection[sections[0].id][0].id)
      setExpandedSections(new Set([sections[0].id]))
    }
  }, [sections, lessonsBySection, currentLessonId])

  const currentLesson = lessons.find(l => l.id === currentLessonId)
  const currentSection = sections.find(s => s.id === currentLesson?.section_id)

  // Navigation helpers
  const allLessonsOrdered = sections.flatMap(section => lessonsBySection[section.id] || [])
  const currentIndex = allLessonsOrdered.findIndex(l => l.id === currentLessonId)
  const prevLesson = currentIndex > 0 ? allLessonsOrdered[currentIndex - 1] : null
  const nextLesson = currentIndex < allLessonsOrdered.length - 1 ? allLessonsOrdered[currentIndex + 1] : null

  // Add swipe gestures for mobile navigation
  const { onTouchStart, onTouchMove, onTouchEnd } = useSwipe({
    onSwipeLeft: () => {
      // Swipe left to go to next lesson
      if (nextLesson && currentLessonId) {
        setCurrentLessonId(nextLesson.id)
        toast.success(`Переход к уроку: ${nextLesson.title}`, {
          duration: 2000,
          position: 'top-center'
        })
      } else if (!nextLesson && currentLessonId) {
        toast.info('Это последний урок в курсе', {
          duration: 2000,
          position: 'top-center'
        })
      }
    },
    onSwipeRight: () => {
      // Swipe right to go to previous lesson
      if (prevLesson && currentLessonId) {
        setCurrentLessonId(prevLesson.id)
        toast.success(`Переход к уроку: ${prevLesson.title}`, {
          duration: 2000,
          position: 'top-center'
        })
      } else if (!prevLesson && currentLessonId) {
        toast.info('Это первый урок в курсе', {
          duration: 2000,
          position: 'top-center'
        })
      }
    }
  }, {
    threshold: 75, // Minimum swipe distance in pixels
    preventDefaultTouchmoveEvent: false // Allow normal scrolling
  })

  // Handle keyboard shortcuts for focus mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F11 or Ctrl/Cmd + K for focus mode toggle
      if (e.key === 'F11' || ((e.ctrlKey || e.metaKey) && e.key === 'k')) {
        e.preventDefault()
        setFocusMode(prev => !prev)
      }
      // Escape to exit focus mode
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false)
      }
      // Arrow keys for navigation in focus mode
      if (focusMode && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'ArrowLeft' && prevLesson) {
          e.preventDefault()
          setCurrentLessonId(prevLesson.id)
        }
        if (e.key === 'ArrowRight' && nextLesson) {
          e.preventDefault()
          setCurrentLessonId(nextLesson.id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusMode, prevLesson, nextLesson])

  // Handle scroll to show/hide FAB
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const scrollingDown = currentScrollY > lastScrollY
      const scrollThreshold = 100
      
      // Show FAB when scrolling up or at the top
      if (!scrollingDown || currentScrollY < scrollThreshold) {
        setShowFab(true)
      } else if (scrollingDown && currentScrollY > scrollThreshold) {
        setShowFab(false)
      }
      
      setLastScrollY(currentScrollY)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY])

  // Calculate progress
  const totalLessons = lessons.length
  const completedCount = completedLessons.size
  const progressPercentage = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0

  // Calculate estimated time
  const totalMinutes = lessons.reduce((sum, lesson) => sum + (lesson.duration_minutes || 5), 0)
  const completedMinutes = Array.from(completedLessons).reduce((sum, lessonId) => {
    const lesson = lessons.find(l => l.id === lessonId)
    return sum + (lesson?.duration_minutes || 5)
  }, 0)
  const remainingMinutes = totalMinutes - completedMinutes

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId)
    } else {
      newExpanded.add(sectionId)
    }
    setExpandedSections(newExpanded)
  }

  const markLessonComplete = (lessonId: string) => {
    const newCompleted = new Set(completedLessons)
    if (newCompleted.has(lessonId)) {
      newCompleted.delete(lessonId)
    } else {
      newCompleted.add(lessonId)
    }
    setCompletedLessons(newCompleted)
  }

  const toggleActivity = (lessonId: string, activityIndex: number, totalActivities: number) => {
    const lessonActivities = completedActivities[lessonId] || new Set()
    const newActivities = new Set(lessonActivities)
    
    if (newActivities.has(activityIndex)) {
      newActivities.delete(activityIndex)
    } else {
      newActivities.add(activityIndex)
    }
    
    setCompletedActivities({
      ...completedActivities,
      [lessonId]: newActivities
    })
    
    // Auto-mark lesson as complete if all activities are done
    if (newActivities.size === totalActivities && totalActivities > 0) {
      const newCompleted = new Set(completedLessons)
      if (!newCompleted.has(lessonId)) {
        newCompleted.add(lessonId)
        setCompletedLessons(newCompleted)
      }
    }
  }

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
      {/* Subtle gradient overlay for depth without animation */}
      {!focusMode && (
        <div className="fixed inset-0 bg-gradient-to-br from-transparent via-purple-50/10 to-purple-100/20 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 pointer-events-none" />
      )}
      
      {!focusMode && <Header />}
      
      <div className="relative z-10 min-h-screen flex">
        {/* Desktop Sidebar */}
        <AnimatePresence mode="wait">
          {sidebarOpen && !focusMode && (
            <motion.aside
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="hidden lg:block w-80 bg-white dark:bg-gray-900/50 backdrop-blur-sm border-r border-gray-200 dark:border-gray-800 shadow-sm flex-shrink-0"
            >
              <div className="h-full overflow-y-auto">
                {/* Course Info Header */}
                <div className="p-6 border-b border-gray-200/60 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-4">
                    <Link 
                      href="/courses"
                      className="inline-flex items-center gap-2 text-gray-600 dark:text-white/70 hover:text-purple-600 dark:hover:text-white transition-colors group"
                    >
                      <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                      <span className="text-sm">К каталогу</span>
                    </Link>
                    <Button
                      onClick={() => setSidebarOpen(false)}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      title="Скрыть боковую панель"
                    >
                      <PanelLeftClose className="w-4 h-4" />
                    </Button>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white/90 mb-3">
                    {course.title}
                  </h2>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge variant="secondary" className="bg-purple-600 text-white border-purple-700 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30">
                      {course.difficulty}
                    </Badge>
                    <Badge variant="secondary" className="bg-blue-600 text-white border-blue-700 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30">
                      {course.style}
                    </Badge>
                  </div>
                  
                  {/* Progress Card */}
                  <LessonProgressCard
                    completedCount={completedCount}
                    totalLessons={totalLessons}
                    remainingMinutes={remainingMinutes}
                  />
                </div>

                {/* Sections & Lessons */}
                <div className="p-4 space-y-2">
                  {sections.map((section) => {
                    const sectionLessons = lessonsBySection[section.id] || []
                    const sectionCompleted = sectionLessons.filter(l => completedLessons.has(l.id)).length
                    const isExpanded = expandedSections.has(section.id)
                    
                    return (
                      <div key={section.id} className="rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleSection(section.id)}
                          className="w-full px-3 py-2 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/30 dark:to-gray-800/20 hover:from-gray-100 hover:to-gray-150 dark:hover:from-gray-800/50 dark:hover:to-gray-800/40 border border-gray-200 dark:border-gray-800 rounded-lg transition-all duration-200 flex items-center justify-between group shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight 
                              className={`w-4 h-4 text-gray-600 dark:text-white/60 transition-transform ${
                                isExpanded ? 'rotate-90' : ''
                              }`}
                            />
                            <Layers className="w-4 h-4 text-gray-600 dark:text-white/60" />
                            <span className="text-sm font-semibold text-gray-800 dark:text-white/85">
                              Модуль {section.section_number}: {section.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 font-medium dark:text-white/50">
                              {sectionCompleted}/{sectionLessons.length}
                            </span>
                            {sectionCompleted === sectionLessons.length && sectionLessons.length > 0 && (
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            )}
                          </div>
                        </button>
                        
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-1 px-2 pb-2">
                                {sectionLessons.map((lesson) => {
                                  const isCompleted = completedLessons.has(lesson.id)
                                  const isCurrent = currentLessonId === lesson.id
                                  
                                  return (
                                    <button
                                      key={lesson.id}
                                      onClick={() => setCurrentLessonId(lesson.id)}
                                      className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${
                                        isCurrent
                                          ? 'bg-purple-600 border border-purple-700 text-white dark:bg-purple-500/30 dark:border-purple-500/50 dark:text-white/90'
                                          : isCompleted
                                          ? 'bg-green-100 text-green-800 border border-green-200 dark:bg-green-500/10 dark:text-white/70 dark:border-transparent hover:bg-green-200 dark:hover:bg-green-500/20'
                                          : 'text-gray-700 dark:text-white/70 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white/90'
                                      }`}
                                    >
                                      <div className="flex-shrink-0">
                                        {isCompleted ? (
                                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                                        ) : (
                                          <BookOpen className="w-4 h-4" />
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm truncate">
                                          {lesson.lesson_number}. {lesson.title}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-white/50">
                                          <Clock className="w-3 h-3" />
                                          <span>{lesson.duration_minutes} мин</span>
                                        </div>
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Mobile Sidebar */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="lg:hidden fixed inset-0 bg-black/20 dark:bg-black/50 z-40"
                onClick={() => setMobileSidebarOpen(false)}
              />
              <motion.aside
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={{ type: "spring", damping: 25 }}
                className="lg:hidden fixed left-0 top-0 h-full w-80 bg-white dark:bg-gray-900 backdrop-blur-sm border-r border-gray-200 dark:border-gray-800 z-50 overflow-y-auto shadow-2xl"
              >
                {/* Sticky header with close button */}
                <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-10">
                  <div className="flex items-center justify-between p-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Навигация по курсу</h3>
                    <button
                      onClick={() => setMobileSidebarOpen(false)}
                      className="p-2 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      aria-label="Закрыть навигацию"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
                
                <div className="p-6">
                  
                  {/* Mobile sidebar content - same as desktop */}
                  <div className="mb-6">
                    <Link 
                      href="/courses"
                      className="inline-flex items-center gap-2 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition-colors mb-4"
                    >
                      <Home className="w-4 h-4" />
                      <span className="text-sm">К каталогу</span>
                    </Link>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white/90 mb-3">
                      {course.title}
                    </h2>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Badge variant="secondary" className="bg-purple-600 text-white border-purple-700 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30">
                        {course.difficulty}
                      </Badge>
                      <Badge variant="secondary" className="bg-blue-600 text-white border-blue-700 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30">
                        {course.style}
                      </Badge>
                    </div>
                    
                    <LessonProgressCard
                      completedCount={completedCount}
                      totalLessons={totalLessons}
                      remainingMinutes={remainingMinutes}
                      compact
                    />
                  </div>

                  {/* Mobile sections list */}
                  <div className="space-y-2">
                    {sections.map((section) => {
                      const sectionLessons = lessonsBySection[section.id] || []
                      const isExpanded = expandedSections.has(section.id)
                      
                      return (
                        <div key={section.id}>
                          <button
                            onClick={() => toggleSection(section.id)}
                            className="w-full px-3 py-2 bg-gradient-to-r from-purple-100 to-purple-50 dark:from-gray-800/30 dark:to-gray-800/20 rounded-lg flex items-center justify-between"
                          >
                            <span className="text-sm font-semibold text-gray-800 dark:text-white/85">
                              Модуль {section.section_number}: {section.title}
                            </span>
                            <ChevronRight 
                              className={`w-4 h-4 text-gray-600 dark:text-white/60 transition-transform ${
                                isExpanded ? 'rotate-90' : ''
                              }`}
                            />
                          </button>
                          
                          {isExpanded && (
                            <div className="mt-1 space-y-1 px-2">
                              {sectionLessons.map((lesson) => {
                                const isCompleted = completedLessons.has(lesson.id)
                                const isCurrent = currentLessonId === lesson.id
                                
                                return (
                                  <button
                                    key={lesson.id}
                                    onClick={() => {
                                      setCurrentLessonId(lesson.id)
                                      setMobileSidebarOpen(false)
                                    }}
                                    className={`w-full text-left px-3 py-3 min-h-[44px] rounded-lg transition-all flex items-center gap-2 ${
                                      isCurrent
                                        ? 'bg-purple-600 text-white dark:bg-purple-500/30 dark:text-white'
                                        : isCompleted
                                        ? 'bg-green-100 text-green-800 dark:bg-green-500/10 dark:text-white/70 hover:bg-green-200 dark:hover:bg-green-500/20'
                                        : 'text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                                    }`}
                                  >
                                    <div className="flex-shrink-0">
                                      {isCompleted ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                      ) : (
                                        <BookOpen className="w-5 h-5" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">
                                        {lesson.lesson_number}. {lesson.title}
                                      </div>
                                      {lesson.duration_minutes && (
                                        <div className="flex items-center gap-1 mt-0.5 text-xs opacity-75">
                                          <Clock className="w-3 h-3" />
                                          <span>{lesson.duration_minutes} мин</span>
                                        </div>
                                      )}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <motion.div 
          className="flex-1 flex flex-col"
          animate={{ 
            marginLeft: sidebarOpen && !focusMode ? 0 : 0,
            width: sidebarOpen && !focusMode ? 'auto' : '100%'
          }}
          transition={{ 
            type: "spring", 
            damping: 25, 
            stiffness: 300,
            mass: 0.5
          }}
        >
          {/* Top Bar */}
          <div className="bg-white dark:bg-gray-900/70 backdrop-blur-sm border-b border-gray-200/60 dark:border-gray-800 shadow-sm">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Sidebar toggle button */}
                  {/* На мобильных: всегда видима */}
                  {/* На десктопе: видима только когда sidebar скрыт */}
                  {(isMobile || !sidebarOpen) && (
                    <button
                      onClick={() => {
                        if (isMobile) {
                          setMobileSidebarOpen(true)
                        } else {
                          setSidebarOpen(true)
                        }
                      }}
                      className="p-2 text-gray-600 dark:text-white/70 hover:text-purple-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      title="Показать боковую панель"
                      aria-label="Показать навигацию по урокам"
                    >
                      <PanelLeft className="w-5 h-5" />
                    </button>
                  )}
                  {currentSection && currentLesson && (
                    <div className="text-gray-600 font-medium dark:text-white/70 text-sm">
                      <span className="hidden sm:inline">
                        Модуль {currentSection.section_number} / 
                      </span>
                      <span className="ml-1">Урок {currentLesson.lesson_number}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Focus Mode Button */}
                  <Button
                    onClick={() => setFocusMode(!focusMode)}
                    variant="ghost"
                    size="sm"
                    className={`${
                      focusMode 
                        ? 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30' 
                        : 'text-gray-600 dark:text-white/70 hover:text-gray-800 dark:hover:text-white'
                    }`}
                    title="Режим чтения (F11 или Ctrl+K)"
                  >
                    {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    <span className="hidden lg:inline ml-2">Режим чтения</span>
                  </Button>
                  
                  {!focusMode && <ThemeToggle />}
                  
                  <Button
                    onClick={() => prevLesson && setCurrentLessonId(prevLesson.id)}
                    disabled={!prevLesson}
                    variant="ghost"
                    size="sm"
                    className="text-gray-600 dark:text-white/70 hover:text-gray-800 dark:hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">Назад</span>
                  </Button>
                  
                  <Button
                    onClick={() => nextLesson && setCurrentLessonId(nextLesson.id)}
                    disabled={!nextLesson}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-300 border border-purple-600 dark:border-purple-500/30"
                  >
                    <span className="hidden sm:inline mr-1">Далее</span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Course Stats Bar - Hide in focus mode */}
            {!focusMode && (
              <div className="px-6 pb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-purple-400" />
                    <div>
                      <p className="text-xs text-gray-500 font-medium dark:text-white/60">Уроков</p>
                      <p className="text-sm font-bold text-gray-800 dark:text-white/90">{totalLessons}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <div>
                      <p className="text-xs text-gray-500 font-medium dark:text-white/60">Длительность</p>
                      <p className="text-sm font-bold text-gray-800 dark:text-white/90">{formatTime(totalMinutes)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-400" />
                    <div>
                      <p className="text-xs text-gray-500 font-medium dark:text-white/60">Завершено</p>
                      <p className="text-sm font-bold text-gray-800 dark:text-white/90">{Math.round(progressPercentage)}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-green-400" />
                    <div>
                      <p className="text-xs text-gray-500 font-medium dark:text-white/60">Уровень</p>
                      <p className="text-sm font-bold text-gray-800 dark:text-white/90">{course.difficulty}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Lesson Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Focus Mode Content */}
            {focusMode && currentLesson ? (
              <div className="bg-white dark:bg-gray-950 min-h-screen">
                {/* Minimal Header */}
                <div className="sticky top-0 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-800/50">
                  <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        {currentLesson.title}
                      </h2>
                      <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border-purple-300 dark:border-purple-500/30">
                        Урок {currentLesson.lesson_number}
                      </Badge>
                      <Button
                        onClick={() => markLessonComplete(currentLesson.id)}
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${
                          completedLessons.has(currentLesson.id)
                            ? 'text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
                        }`}
                        title={completedLessons.has(currentLesson.id) ? 'Урок пройден' : 'Отметить как пройденный'}
                      >
                        {completedLessons.has(currentLesson.id) ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Navigation */}
                      <Button
                        onClick={() => prevLesson && setCurrentLessonId(prevLesson.id)}
                        disabled={!prevLesson}
                        variant="ghost"
                        size="sm"
                        className="text-gray-600 dark:text-white/70"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-gray-500 dark:text-white/60">
                        {currentIndex + 1} / {allLessonsOrdered.length}
                      </span>
                      <Button
                        onClick={() => nextLesson && setCurrentLessonId(nextLesson.id)}
                        disabled={!nextLesson}
                        variant="ghost"
                        size="sm"
                        className="text-gray-600 dark:text-white/70"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      
                      <div className="ml-4 border-l border-gray-200 dark:border-gray-700 pl-4">
                        <Button
                          onClick={() => setFocusMode(false)}
                          variant="ghost"
                          size="sm"
                          className="text-gray-600 dark:text-white/70"
                        >
                          <X className="w-4 h-4" />
                          <span className="ml-2 hidden sm:inline">Выйти</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1 bg-gray-100 dark:bg-gray-800">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                      style={{ width: `${((currentIndex + 1) / allLessonsOrdered.length) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Optimized Reading Content with Swipe Support */}
                <div 
                  className="max-w-6xl mx-auto px-6 py-12 relative"
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                >
                  {/* Mobile swipe hint - показываем только на мобильных устройствах в первые 3 секунды */}
                  <AnimatePresence>
                    {currentLessonId && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                        className="md:hidden fixed top-20 left-1/2 transform -translate-x-1/2 z-20"
                      >
                        <motion.div
                          initial={{ opacity: 1 }}
                          animate={{ opacity: 0 }}
                          transition={{ delay: 3, duration: 1 }}
                          className="bg-purple-600/90 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-lg backdrop-blur-sm"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span>Свайп для навигации</span>
                          <ChevronRight className="w-4 h-4" />
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="prose prose-lg dark:prose-invert max-w-none prose-purple">
                    <LessonContent 
                      lesson={currentLesson}
                      section={currentSection}
                      assets={currentLessonId && assets?.[currentLessonId] ? assets[currentLessonId] : undefined}
                    />
                  </div>
                  
                  {/* Bottom navigation */}
                  <div className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-800">
                    <div className="flex items-center justify-between">
                      <Button
                        onClick={() => prevLesson && setCurrentLessonId(prevLesson.id)}
                        disabled={!prevLesson}
                        variant="outline"
                        className="flex items-center gap-2"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <div className="text-left">
                          <div className="text-xs text-gray-500 dark:text-white/60">Предыдущий урок</div>
                          {prevLesson && (
                            <div className="text-sm font-medium">{prevLesson.title}</div>
                          )}
                        </div>
                      </Button>
                      
                      <Button
                        onClick={() => nextLesson && setCurrentLessonId(nextLesson.id)}
                        disabled={!nextLesson}
                        variant="outline"
                        className="flex items-center gap-2"
                      >
                        <div className="text-right">
                          <div className="text-xs text-gray-500 dark:text-white/60">Следующий урок</div>
                          {nextLesson && (
                            <div className="text-sm font-medium">{nextLesson.title}</div>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                
                {/* Keyboard shortcuts hint */}
                <div className="fixed bottom-4 left-4 text-xs text-gray-500 dark:text-white/50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center gap-4">
                    <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">←</kbd> / <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">→</kbd> Навигация</span>
                    <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">Esc</kbd> Выход</span>
                  </div>
                </div>
              </div>
            ) : currentLesson ? (
              <Tabs defaultValue="content" className="w-full">
                <div className="sticky top-0 bg-white dark:bg-gray-900/70 backdrop-blur-sm border-b border-gray-200/60 dark:border-gray-800 z-10">
                  <TabsList className="w-full justify-start rounded-none bg-transparent h-auto p-0">
                    <TabsTrigger 
                      value="content" 
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-600 dark:data-[state=active]:border-purple-500 data-[state=active]:bg-transparent px-6 py-3 text-gray-600 data-[state=active]:text-purple-700 dark:text-white/70 dark:data-[state=active]:text-purple-300"
                    >
                      <BookOpen className="w-4 h-4 mr-2" />
                      Содержание
                    </TabsTrigger>
                    <TabsTrigger 
                      value="activities" 
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-600 dark:data-[state=active]:border-purple-500 data-[state=active]:bg-transparent px-6 py-3 text-gray-600 data-[state=active]:text-purple-700 dark:text-white/70 dark:data-[state=active]:text-purple-300"
                    >
                      <Activity className="w-4 h-4 mr-2" />
                      Задания
                    </TabsTrigger>
                    <TabsTrigger 
                      value="structure" 
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-600 dark:data-[state=active]:border-purple-500 data-[state=active]:bg-transparent px-6 py-3 text-gray-600 data-[state=active]:text-purple-700 dark:text-white/70 dark:data-[state=active]:text-purple-300"
                    >
                      <Layers className="w-4 h-4 mr-2" />
                      Структура курса
                    </TabsTrigger>
                  </TabsList>
                </div>
                
                <TabsContent value="content" className="mt-0">
                  <ContentFormatSwitcher
                    lesson={currentLesson}
                    section={currentSection}
                    assets={currentLessonId && assets?.[currentLessonId] ? assets[currentLessonId] : undefined}
                    availableFormats={{
                      video: currentLesson.video_asset?.url,
                      audio: currentLesson.audio_asset?.url,
                      presentation: currentLesson.presentation_asset?.url
                    }}
                    onFormatChange={undefined}
                  />
                </TabsContent>
                
                <TabsContent value="activities" className="mt-0 p-6">
                  <div className="max-w-4xl mx-auto">
                    {currentLesson.activities && currentLesson.activities.length > 0 ? (
                      <Card className="bg-gradient-to-br from-purple-100 to-blue-100 dark:from-gray-800 dark:to-gray-900 border-purple-300 dark:border-gray-700 shadow-sm">
                        <CardHeader>
                          <CardTitle className="text-gray-800 dark:text-white/90">Практические задания</CardTitle>
                          <CardDescription className="text-gray-500 dark:text-white/60">
                            Выполните эти задания для закрепления материала
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {currentLesson.activities.map((activity, index) => {
                              const isCompleted = completedActivities[currentLesson.id]?.has(index) || false
                              // Handle both old (string) and new (object) formats using type guard
                              const activityTitle = isActivityObject(activity)
                                ? activity.exercise_title || 'Задание'
                                : activity
                              const activityDescription = isActivityObject(activity)
                                ? activity.exercise_description || ''
                                : ''
                              const activityType = isActivityObject(activity)
                                ? activity.exercise_type
                                : null

                              return (
                                <button
                                  key={index}
                                  onClick={() => toggleActivity(currentLesson.id, index, currentLesson.activities?.length || 0)}
                                  className="w-full flex items-start gap-3 p-4 bg-purple-50 dark:bg-gray-800/30 rounded-lg hover:bg-purple-100 dark:hover:bg-gray-800/50 transition-colors text-left group"
                                >
                                  {isCompleted ? (
                                    <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                                  ) : (
                                    <div className="w-6 h-6 border-2 border-purple-500 dark:border-purple-400 rounded-md flex-shrink-0 mt-0.5 group-hover:border-purple-600 dark:group-hover:border-purple-300 transition-colors" />
                                  )}
                                  <div className={`flex-1 ${isCompleted ? 'opacity-60' : ''}`}>
                                    <p className={`font-semibold text-gray-800 dark:text-white/90 ${isCompleted ? 'line-through' : ''}`}>
                                      {activityTitle}
                                    </p>
                                    {activityDescription && (
                                      <p className="text-sm text-gray-600 dark:text-white/70 mt-1">
                                        {activityDescription}
                                      </p>
                                    )}
                                    {activityType && (
                                      <Badge variant="secondary" className="mt-2 text-xs bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                                        {activityType === 'case_study' && 'Кейс'}
                                        {activityType === 'hands_on' && 'Практика'}
                                        {activityType === 'quiz' && 'Тест'}
                                        {activityType === 'reflection' && 'Рефлексия'}
                                      </Badge>
                                    )}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                          
                          {/* Progress Bar for Activities */}
                          <div className="mt-6 pt-6 border-t border-purple-200 dark:border-gray-700">
                            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-white/60 mb-2">
                              <span>Прогресс заданий</span>
                              <span>
                                {completedActivities[currentLesson.id]?.size || 0} из {currentLesson.activities.length} выполнено
                              </span>
                            </div>
                            <div className="w-full bg-purple-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                              <div 
                                className="bg-gradient-to-r from-purple-500 to-purple-600 h-full transition-all duration-300"
                                style={{ 
                                  width: `${((completedActivities[currentLesson.id]?.size || 0) / currentLesson.activities.length) * 100}%` 
                                }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="bg-gradient-to-br from-purple-100 to-blue-100 dark:from-gray-800 dark:to-gray-900 border-purple-300 dark:border-gray-700 shadow-sm">
                        <CardContent className="py-12 text-center">
                          <Activity className="w-12 h-12 text-gray-400 dark:text-white/40 mx-auto mb-4" />
                          <p className="text-gray-600 dark:text-white/60">Для этого урока нет практических заданий</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="structure" className="mt-0 p-6">
                  <div className="max-w-6xl mx-auto">
                    <Card className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 border-purple-300 dark:border-gray-700 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-gray-800 dark:text-white/90 flex items-center gap-2">
                          <Layers className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                          Структура курса
                        </CardTitle>
                        <CardDescription className="text-gray-500 dark:text-white/60">
                          Полный обзор всех модулей и уроков курса
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {sections.map((section) => {
                            const sectionLessons = lessonsBySection[section.id] || []
                            const sectionCompleted = sectionLessons.filter(l => completedLessons.has(l.id)).length
                            const isCurrentSection = currentSection?.id === section.id
                            
                            return (
                              <div 
                                key={section.id} 
                                className={`rounded-lg border ${
                                  isCurrentSection 
                                    ? 'border-purple-500 dark:border-purple-400 bg-purple-50/50 dark:bg-purple-500/10' 
                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50'
                                } overflow-hidden transition-all duration-200`}
                              >
                                <div className="px-4 py-3 bg-gradient-to-r from-purple-100/50 to-blue-100/50 dark:from-gray-800/50 dark:to-gray-800/30">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-8 h-8 rounded-full ${
                                        isCurrentSection 
                                          ? 'bg-purple-600 dark:bg-purple-500' 
                                          : 'bg-gray-400 dark:bg-gray-600'
                                      } text-white flex items-center justify-center text-sm font-bold`}>
                                        {section.section_number}
                                      </div>
                                      <div>
                                        <h3 className="font-semibold text-gray-800 dark:text-white/90">
                                          {section.title}
                                        </h3>
                                        {section.description && (
                                          <p className="text-sm text-gray-600 dark:text-white/60 mt-0.5">
                                            {section.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-sm text-gray-600 dark:text-white/60">
                                        {sectionCompleted}/{sectionLessons.length} уроков
                                      </div>
                                      {sectionCompleted === sectionLessons.length && sectionLessons.length > 0 && (
                                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {sectionLessons.map((lesson) => {
                                      const isCompleted = completedLessons.has(lesson.id)
                                      const isCurrent = currentLessonId === lesson.id
                                      
                                      return (
                                        <button
                                          key={lesson.id}
                                          onClick={() => setCurrentLessonId(lesson.id)}
                                          className={`flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-md ${
                                            isCurrent
                                              ? 'border-purple-500 dark:border-purple-400 bg-purple-100 dark:bg-purple-500/20 shadow-md'
                                              : isCompleted
                                              ? 'border-green-300 dark:border-green-600/30 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20'
                                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                          }`}
                                        >
                                          <div className="flex-shrink-0 mt-0.5">
                                            {isCurrent ? (
                                              <div className="w-6 h-6 rounded-full bg-purple-600 dark:bg-purple-500 flex items-center justify-center">
                                                <BookOpen className="w-3 h-3 text-white" />
                                              </div>
                                            ) : isCompleted ? (
                                              <CheckCircle2 className="w-6 h-6 text-green-500" />
                                            ) : (
                                              <Circle className="w-6 h-6 text-gray-400 dark:text-gray-600" />
                                            )}
                                          </div>
                                          <div className="flex-1 text-left">
                                            <div className={`font-medium text-sm ${
                                              isCurrent 
                                                ? 'text-purple-700 dark:text-purple-300' 
                                                : isCompleted
                                                ? 'text-green-700 dark:text-green-400'
                                                : 'text-gray-800 dark:text-white/80'
                                            }`}>
                                              {lesson.lesson_number}. {lesson.title}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-white/50">
                                              <Clock className="w-3 h-3" />
                                              <span>{lesson.duration_minutes} мин</span>
                                              {isCurrent && (
                                                <Badge variant="default" className="ml-2 bg-purple-600 text-white text-xs px-1.5 py-0">
                                                  Текущий
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        
                        {/* Course Progress Summary */}
                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-gray-600 dark:text-white/60">Общий прогресс курса</p>
                              <p className="text-2xl font-bold text-gray-800 dark:text-white/90">
                                {completedCount} из {totalLessons} уроков
                              </p>
                            </div>
                            <div className="text-right space-y-1">
                              <p className="text-sm font-medium text-gray-600 dark:text-white/60">Осталось времени</p>
                              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                                {formatTime(remainingMinutes)}
                              </p>
                            </div>
                          </div>
                          <Progress value={progressPercentage} className="h-3 mt-4" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500 dark:text-white/50">
                  <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Выберите урок для начала обучения</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
      

      {/* Floating Action Button for Generation - Desktop only */}
      {!focusMode && currentLesson && !isMobile && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: showFab ? 1 : 0.8,
            opacity: showFab ? 1 : 0,
            y: showFab ? 0 : 100
          }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="fixed bottom-8 right-8 z-50 pointer-events-auto"
          style={{ pointerEvents: showFab ? 'auto' : 'none' }}
        >
          <motion.button
            onClick={() => setGenerationPanelOpen(true)}
            className="group relative bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm overflow-visible"
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.95 }}
            title="Генерировать контент с ИИ"
          >
            <Sparkles className="w-6 h-6 relative z-10" />
            
            {/* Pulsing animation - limited to 3 times, resumes on hover */}
            <motion.span 
              className="absolute -inset-1 rounded-full bg-purple-600"
              initial={{ scale: 1, opacity: 0.75 }}
              animate={{ 
                scale: [1, 2, 1],
                opacity: [0.75, 0, 0.75]
              }}
              transition={{
                duration: 1,
                times: [0, 0.75, 1],
                repeat: 2, // Only repeat 2 times (3 total)
                repeatDelay: 0.2
              }}
            />
            {/* Hover animation */}
            <motion.span 
              className="absolute -inset-1 rounded-full bg-purple-600 opacity-0 group-hover:opacity-75"
              animate={{
                scale: [1, 2],
                opacity: [0, 0]
              }}
              whileHover={{
                scale: [1, 2],
                opacity: [0.75, 0],
                transition: {
                  duration: 1,
                  repeat: Infinity,
                  repeatDelay: 0.2
                }
              }}
            />
            
            {/* Tooltip on hover */}
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              whileHover={{ opacity: 1, x: 0 }}
              className="absolute right-full mr-3 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <div className="bg-gray-900 text-white text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                <div className="font-semibold">Генерация контента</div>
                <div className="text-xs text-gray-300 mt-0.5">Создать материалы с ИИ</div>
                <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
              </div>
            </motion.div>
          </motion.button>
          
          {/* Mobile label */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="lg:hidden absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900/90 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap"
          >
            Генерация
          </motion.div>
        </motion.div>
      )}

      {/* Content Generation Panel */}
      <ContentGenerationPanel
        open={generationPanelOpen}
        onClose={() => setGenerationPanelOpen(false)}
        courseId={course.id}
        courseTitle={course.title}
        courseLanguage={(course.request_data?.language as string) || course.language || "ru"}
        sections={sections}
        lessons={lessons}
        selectedLessons={currentLessonId ? [currentLessonId] : []}
      />
    </div>
  )
}