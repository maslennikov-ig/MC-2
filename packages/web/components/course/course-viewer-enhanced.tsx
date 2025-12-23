"use client"

import React from "react"
import { motion } from "framer-motion"
import Header from "@/components/layouts/header"
import ContentGenerationPanel from "@/components/common/content-generation-panel"
import { useSwipe } from "@/lib/hooks/use-swipe"
import { toast } from "sonner"
import { useViewerState } from "./viewer/hooks/useViewerState"
import { Sidebar } from "./viewer/components/Sidebar"
import { Toolbar } from "./viewer/components/Toolbar"
import { LessonView } from "./viewer/components/LessonView"
import { FAB } from "./viewer/components/FAB"
import type { CourseViewerProps } from "./viewer/types"

export default function CourseViewerEnhanced({ course, sections: rawSections, lessons: rawLessons, assets }: CourseViewerProps) {
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
    completedActivities,
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
    toggleActivity
  } = useViewerState(course, rawSections, rawLessons)

  // Swipe logic for mobile navigation
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
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
    threshold: 75,
    preventDefaultTouchmoveEvent: false
  })

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
        <div className="fixed inset-0 bg-gradient-to-br from-transparent via-purple-50/10 to-purple-100/20 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 pointer-events-none" />
      )}
      
      {!focusMode && <Header />}
      
      <div className="relative z-10 min-h-screen flex">
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
          onToggleSidebar={setSidebarOpen}
          onToggleMobileSidebar={setMobileSidebarOpen}
          onToggleSection={toggleSection}
          onSelectLesson={setCurrentLessonId}
        />

        <motion.div 
          className="flex-1 flex flex-col"
          animate={{ 
            width: sidebarOpen && !focusMode ? 'auto' : '100%'
          }}
          transition={{ 
            type: "spring", 
            damping: 25, 
            stiffness: 300,
            mass: 0.5
          }}
        >
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
            onToggleSidebar={() => setSidebarOpen(true)}
            onToggleMobileSidebar={() => setMobileSidebarOpen(true)}
            onToggleFocusMode={() => setFocusMode(!focusMode)}
            onPrev={() => prevLesson && setCurrentLessonId(prevLesson.id)}
            onNext={() => nextLesson && setCurrentLessonId(nextLesson.id)}
          />

          <div className="flex-1 overflow-y-auto">
            {currentLesson ? (
              <LessonView 
                currentLesson={currentLesson}
                currentSection={currentSection}
                assets={currentLessonId ? assets?.[currentLessonId] : undefined}
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
                completedActivities={completedActivities}
                swipeHandlers={swipeHandlers}
                onPrev={() => prevLesson && setCurrentLessonId(prevLesson.id)}
                onNext={() => nextLesson && setCurrentLessonId(nextLesson.id)}
                onSelectLesson={setCurrentLessonId}
                onMarkComplete={markLessonComplete}
                onToggleActivity={toggleActivity}
                onExitFocus={() => setFocusMode(false)}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500 dark:text-white/50">
                  <p>Выберите урок для начала обучения</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Floating Action Button for Generation - Desktop only */}
      {!focusMode && currentLesson && !isMobile && (
        <FAB showFab={showFab} onOpenPanel={() => setGenerationPanelOpen(true)} />
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
