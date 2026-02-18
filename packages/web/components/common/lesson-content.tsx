'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Target, Clock, CheckCircle, PlayCircle, Film, X, BookOpen, ArrowRight } from 'lucide-react'
import dynamic from 'next/dynamic'

import { MarkdownRendererFull } from '@/components/markdown'
import type { Lesson, Section, Asset } from '@/types/database'
import { parseLessonContent } from '@/lib/lesson-content-parser'
import type { Database } from '@/types/database.generated'
import { LessonCoverHero } from '@/components/course/viewer/components/LessonCoverHero'
import { EnrichmentErrorBoundary } from '@/components/course/viewer/enrichments/EnrichmentErrorBoundary'

type LessonContentRow = Database['public']['Tables']['lesson_contents']['Row']

// Dynamic import for video player to avoid SSR issues

const PersistentVideoPlayer = dynamic(() => import('./persistent-video-player'), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-video items-center justify-center rounded-xl bg-gray-900">
      <div className="text-center">
        <Film className="mx-auto mb-2 h-12 w-12 animate-pulse text-purple-400" />
        <p className="text-gray-400">Загрузка видео...</p>
      </div>
    </div>
  ),
})

interface LessonContentProps {
  lesson: Lesson
  section?: Section
  assets?: Asset[]
  /** Lesson content from lesson_contents table (Stage 6 generated content) */
  lessonContent?: LessonContentRow
  /** Enrichments for the current lesson (video, audio, quiz, presentation, document, cover) */
  enrichments?: Array<{ enrichment_type: string; content: unknown; status: string }>
  /** Course content language for localized callout titles */
  courseLanguage?: string
  /** Next lesson info for "What's next" card */
  nextLesson?: {
    title: string
    objectives?: string[] | null
  }
}

