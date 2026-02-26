'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  X,
  CheckCircle2,
  Circle,
  Layers,
  Film,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import LessonContent from '@/components/common/lesson-content'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Section, Lesson, Asset } from '@/types/database'
import { Database } from '@/types/database.generated'
import { StructurePanel } from './StructurePanel'
import { EnrichmentsPanel } from './EnrichmentsPanel'
import type { LessonContentRow } from '../types'

const ContentFormatSwitcher = dynamic(() => import('@/components/common/content-format-switcher'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
    </div>
  ),
})

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

interface LessonViewProps {
  currentLesson: Lesson
  currentSection?: Section
  assets?: Asset[]
  /** Enrichments for the current lesson (video, audio, quiz, presentation, document) */
  enrichments?: EnrichmentRow[]
  /** Error message if enrichments failed to load */
  enrichmentsLoadError?: string
  /** Whether enrichments are being refetched */
  isEnrichmentsLoading?: boolean
  /** Lesson content from lesson_contents table (Stage 6 generated content) */
  lessonContent?: LessonContentRow
  focusMode: boolean
  currentIndex: number
  totalLessonsOrdered: number
  completedLessons: Set<string>
  allLessonsOrdered: Lesson[]
  sections: Section[]
  lessonsBySection: Record<string, Lesson[]>
  completedCount: number
  remainingTime: string
  progressPercentage: number
  swipeHandlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: (e: React.TouchEvent) => void
  }
  onPrev: () => void
  onNext: () => void
  onSelectLesson: (id: string) => void
  onMarkComplete: (id: string) => void
  onExitFocus: () => void
  /** Callback when enrichments should be refreshed (after generation completes) */
  onRefreshEnrichments?: () => void
  /** Course content language for localized callout titles */
  courseLanguage?: string
}

