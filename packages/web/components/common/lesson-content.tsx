'use client'

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Target, Clock, CheckCircle, ArrowRight } from 'lucide-react'

import { MarkdownRendererFull } from '@/components/markdown'
import type { Lesson, Section, Asset } from '@/types/database'
import { parseLessonContent } from '@/lib/lesson-content-parser'
import type { Database } from '@/types/database.generated'
import { LessonCoverHero } from '@/components/course/viewer/components/LessonCoverHero'
import { EnrichmentErrorBoundary } from '@/components/course/viewer/enrichments/EnrichmentErrorBoundary'
import { LessonMaterialsSwitcher } from './lesson-materials-switcher'

type LessonContentRow = Database['public']['Tables']['lesson_contents']['Row']

interface LessonContentProps {
  lesson: Lesson
  section?: Section
  assets?: Asset[]
  /** Lesson content from lesson_contents table (Stage 6 generated content) */
  lessonContent?: LessonContentRow
  /** Enrichments for the current lesson (video, audio, quiz, presentation, document, cover) */
  enrichments?: Array<{ id?: string; enrichment_type: string; content: unknown; status: string }>
  /** Course content language for localized callout titles */
  courseLanguage?: string
  /** Next lesson info for "What's next" card */
  nextLesson?: {
    title: string
    objectives?: string[] | null
  }
  /** Callback to navigate to the next lesson */
  onNextLesson?: () => void
}

