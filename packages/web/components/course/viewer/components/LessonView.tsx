import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  X,
  CheckCircle2,
  Circle,
  Layers,
  Film
} from "lucide-react"
import LessonContent from "@/components/common/lesson-content"
import ContentFormatSwitcher from "@/components/common/content-format-switcher"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Section, Lesson, Asset } from "@/types/database"
import { Database } from "@/types/database.generated"
import { StructurePanel } from "./StructurePanel"
import { EnrichmentsPanel } from "./EnrichmentsPanel"
import type { LessonContentRow } from "../types"

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row'];

interface LessonViewProps {
  currentLesson: Lesson;
  currentSection?: Section;
  assets?: Asset[];
  /** Enrichments for the current lesson (video, audio, quiz, presentation, document) */
  enrichments?: EnrichmentRow[];
  /** Error message if enrichments failed to load */
  enrichmentsLoadError?: string;
  /** Lesson content from lesson_contents table (Stage 6 generated content) */
  lessonContent?: LessonContentRow;
  focusMode: boolean;
  currentIndex: number;
  totalLessonsOrdered: number;
  completedLessons: Set<string>;
  allLessonsOrdered: Lesson[];
  sections: Section[];
  lessonsBySection: Record<string, Lesson[]>;
  completedCount: number;
  remainingTime: string;
  progressPercentage: number;
  swipeHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
  onPrev: () => void;
  onNext: () => void;
  onSelectLesson: (id: string) => void;
  onMarkComplete: (id: string) => void;
  onExitFocus: () => void;
}

export function LessonView({
  currentLesson,
  currentSection,
  assets,
  enrichments,
  enrichmentsLoadError,
  lessonContent,
  focusMode,
  currentIndex,
  totalLessonsOrdered,
  completedLessons,
  allLessonsOrdered,
  sections,
  lessonsBySection,
  completedCount,
  remainingTime,
  progressPercentage,
  swipeHandlers,
  onPrev,
  onNext,
  onSelectLesson,
  onMarkComplete,
  onExitFocus
}: LessonViewProps) {
  if (focusMode) {
    return (
      <div className="bg-white dark:bg-gray-950 min-h-screen">
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
                onClick={() => onMarkComplete(currentLesson.id)}
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${
                  completedLessons.has(currentLesson.id)
                    ? 'text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
                }`}
              >
                {completedLessons.has(currentLesson.id) ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={onPrev} disabled={currentIndex === 0} variant="ghost" size="sm">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-500 dark:text-white/60">
                {currentIndex + 1} / {totalLessonsOrdered}
              </span>
              <Button onClick={onNext} disabled={currentIndex === totalLessonsOrdered - 1} variant="ghost" size="sm">
                <ChevronRight className="w-4 h-4" />
              </Button>
              
              <div className="ml-4 border-l border-gray-200 dark:border-gray-700 pl-4">
                <Button onClick={onExitFocus} variant="ghost" size="sm">
                  <X className="w-4 h-4" />
                  <span className="ml-2 hidden sm:inline">Выйти</span>
                </Button>
              </div>
            </div>
          </div>
          <div className="h-1 bg-gray-100 dark:bg-gray-800">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / totalLessonsOrdered) * 100}%` }}
            />
          </div>
        </div>

        <div 
          className="max-w-6xl mx-auto px-6 py-12 relative"
          {...swipeHandlers}
        >
          <AnimatePresence>
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
          </AnimatePresence>

          <div className="prose prose-lg dark:prose-invert max-w-none prose-purple">
            <LessonContent
              lesson={currentLesson}
              section={currentSection}
              assets={assets}
              lessonContent={lessonContent}
              enrichments={enrichments}
            />
          </div>
          
          <div className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between text-left">
              <Button
                onClick={onPrev}
                disabled={currentIndex === 0}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                <div className="text-left">
                  <div className="text-xs text-gray-500 dark:text-white/60">Предыдущий урок</div>
                  {currentIndex > 0 && (
                    <div className="text-sm font-medium">{allLessonsOrdered[currentIndex - 1].title}</div>
                  )}
                </div>
              </Button>
              
              <Button
                onClick={onNext}
                disabled={currentIndex === totalLessonsOrdered - 1}
                variant="outline"
                className="flex items-center gap-2"
              >
                <div className="text-right">
                  <div className="text-xs text-gray-500 dark:text-white/60">Следующий урок</div>
                  {currentIndex < totalLessonsOrdered - 1 && (
                    <div className="text-sm font-medium">{allLessonsOrdered[currentIndex + 1].title}</div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        
        <div className="fixed bottom-4 left-4 text-xs text-gray-500 dark:text-white/50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">←</kbd> / <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">→</kbd> Навигация</span>
            <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">Esc</kbd> Выход</span>
          </div>
        </div>
      </div>
    );
  }

  return (
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
            value="structure"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-600 dark:data-[state=active]:border-purple-500 data-[state=active]:bg-transparent px-6 py-3 text-gray-600 data-[state=active]:text-purple-700 dark:text-white/70 dark:data-[state=active]:text-purple-300"
          >
            <Layers className="w-4 h-4 mr-2" />
            Структура курса
          </TabsTrigger>
          <TabsTrigger
            value="enrichments"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-600 dark:data-[state=active]:border-purple-500 data-[state=active]:bg-transparent px-6 py-3 text-gray-600 data-[state=active]:text-purple-700 dark:text-white/70 dark:data-[state=active]:text-purple-300"
          >
            <Film className="w-4 h-4 mr-2" />
            Медиа
            {enrichments && enrichments.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {enrichments.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </div>
      
      <TabsContent value="content" className="mt-0">
        <ContentFormatSwitcher
          lesson={currentLesson}
          section={currentSection}
          assets={assets}
          lessonContent={lessonContent}
          enrichments={enrichments}
          availableFormats={{
            video: currentLesson.video_asset?.url,
            audio: currentLesson.audio_asset?.url,
            presentation: currentLesson.presentation_asset?.url
          }}
          onFormatChange={undefined}
        />
      </TabsContent>

      <TabsContent value="structure" className="mt-0 p-6">
        <StructurePanel
          sections={sections}
          lessonsBySection={lessonsBySection}
          currentLessonId={currentLesson.id}
          currentSectionId={currentSection?.id}
          completedLessons={completedLessons}
          totalLessons={allLessonsOrdered.length}
          completedCount={completedCount}
          remainingTime={remainingTime}
          progressPercentage={progressPercentage}
          onSelectLesson={onSelectLesson}
        />
      </TabsContent>

      <TabsContent value="enrichments" className="mt-0 p-6">
        <EnrichmentsPanel enrichments={enrichments || []} enrichmentsLoadError={enrichmentsLoadError} />
      </TabsContent>
    </Tabs>
  );
}