export function LessonView({
  currentLesson,
  currentSection,
  assets,
  enrichments,
  enrichmentsLoadError,
  isEnrichmentsLoading,
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
  onExitFocus,
  onRefreshEnrichments,
  courseLanguage,
}: LessonViewProps) {
  const t = useTranslations('course.viewer')
  const nextLessonData =
    currentIndex < totalLessonsOrdered - 1
      ? {
          title: allLessonsOrdered[currentIndex + 1].title,
          objectives: allLessonsOrdered[currentIndex + 1].objectives,
        }
      : undefined

  if (focusMode) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <div className="sticky top-0 z-20 border-b border-gray-200/50 bg-white/95 backdrop-blur-sm dark:border-gray-800/50 dark:bg-gray-900/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {currentLesson.title}
              </h2>
              <Badge
                variant="secondary"
                className="border-purple-300 bg-purple-100 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-300"
              >
                {t('lessonBadge', { number: currentLesson.lesson_number ?? '' })}
              </Badge>
              <Button
                onClick={() => onMarkComplete(currentLesson.id)}
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${
                  completedLessons.has(currentLesson.id)
                    ? 'text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300'
                    : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400'
                }`}
              >
                {completedLessons.has(currentLesson.id) ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={onPrev} disabled={currentIndex === 0} variant="ghost" size="sm">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-500 dark:text-white/60">
                {currentIndex + 1} / {totalLessonsOrdered}
              </span>
              <Button
                onClick={onNext}
                disabled={currentIndex === totalLessonsOrdered - 1}
                variant="ghost"
                size="sm"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              <div className="ml-4 border-l border-gray-200 pl-4 dark:border-gray-700">
                <Button onClick={onExitFocus} variant="ghost" size="sm">
                  <X className="h-4 w-4" />
                  <span className="ml-2 hidden sm:inline">{t('exitFocus')}</span>
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

        <div className="relative mx-auto max-w-6xl px-6 py-12" {...swipeHandlers}>
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="fixed top-20 left-1/2 z-20 -translate-x-1/2 transform md:hidden"
            >
              <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: 3, duration: 1 }}
                className="flex items-center gap-2 rounded-full bg-purple-600/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-sm"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>{t('swipeHint')}</span>
                <ChevronRight className="h-4 w-4" />
              </motion.div>
            </motion.div>
          </AnimatePresence>

          <LessonContent
            lesson={currentLesson}
            section={currentSection}
            assets={assets}
            lessonContent={lessonContent}
            enrichments={enrichments}
            courseLanguage={courseLanguage}
            nextLesson={nextLessonData}
            onNextLesson={onNext}
          />

          <div className="mt-16 border-t border-gray-200 pt-8 dark:border-gray-800">
            <div className="flex items-center justify-between text-left">
              <Button
                onClick={onPrev}
                disabled={currentIndex === 0}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                <div className="text-left">
                  <div className="text-xs text-gray-500 dark:text-white/60">{t('prevLesson')}</div>
                  {currentIndex > 0 && (
                    <div className="text-sm font-medium">
                      {allLessonsOrdered[currentIndex - 1].title}
                    </div>
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
                  <div className="text-xs text-gray-500 dark:text-white/60">{t('nextLesson')}</div>
                  {currentIndex < totalLessonsOrdered - 1 && (
                    <div className="text-sm font-medium">
                      {allLessonsOrdered[currentIndex + 1].title}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="fixed bottom-4 left-4 rounded-lg border border-gray-200 bg-white/90 px-3 py-2 text-xs text-gray-500 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/90 dark:text-white/50">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">←</kbd> /{' '}
              <kbd className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">→</kbd>{' '}
              {t('keyboardNav')}
            </span>
            <span>
              <kbd className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">Esc</kbd>{' '}
              {t('keyboardExit')}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Tabs defaultValue="content" className="w-full">
      <div className="sticky top-0 z-10 border-b border-gray-200/60 bg-white backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/70">
        <TabsList className="h-auto w-full justify-start rounded-none bg-transparent p-0">
          <TabsTrigger
            value="content"
            className="rounded-none border-b-2 border-transparent px-6 py-3 text-gray-600 data-[state=active]:border-purple-600 data-[state=active]:bg-transparent data-[state=active]:text-purple-700 dark:text-white/70 dark:data-[state=active]:border-purple-500 dark:data-[state=active]:text-purple-300"
          >
            <BookOpen className="mr-2 h-4 w-4" />
            {t('tabs.content')}
          </TabsTrigger>
          <TabsTrigger
            value="structure"
            className="rounded-none border-b-2 border-transparent px-6 py-3 text-gray-600 data-[state=active]:border-purple-600 data-[state=active]:bg-transparent data-[state=active]:text-purple-700 dark:text-white/70 dark:data-[state=active]:border-purple-500 dark:data-[state=active]:text-purple-300"
          >
            <Layers className="mr-2 h-4 w-4" />
            {t('tabs.structure')}
          </TabsTrigger>
          <TabsTrigger
            value="enrichments"
            className="rounded-none border-b-2 border-transparent px-6 py-3 text-gray-600 data-[state=active]:border-purple-600 data-[state=active]:bg-transparent data-[state=active]:text-purple-700 dark:text-white/70 dark:data-[state=active]:border-purple-500 dark:data-[state=active]:text-purple-300"
          >
            <Film className="mr-2 h-4 w-4" />
            {t('tabs.media')}
            {enrichments && enrichments.filter((e) => e.enrichment_type !== 'cover').length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {enrichments.filter((e) => e.enrichment_type !== 'cover').length}
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
            presentation: currentLesson.presentation_asset?.url,
          }}
          onFormatChange={undefined}
          courseLanguage={courseLanguage}
          nextLesson={nextLessonData}
          onNextLesson={onNext}
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
        <EnrichmentsPanel
          enrichments={enrichments}
          enrichmentsLoadError={enrichmentsLoadError}
          isLoading={isEnrichmentsLoading}
          lessonId={currentLesson.id}
          courseId={currentLesson.course_id}
          onRefreshEnrichments={onRefreshEnrichments}
        />
      </TabsContent>
    </Tabs>
  )
}