export default function LessonContent({
  lesson,
  section,
  assets,
  lessonContent,
  enrichments,
  courseLanguage,
  nextLesson,
  onNextLesson,
}: LessonContentProps) {
  // Parse the lesson content - prefer lessonContent from lesson_contents table
  // Fallback to lesson.content or lesson.content_text for legacy support
  const { introText, mainContent } = useMemo(() => {
    // Priority 1: Use lessonContent from lesson_contents table (Stage 6)
    if (lessonContent?.content) {
      const contentData = lessonContent.content as Record<string, unknown>

      // Structure: { status, content: { intro, sections: [{title, content}], exercises } }
      const innerContent = contentData.content as Record<string, unknown> | undefined

      if (innerContent) {
        const intro =
          typeof innerContent.intro === 'string' && innerContent.intro.trim()
            ? innerContent.intro
            : ''

        const sectionParts: string[] = []

        // Add sections
        if (Array.isArray(innerContent.sections)) {
          for (const section of innerContent.sections) {
            if (section && typeof section === 'object') {
              const sectionObj = section as { title?: string; content?: string }
              if (sectionObj.title && sectionObj.content) {
                const trimmedContent = sectionObj.content.trim()
                const hasHeading = /^##\s+/m.test(trimmedContent)
                sectionParts.push(
                  hasHeading ? trimmedContent : `## ${sectionObj.title}\n\n${trimmedContent}`
                )
              }
            }
          }
        }

        return {
          introText: intro,
          mainContent: sectionParts.join('\n\n'),
        }
      }
    }

    // Priority 2: Fallback to legacy parsing from lesson table
    const { markdown } = parseLessonContent(lesson)
    return {
      introText: '',
      mainContent: markdown,
    }
  }, [lessonContent, lesson])

  // Extract cover image URL from enrichments
  const coverImageUrl = useMemo(() => {
    if (!enrichments) return null

    const coverEnrichment = enrichments.find(
      (e) => e.enrichment_type === 'cover' && e.status === 'completed'
    )

    if (!coverEnrichment?.content) return null

    const content = coverEnrichment.content as { type: string; imageUrl?: string }
    return content.type === 'cover' ? (content.imageUrl ?? null) : null
  }, [enrichments])

  return (
    <motion.div
      key={lesson.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-7xl px-6 py-8 lg:px-10 xl:max-w-[90rem]"
    >
      {/* Cover Hero Image - Displayed at the top if exists, with overlay containing lesson info */}
      {coverImageUrl && (
        <EnrichmentErrorBoundary enrichmentType="Lesson Cover" enrichmentId={lesson.id}>
          <div className="mb-6">
            <LessonCoverHero
              imageUrl={coverImageUrl}
              lessonTitle={lesson.title}
              sectionTitle={section?.title}
              sectionNumber={
                section?.section_number != null ? Number(section.section_number) : undefined
              }
              readingTime={lesson.duration_minutes}
              showOverlay={true}
            />
          </div>
        </EnrichmentErrorBoundary>
      )}

      {/* Lesson Header - Only show if no cover image (info is on banner overlay when cover exists) */}
      {!coverImageUrl && (
        <div className="mb-8">
          {section && (
            <div
              className="mb-2 text-sm font-medium text-purple-400"
              data-section={section.section_number}
            >
              Модуль {section.section_number}: {section.title}
            </div>
          )}
          <h1 className="mb-4 text-3xl font-bold text-gray-900 lg:text-4xl dark:text-white">
            {lesson.title}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {lesson.duration_minutes} мин
            </span>
          </div>
        </div>
      )}

      {/* Learning Objectives */}
      {lesson.objectives && lesson.objectives.length > 0 && (
        <div className="mb-8">
          <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100/50 p-6 shadow-sm transition-shadow hover:shadow-md dark:border-purple-800/30 dark:from-purple-900/20 dark:to-purple-900/10">
            <div className="mb-4 flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Цели урока</h2>
            </div>
            <ul className="space-y-2">
              {lesson.objectives.map((objective, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-400" />
                  <span className="text-gray-700 dark:text-gray-300">{objective}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Lesson Materials Switcher */}
      <LessonMaterialsSwitcher lesson={lesson} assets={assets} enrichments={enrichments} />

      {/* Lesson Introduction - if exists */}
      {introText && (
        <div className="mb-8">
          <div className="rounded-xl border border-blue-200/50 bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/50 p-6 shadow-sm dark:border-blue-800/30 dark:from-blue-900/10 dark:via-indigo-900/10 dark:to-purple-900/10">
            <div className="prose prose-lg dark:prose-invert prose-purple max-w-none">
              <MarkdownRendererFull content={introText} preset="lesson" language={courseLanguage} />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="prose prose-lg dark:prose-invert prose-purple max-w-none">
        <MarkdownRendererFull content={mainContent} preset="lesson" language={courseLanguage} />
      </div>

      {/* Next Lesson Preview */}
      {nextLesson && (
        <div className="mt-12 mb-4">
          {onNextLesson ? (
            <button
              type="button"
              onClick={onNextLesson}
              className="group w-full cursor-pointer rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100/50 p-6 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:border-emerald-800/30 dark:from-emerald-900/20 dark:to-teal-900/10 dark:hover:border-emerald-700/50"
            >
              <div className="mb-3 flex items-center gap-2">
                <ArrowRight
                  aria-hidden="true"
                  className="h-5 w-5 text-emerald-600 transition-transform group-hover:translate-x-1 dark:text-emerald-400"
                />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  В следующем уроке
                </h2>
              </div>
              <p className="mb-2 text-base font-medium text-gray-800 dark:text-gray-200">
                {nextLesson.title}
              </p>
              {nextLesson.objectives && nextLesson.objectives.length > 0 && (
                <ul className="space-y-1.5">
                  {nextLesson.objectives.slice(0, 3).map((obj, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      {obj}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100/50 p-6 shadow-sm transition-shadow hover:shadow-md dark:border-emerald-800/30 dark:from-emerald-900/20 dark:to-teal-900/10">
              <div className="mb-3 flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  В следующем уроке
                </h2>
              </div>
              <p className="mb-2 text-base font-medium text-gray-800 dark:text-gray-200">
                {nextLesson.title}
              </p>
              {nextLesson.objectives && nextLesson.objectives.length > 0 && (
                <ul className="space-y-1.5">
                  {nextLesson.objectives.slice(0, 3).map((obj, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      {obj}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
