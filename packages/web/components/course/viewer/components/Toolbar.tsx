'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelLeft,
  GraduationCap,
  Clock,
  Trophy,
  BarChart3,
  GitBranch,
  LayoutGrid,
} from 'lucide-react'
import ThemeToggle from '@/components/common/theme-toggle'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Section, Lesson, Course } from '@/types/database'
import { buildCourseLessonsUrl, buildCourseGeneratingUrl } from '@/lib/helpers/course-urls'

interface ToolbarProps {
  currentSection?: Section
  currentLesson?: Lesson
  course: Course
  isMobile: boolean
  sidebarOpen: boolean
  focusMode: boolean
  totalLessons: number
  totalTime: string
  progressPercentage: number
  hasPrev: boolean
  hasNext: boolean
  /** Read-only mode for shared/public viewing - hides edit features */
  readOnly?: boolean
  /** Organization slug for URL building (REQUIRED) */
  orgSlug: string
  onToggleSidebar: () => void
  onToggleMobileSidebar: () => void
  onToggleFocusMode: () => void
  onPrev: () => void
  onNext: () => void
}

export function Toolbar({
  currentSection,
  currentLesson,
  course,
  isMobile,
  sidebarOpen,
  focusMode,
  totalLessons,
  totalTime,
  progressPercentage,
  hasPrev,
  hasNext,
  readOnly = false,
  orgSlug,
  onToggleSidebar,
  onToggleMobileSidebar,
  onToggleFocusMode,
  onPrev,
  onNext,
}: ToolbarProps) {
  const t = useTranslations('course.viewer')

  return (
    <div className="border-b border-gray-200/60 bg-white shadow-sm backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/70">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {(isMobile || !sidebarOpen) && (
              <button
                onClick={isMobile ? onToggleMobileSidebar : onToggleSidebar}
                className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:text-white/70 dark:hover:bg-gray-800 dark:hover:text-white"
                title={t('showSidebar')}
              >
                <PanelLeft className="h-5 w-5" />
              </button>
            )}
            {currentSection && currentLesson && (
              <div className="text-sm font-medium text-gray-600 dark:text-white/70">
                <span className="hidden sm:inline">
                  {t('section')} {currentSection.section_number} /
                </span>
                <span className="ml-1">
                  {t('lesson')} {currentLesson.lesson_number}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* All Lessons link */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="text-gray-600 hover:text-purple-600 dark:text-white/70 dark:hover:text-purple-400"
                  >
                    <Link href={buildCourseLessonsUrl(orgSlug, course.slug || course.id)}>
                      <LayoutGrid className="h-4 w-4" />
                      <span className="ml-2 hidden lg:inline">{t('allLessons')}</span>
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('allLessonsTooltip')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Constructor link - hidden in readOnly mode (shared courses) */}
            {!readOnly && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="text-gray-600 hover:text-blue-600 dark:text-white/70 dark:hover:text-blue-400"
                    >
                      <Link
                        href={buildCourseGeneratingUrl(orgSlug, course.slug || course.id, true)}
                        target="_blank"
                      >
                        <GitBranch className="h-4 w-4" />
                        <span className="ml-2 hidden lg:inline">{t('constructor')}</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('constructorTooltip')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <Button
              onClick={onToggleFocusMode}
              variant="ghost"
              size="sm"
              className={`${
                focusMode
                  ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                  : 'text-gray-600 hover:text-gray-800 dark:text-white/70 dark:hover:text-white'
              }`}
              title={t('focusModeTooltip')}
            >
              {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              <span className="ml-2 hidden lg:inline">{t('focusMode')}</span>
            </Button>

            {!focusMode && <ThemeToggle />}

            <Button
              onClick={onPrev}
              disabled={!hasPrev}
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-800 dark:text-white/70 dark:hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">{t('prev')}</span>
            </Button>

            <Button
              onClick={onNext}
              disabled={!hasNext}
              size="sm"
              className="border border-purple-600 bg-purple-600 text-white hover:bg-purple-700 dark:border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-300 dark:hover:bg-purple-500/30"
            >
              <span className="mr-1 hidden sm:inline">{t('next')}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {!focusMode && (
        <div className="px-6 pb-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-purple-400" />
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-white/60">
                  {t('lessonsCount')}
                </p>
                <p className="text-sm font-bold text-gray-800 dark:text-white/90">{totalLessons}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" />
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-white/60">
                  {t('duration')}
                </p>
                <p className="text-sm font-bold text-gray-800 dark:text-white/90">{totalTime}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-400" />
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-white/60">
                  {t('completed')}
                </p>
                <p className="text-sm font-bold text-gray-800 dark:text-white/90">
                  {Math.round(progressPercentage)}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-400" />
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-white/60">{t('level')}</p>
                <p className="text-sm font-bold text-gray-800 dark:text-white/90">
                  {course.difficulty}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