export default function LessonContent({
  lesson,
  section,
  assets,
  lessonContent,
  enrichments,
  courseLanguage,
  nextLesson,
}: LessonContentProps) {
  const [videoMode, setVideoMode] = useState<'hidden' | 'normal' | 'floating'>('hidden')

  // Assets are loaded from database

  // Reset video state when lesson changes
  useEffect(() => {
    setVideoMode('hidden')
  }, [lesson.id])

  // Find video asset if exists - check by filename first, then URL patterns
  const videoAsset = assets?.find((a) => {
    // Priority 1: Check filename for video extensions
    if (a.filename) {
      const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov']
      if (videoExtensions.some((ext) => a.filename!.toLowerCase().endsWith(ext))) {
        return true
      }
    }

    // Priority 2: Check metadata for asset type if available
    if ((a.metadata as Record<string, unknown>)?.type === 'video') return true

    // Priority 3: Check URL patterns
    if (a.url) {
      // Direct video file URLs
      if (a.url.includes('.mp4') || a.url.includes('.webm') || a.url.includes('.ogg')) {
        return true
      }
      // Video hosting platforms
      if (
        a.url.includes('youtube.com') ||
        a.url.includes('youtu.be') ||
        a.url.includes('vimeo.com')
      ) {
        return true
      }
    }

    return false
  })

  // Assets are ready

  // Check if we have any additional materials to show
  const hasAdditionalMaterials = !!(videoAsset || (assets && assets.length > 0))

  // Detect video source type
  const getVideoSourceType = (url: string | undefined): 'youtube' | 'direct' | 'unknown' => {
    if (!url) return 'unknown'

    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
    if (url.includes('.mp4') || url.includes('.webm') || url.includes('.ogg')) return 'direct'

    return 'unknown'
  }

  // Convert video URL to appropriate embed format
  const getVideoEmbedUrl = (assetUrl: string | undefined) => {
    if (!assetUrl) return ''

    const sourceType = getVideoSourceType(assetUrl)

    switch (sourceType) {
      case 'youtube': {
        // Extract video ID and convert to embed URL
        let videoId = ''
        if (assetUrl.includes('youtube.com/watch?v=')) {
          videoId = assetUrl.split('watch?v=')[1].split('&')[0]
        } else if (assetUrl.includes('youtu.be/')) {
          videoId = assetUrl.split('youtu.be/')[1].split('?')[0]
        }

        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}`
        }
        break
      }

      case 'direct':
        return assetUrl

      default:
        return assetUrl
    }

    return assetUrl
  }

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
                // Section title is already in markdown with ## from LLM
                sectionParts.push(sectionObj.content)
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

      {/* Additional Materials Section - Only show when materials exist */}
      {hasAdditionalMaterials && (
        <div className="mb-8 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/50 via-blue-50/30 to-indigo-50/50 p-6 shadow-sm dark:border-purple-800/30 dark:from-purple-900/20 dark:via-blue-900/10 dark:to-indigo-900/20">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Дополнительные материалы
            </h2>
          </div>

          <div className="space-y-4">
            {/* Video Player - Show at the top when video is playing */}
            {videoAsset &&
              videoMode !== 'hidden' &&
              (() => {
                // Get video URL - try multiple sources
                let videoUrl = videoAsset.url || ''
                let sourceType = 'unknown' as ReturnType<typeof getVideoSourceType>

                if (!videoUrl && videoAsset.filename) {
                  // Check if filename is a UUID pattern (likely a Supabase storage file)
                  const uuidPattern =
                    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(mp4|webm|mov)$/i

                  if (uuidPattern.test(videoAsset.filename)) {
                    // This is likely a Supabase storage file, construct the public URL
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
                    if (supabaseUrl) {
                      // Try Supabase storage URL
                      videoUrl = `${supabaseUrl}/storage/v1/object/public/videos/${videoAsset.filename}`
                    } else {
                      // Fallback to API endpoint
                      videoUrl = `/api/assets/${videoAsset.filename}`
                    }
                    sourceType = 'direct'
                  } else {
                    // Regular filename - try API endpoint
                    videoUrl = `/api/assets/filename/${encodeURIComponent(videoAsset.filename)}`
                    sourceType = 'direct'
                  }
                } else if (videoUrl) {
                  sourceType = getVideoSourceType(videoUrl)
                }

                // Determine the embed URL based on source type
                const embedUrl = getVideoEmbedUrl(videoUrl)

                // YouTube videos use iframe embed
                if (sourceType === 'youtube') {
                  return (
                    <div className="aspect-video overflow-hidden rounded-xl bg-black">
                      <iframe
                        key={`embed-video-${lesson.id}`}
                        src={embedUrl}
                        className="h-full w-full"
                        allow="autoplay; fullscreen"
                        allowFullScreen
                        title={lesson.title}
                      />
                    </div>
                  )
                } else if (videoUrl && sourceType === 'direct') {
                  // Use HTML5 video player for direct video files
                  return (
                    <PersistentVideoPlayer
                      key={`video-${lesson.id}`}
                      src={videoUrl}
                      title={lesson.title}
                      className="mb-4"
                      mode={videoMode}
                      onModeChange={setVideoMode}
                      onClose={() => setVideoMode('hidden')}
                    />
                  )
                } else {
                  return null
                }
              })()}

            {/* Video Toggle Button */}
            {videoAsset && (
              <div>
                <motion.button
                  onClick={() => setVideoMode(videoMode === 'hidden' ? 'normal' : 'hidden')}
                  className="group flex w-full items-center gap-4 rounded-lg border border-purple-300 bg-gradient-to-r from-purple-100 to-blue-100 p-4 shadow-sm transition-all hover:border-purple-400 hover:shadow-md dark:border-purple-600/30 dark:from-purple-600/20 dark:to-blue-600/20 dark:hover:border-purple-500/50"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  {videoMode === 'hidden' ? (
                    <>
                      <PlayCircle className="h-12 w-12 flex-shrink-0 text-purple-600 transition-transform group-hover:scale-110 dark:text-purple-400" />
                      <div className="flex-1 text-left">
                        <p className="font-medium text-gray-900 dark:text-white">Видео урок</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {videoAsset.duration_seconds
                            ? `Длительность: ${Math.floor(videoAsset.duration_seconds / 60)} минут`
                            : 'Видео доступно для просмотра'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <X className="h-12 w-12 flex-shrink-0 text-purple-600 transition-transform group-hover:scale-110 dark:text-purple-400" />
                      <div className="flex-1 text-left">
                        <p className="font-medium text-gray-900 dark:text-white">Скрыть видео</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Нажмите, чтобы скрыть видео плеер
                        </p>
                      </div>
                    </>
                  )}
                </motion.button>
              </div>
            )}

            {/* Other assets - currently hidden as we only show video */}
          </div>
        </div>
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
        </div>
      )}
    </motion.div>
  )
}
