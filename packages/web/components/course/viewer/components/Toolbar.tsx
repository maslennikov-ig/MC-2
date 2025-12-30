"use client"

import React from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
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
  GitBranch
} from "lucide-react"
import ThemeToggle from "@/components/common/theme-toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Section, Lesson, Course } from "@/types/database"

interface ToolbarProps {
  currentSection?: Section;
  currentLesson?: Lesson;
  course: Course;
  isMobile: boolean;
  sidebarOpen: boolean;
  focusMode: boolean;
  totalLessons: number;
  totalTime: string;
  progressPercentage: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** Read-only mode for shared/public viewing - hides edit features */
  readOnly?: boolean;
  onToggleSidebar: () => void;
  onToggleMobileSidebar: () => void;
  onToggleFocusMode: () => void;
  onPrev: () => void;
  onNext: () => void;
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
  onToggleSidebar,
  onToggleMobileSidebar,
  onToggleFocusMode,
  onPrev,
  onNext
}: ToolbarProps) {
  const t = useTranslations("course.viewer")

  return (
    <div className="bg-white dark:bg-gray-900/70 backdrop-blur-sm border-b border-gray-200/60 dark:border-gray-800 shadow-sm">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {(isMobile || !sidebarOpen) && (
              <button
                onClick={isMobile ? onToggleMobileSidebar : onToggleSidebar}
                className="p-2 text-gray-600 dark:text-white/70 hover:text-purple-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title={t("showSidebar")}
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            )}
            {currentSection && currentLesson && (
              <div className="text-gray-600 font-medium dark:text-white/70 text-sm">
                <span className="hidden sm:inline">
                  {t("section")} {currentSection.section_number} /
                </span>
                <span className="ml-1">{t("lesson")} {currentLesson.lesson_number}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Constructor link - hidden in readOnly mode (shared courses) */}
            {!readOnly && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="text-gray-600 dark:text-white/70 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      <Link href={`/courses/generating/${course.slug || course.id}?workflow=true`}>
                        <GitBranch className="w-4 h-4" />
                        <span className="hidden lg:inline ml-2">{t("constructor")}</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("constructorTooltip")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <Button
              onClick={onToggleFocusMode}
              variant="ghost"
              size="sm"
              className={`${
                focusMode
                  ? 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30'
                  : 'text-gray-600 dark:text-white/70 hover:text-gray-800 dark:hover:text-white'
              }`}
              title={t("focusModeTooltip")}
            >
              {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="hidden lg:inline ml-2">{t("focusMode")}</span>
            </Button>

            {!focusMode && <ThemeToggle />}
            
            <Button
              onClick={onPrev}
              disabled={!hasPrev}
              variant="ghost"
              size="sm"
              className="text-gray-600 dark:text-white/70 hover:text-gray-800 dark:hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">{t("prev")}</span>
            </Button>
            
            <Button
              onClick={onNext}
              disabled={!hasNext}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-300 border border-purple-600 dark:border-purple-500/30"
            >
              <span className="hidden sm:inline mr-1">{t("next")}</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {!focusMode && (
        <div className="px-6 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-purple-400" />
              <div>
                <p className="text-xs text-gray-500 font-medium dark:text-white/60">{t("lessonsCount")}</p>
                <p className="text-sm font-bold text-gray-800 dark:text-white/90">{totalLessons}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              <div>
                <p className="text-xs text-gray-500 font-medium dark:text-white/60">{t("duration")}</p>
                <p className="text-sm font-bold text-gray-800 dark:text-white/90">{totalTime}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <div>
                <p className="text-xs text-gray-500 font-medium dark:text-white/60">{t("completed")}</p>
                <p className="text-sm font-bold text-gray-800 dark:text-white/90">{Math.round(progressPercentage)}%</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-green-400" />
              <div>
                <p className="text-xs text-gray-500 font-medium dark:text-white/60">{t("level")}</p>
                <p className="text-sm font-bold text-gray-800 dark:text-white/90">{course.difficulty}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
