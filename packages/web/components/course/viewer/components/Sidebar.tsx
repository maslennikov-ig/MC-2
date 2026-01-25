import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  BookOpen,
  Clock,
  ArrowLeft,
  CheckCircle2,
  Layers,
  PanelLeftClose,
  X,
  Home,
  GitBranch,
  LayoutGrid,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import LessonProgressCard from '@/components/common/lesson-progress-card'
import { Course, Section, Lesson } from '@/types/database'
import { buildCourseLessonsUrl, buildCourseGeneratingUrl } from '@/lib/helpers/course-urls'

interface SidebarProps {
  course: Course
  sections: Section[]
  lessonsBySection: Record<string, Lesson[]>
  currentLessonId: string | null
  completedLessons: Set<string>
  expandedSections: Set<string>
  sidebarOpen: boolean
  mobileSidebarOpen: boolean
  focusMode: boolean
  completedCount: number
  totalLessons: number
  remainingMinutes: number
  /** Organization slug for URL building */
  orgSlug?: string
  /** Read-only mode for shared/public viewing - hides edit features */
  readOnly?: boolean
  onToggleSidebar: (open: boolean) => void
  onToggleMobileSidebar: (open: boolean) => void
  onToggleSection: (id: string) => void
  onSelectLesson: (id: string) => void
}

export function Sidebar({
  course,
  sections,
  lessonsBySection,
  currentLessonId,
  completedLessons,
  expandedSections,
  sidebarOpen,
  mobileSidebarOpen,
  focusMode,
  completedCount,
  totalLessons,
  remainingMinutes,
  orgSlug,
  readOnly = false,
  onToggleSidebar,
  onToggleMobileSidebar,
  onToggleSection,
  onSelectLesson,
}: SidebarProps) {
  const t = useTranslations('course.viewer')

  const sidebarContent = (isMobile = false) => (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-gray-200/60 p-6 dark:border-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={isMobile ? '/courses' : '/courses'}
            className="group inline-flex items-center gap-2 text-gray-600 transition-colors hover:text-purple-600 dark:text-white/70 dark:hover:text-white"
          >
            {isMobile ? (
              <Home className="h-4 w-4" />
            ) : (
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            )}
            <span className="text-sm">{isMobile ? 'К каталогу' : 'К каталогу'}</span>
          </Link>
          <div className="flex items-center gap-1">
            {!readOnly && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                    >
                      <Link
                        href={orgSlug ? buildCourseGeneratingUrl(orgSlug, course.slug || course.id, true) : `/courses/generating/${course.slug || course.id}?workflow=true`}
                        target="_blank"
                      >
                        <GitBranch className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Конструктор курса</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!isMobile && (
              <Button
                onClick={() => onToggleSidebar(false)}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Скрыть боковую панель"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            )}
            {isMobile && (
              <button
                onClick={() => onToggleMobileSidebar(false)}
                className="rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-white/70 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
        <h2 className="mb-3 text-2xl font-bold text-gray-800 dark:text-white/90">{course.title}</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className="border-purple-700 bg-purple-600 text-white dark:border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-300"
          >
            {course.difficulty}
          </Badge>
          <Badge
            variant="secondary"
            className="border-blue-700 bg-blue-600 text-white dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-300"
          >
            {course.style}
          </Badge>
        </div>

        <LessonProgressCard
          completedCount={completedCount}
          totalLessons={totalLessons}
          remainingMinutes={remainingMinutes}
          compact={isMobile}
        />

        {/* All Lessons button */}
        <Link
          href={orgSlug ? buildCourseLessonsUrl(orgSlug, course.slug || course.id) : `/courses/${course.slug || course.id}/lessons`}
          className="hover:to-purple-150/50 group mt-4 flex w-full items-center justify-between rounded-lg border border-purple-200/50 bg-gradient-to-r from-purple-50 to-purple-100/50 px-4 py-3 transition-all hover:from-purple-100 dark:border-purple-700/30 dark:from-purple-900/20 dark:to-purple-800/10 dark:hover:from-purple-900/30 dark:hover:to-purple-800/20"
        >
          <div className="flex items-center gap-3">
            <LayoutGrid className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-gray-800 dark:text-white/90">
              {t('allLessons')}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-purple-500 transition-transform group-hover:translate-x-0.5 dark:text-purple-400" />
        </Link>
      </div>

      <div className="space-y-2 p-4">
        {sections.map((section) => {
          const sectionLessons = lessonsBySection[section.id] || []
          const sectionCompleted = sectionLessons.filter((l) => completedLessons.has(l.id)).length
          const isExpanded = expandedSections.has(section.id)

          return (
            <div key={section.id} className="overflow-hidden rounded-lg">
              <button
                onClick={() => onToggleSection(section.id)}
                className="hover:to-gray-150 group flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-2 shadow-sm transition-all duration-200 hover:from-gray-100 hover:shadow-md dark:border-gray-800 dark:from-gray-800/30 dark:to-gray-800/20 dark:hover:from-gray-800/50 dark:hover:to-gray-800/40"
              >
                <div className="flex items-center gap-2">
                  <ChevronRight
                    className={`h-4 w-4 text-gray-600 transition-transform dark:text-white/60 ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                  <Layers className="h-4 w-4 text-gray-600 dark:text-white/60" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-white/85">
                    Модуль {section.section_number}: {section.title}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-white/50">
                    {sectionCompleted}/{sectionLessons.length}
                  </span>
                  {sectionCompleted === sectionLessons.length && sectionLessons.length > 0 && (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
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
                            onClick={() => onSelectLesson(lesson.id)}
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-all ${
                              isCurrent
                                ? 'border border-purple-700 bg-purple-600 text-white dark:border-purple-500/50 dark:bg-purple-500/30 dark:text-white/90'
                                : isCompleted
                                  ? 'border border-green-200 bg-green-100 text-green-800 hover:bg-green-200 dark:border-transparent dark:bg-green-500/10 dark:text-white/70 dark:hover:bg-green-500/20'
                                  : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900 dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white/90'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {isCompleted ? (
                                <CheckCircle2 className="h-4 w-4 text-green-400" />
                              ) : (
                                <BookOpen className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm">
                                {lesson.lesson_number}. {lesson.title}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-white/50">
                                <Clock className="h-3 w-3" />
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
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && !focusMode && (
          <motion.aside
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="hidden w-80 flex-shrink-0 border-r border-gray-200 bg-white shadow-sm backdrop-blur-sm lg:block dark:border-gray-800 dark:bg-gray-900/50"
          >
            {sidebarContent(false)}
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
              className="fixed inset-0 z-40 bg-black/20 lg:hidden dark:bg-black/50"
              onClick={() => onToggleMobileSidebar(false)}
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed top-0 left-0 z-50 h-full w-80 overflow-y-auto border-r border-gray-200 bg-white shadow-2xl backdrop-blur-sm lg:hidden dark:border-gray-800 dark:bg-gray-900"
            >
              {sidebarContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
