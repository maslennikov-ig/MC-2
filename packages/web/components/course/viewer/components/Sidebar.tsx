import React from "react"
import { motion, AnimatePresence } from "framer-motion"
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
  GitBranch
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import LessonProgressCard from "@/components/common/lesson-progress-card"
import { Course, Section, Lesson } from "@/types/database"

interface SidebarProps {
  course: Course;
  sections: Section[];
  lessonsBySection: Record<string, Lesson[]>;
  currentLessonId: string | null;
  completedLessons: Set<string>;
  expandedSections: Set<string>;
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  focusMode: boolean;
  completedCount: number;
  totalLessons: number;
  remainingMinutes: number;
  onToggleSidebar: (open: boolean) => void;
  onToggleMobileSidebar: (open: boolean) => void;
  onToggleSection: (id: string) => void;
  onSelectLesson: (id: string) => void;
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
  onToggleSidebar,
  onToggleMobileSidebar,
  onToggleSection,
  onSelectLesson
}: SidebarProps) {
  const sidebarContent = (isMobile = false) => (
    <div className="h-full overflow-y-auto">
      <div className="p-6 border-b border-gray-200/60 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <Link
            href={isMobile ? "/courses" : "/courses"}
            className="inline-flex items-center gap-2 text-gray-600 dark:text-white/70 hover:text-purple-600 dark:hover:text-white transition-colors group"
          >
            {isMobile ? <Home className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />}
            <span className="text-sm">{isMobile ? "К каталогу" : "К каталогу"}</span>
          </Link>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                  >
                    <Link href={`/courses/generating/${course.slug || course.id}?workflow=true`} target="_blank">
                      <GitBranch className="w-4 h-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Конструктор курса</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {!isMobile && (
              <Button
                onClick={() => onToggleSidebar(false)}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Скрыть боковую панель"
              >
                <PanelLeftClose className="w-4 h-4" />
              </Button>
            )}
            {isMobile && (
              <button
                onClick={() => onToggleMobileSidebar(false)}
                className="p-2 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>
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
        
        <LessonProgressCard
          completedCount={completedCount}
          totalLessons={totalLessons}
          remainingMinutes={remainingMinutes}
          compact={isMobile}
        />
      </div>

      <div className="p-4 space-y-2">
        {sections.map((section) => {
          const sectionLessons = lessonsBySection[section.id] || []
          const sectionCompleted = sectionLessons.filter(l => completedLessons.has(l.id)).length
          const isExpanded = expandedSections.has(section.id)
          
          return (
            <div key={section.id} className="rounded-lg overflow-hidden">
              <button
                onClick={() => onToggleSection(section.id)}
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
                            onClick={() => onSelectLesson(lesson.id)}
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
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="hidden lg:block w-80 bg-white dark:bg-gray-900/50 backdrop-blur-sm border-r border-gray-200 dark:border-gray-800 shadow-sm flex-shrink-0"
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
              className="lg:hidden fixed inset-0 bg-black/20 dark:bg-black/50 z-40"
              onClick={() => onToggleMobileSidebar(false)}
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", damping: 25 }}
              className="lg:hidden fixed left-0 top-0 h-full w-80 bg-white dark:bg-gray-900 backdrop-blur-sm border-r border-gray-200 dark:border-gray-800 z-50 overflow-y-auto shadow-2xl"
            >
              {sidebarContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
