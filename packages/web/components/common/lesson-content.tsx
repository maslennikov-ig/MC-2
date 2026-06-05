'use client'

import React, { useMemo } from 'react'
import { Target, Clock, CheckCircle, ArrowRight } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'

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
  const t = useTranslations('course')
  const locale = useLocale()

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
    <div key={lesson.id} className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 lg:py-8">
      <article className="career-playbook-document px-5 py-6 md:px-8 md:py-8">
        {/* Cover Hero Image - Displayed at the top if exists, with overlay containing lesson info */}
        {coverImageUrl && (
          <EnrichmentErrorBoundary
            enrichmentType="Lesson Cover"
            enrichmentId={lesson.id}
            locale={locale}
          >
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
                className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400"
                data-section={section.section_number}
              >
                {t('viewer.section')} {section.section_number}: {section.title}
              </div>
            )}
            <h1 className="mb-4 text-3xl font-bold text-gray-900 lg:text-4xl dark:text-white">
              {lesson.title}
            </h1>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {t('lesson.duration', { minutes: lesson.duration_minutes ?? 0 })}
              </span>
            </div>
          </div>
        )}

        {/* Learning Objectives */}
        {lesson.objectives && lesson.objectives.length > 0 && (
          <div className="mb-8">
            <div className="career-playbook-muted-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Target className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('lesson.objectives')}
                </h2>
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
            <div className="career-playbook-muted-card p-5">
              <div className="prose prose-lg dark:prose-invert prose-slate max-w-none">
                <MarkdownRendererFull
                  content={introText}
                  preset="lesson"
                  language={courseLanguage}
                />
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="prose prose-lg dark:prose-invert prose-slate max-w-none">
          <MarkdownRendererFull content={mainContent} preset="lesson" language={courseLanguage} />
        </div>

        {/* Next Lesson Preview */}
        {nextLesson && (
          <div className="mt-12 mb-4">
            {onNextLesson ? (
              <button
                type="button"
                onClick={onNextLesson}
                className="career-playbook-muted-card group w-full cursor-pointer p-5 text-left transition-colors hover:border-slate-400 dark:hover:border-slate-500"
              >
                <div className="mb-3 flex items-center gap-2">
                  <ArrowRight
                    aria-hidden="true"
                    className="h-5 w-5 text-slate-700 transition-transform group-hover:translate-x-1 dark:text-slate-200"
                  />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('lesson.nextLesson')}
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
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                        {obj}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            ) : (
              <div className="career-playbook-muted-card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <ArrowRight className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('lesson.nextLesson')}
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
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                        {obj}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </article>
    </div>
  )
}
