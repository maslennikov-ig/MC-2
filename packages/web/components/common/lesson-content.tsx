"use client"

import React, { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { Target, BookOpen, Activity, Clock, CheckCircle, Circle, PlayCircle, Film, X } from "lucide-react"
import dynamic from "next/dynamic"

import { MarkdownRendererFull } from "@/components/markdown"
import type { Lesson, Section, Asset, LessonActivity } from "@/types/database"
import { parseLessonContent } from "@/lib/lesson-content-parser"
import type { Database } from "@/types/database.generated"

type LessonContentRow = Database['public']['Tables']['lesson_contents']['Row']

// Type guard to check if activity is an object
function isActivityObject(activity: string | LessonActivity): activity is LessonActivity {
  return typeof activity === 'object' && activity !== null && 'exercise_title' in activity
}

// Dynamic import for video player to avoid SSR issues

const PersistentVideoPlayer = dynamic(() => import("./persistent-video-player"), {
  ssr: false,
  loading: () => (
    <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center">
      <div className="text-center">
        <Film className="w-12 h-12 text-purple-400 mb-2 mx-auto animate-pulse" />
        <p className="text-gray-400">Загрузка видео...</p>
      </div>
    </div>
  )
})

interface LessonContentProps {
  lesson: Lesson
  section?: Section
  assets?: Asset[]
  /** Lesson content from lesson_contents table (Stage 6 generated content) */
  lessonContent?: LessonContentRow
}

export default function LessonContent({ lesson, section, assets, lessonContent }: LessonContentProps) {
  const [completedTasks, setCompletedTasks] = useState<Set<number>>(new Set())
  const [videoMode, setVideoMode] = useState<'hidden' | 'normal' | 'floating'>('hidden')
  
  // Assets are loaded from database
  
  // Reset video state when lesson changes
  useEffect(() => {
    setVideoMode('hidden')
  }, [lesson.id])
  
  // Find video asset if exists - check by filename first, then URL patterns
  const videoAsset = assets?.find(a => {
    // Priority 1: Check filename for video extensions
    if (a.filename) {
      const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov']
      if (videoExtensions.some(ext => a.filename!.toLowerCase().endsWith(ext))) {
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
      if (a.url.includes('youtube.com') || a.url.includes('youtu.be') || a.url.includes('vimeo.com')) {
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
  const markdownContent = useMemo(() => {
    // Priority 1: Use lessonContent from lesson_contents table (Stage 6)
    if (lessonContent?.content) {
      const contentData = lessonContent.content as Record<string, unknown>

      // Structure: { status, content: { intro, sections: [{title, content}], exercises } }
      const innerContent = contentData.content as Record<string, unknown> | undefined

      if (innerContent) {
        const parts: string[] = []

        // Add intro
        if (typeof innerContent.intro === 'string' && innerContent.intro.trim()) {
          parts.push(innerContent.intro)
        }

        // Add sections
        if (Array.isArray(innerContent.sections)) {
          for (const section of innerContent.sections) {
            if (section && typeof section === 'object') {
              const sectionObj = section as { title?: string; content?: string }
              if (sectionObj.title && sectionObj.content) {
                // Section title is already in markdown with ## from LLM
                parts.push(sectionObj.content)
              }
            }
          }
        }

        if (parts.length > 0) {
          return parts.join('\n\n')
        }
      }
    }

    // Priority 2: Fallback to legacy parsing from lesson table
    const { markdown } = parseLessonContent(lesson)
    return markdown
  }, [lessonContent, lesson])

  const toggleTask = (index: number) => {
    const newCompleted = new Set(completedTasks)
    if (newCompleted.has(index)) {
      newCompleted.delete(index)
    } else {
      newCompleted.add(index)
    }
    setCompletedTasks(newCompleted)
  }

  return (
    <motion.div
      key={lesson.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-7xl mx-auto px-6 py-8 lg:px-10 xl:max-w-[90rem]"
    >
      {/* Additional Materials Section - Only show when materials exist */}
      {hasAdditionalMaterials && (
        <div className="mb-8 p-6 bg-gradient-to-br from-purple-50/50 via-blue-50/30 to-indigo-50/50 dark:from-purple-900/20 dark:via-blue-900/10 dark:to-indigo-900/20 rounded-xl border border-purple-200 dark:border-purple-800/30 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Дополнительные материалы</h2>
          </div>
          
          <div className="space-y-4">
            {/* Video Player - Show at the top when video is playing */}
            {videoAsset && videoMode !== 'hidden' && (() => {
              // Get video URL - try multiple sources
              let videoUrl = videoAsset.url || ''
              let sourceType = 'unknown' as ReturnType<typeof getVideoSourceType>

              if (!videoUrl && videoAsset.filename) {
                // Check if filename is a UUID pattern (likely a Supabase storage file)
                const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(mp4|webm|mov)$/i

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
                  <div className="aspect-video rounded-xl overflow-hidden bg-black">
                    <iframe
                      key={`embed-video-${lesson.id}`}
                      src={embedUrl}
                      className="w-full h-full"
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
                  className="w-full p-4 bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-600/20 dark:to-blue-600/20 rounded-lg border border-purple-300 dark:border-purple-600/30 hover:border-purple-400 dark:hover:border-purple-500/50 transition-all flex items-center gap-4 group shadow-sm hover:shadow-md"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  {videoMode === 'hidden' ? (
                    <>
                      <PlayCircle className="w-12 h-12 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                      <div className="text-left flex-1">
                        <p className="text-gray-900 dark:text-white font-medium">Видео урок</p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                          {videoAsset.duration_seconds ? `Длительность: ${Math.floor(videoAsset.duration_seconds / 60)} минут` : 'Видео доступно для просмотра'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <X className="w-12 h-12 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                      <div className="text-left flex-1">
                        <p className="text-gray-900 dark:text-white font-medium">Скрыть видео</p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
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
      
      {/* Lesson Header */}
      <div className="mb-8">
        {section && (
          <div 
            className="text-purple-400 text-sm font-medium mb-2" 
            data-section={section.section_number}
          >
            Модуль {section.section_number}: {section.title}
          </div>
        )}
        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">
          {lesson.title}
        </h1>
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {lesson.duration_minutes} minutes
          </span>
        </div>
      </div>

      {/* Learning Objectives and Key Topics - Side by Side */}
      {(lesson.objectives && lesson.objectives.length > 0) || (lesson.key_topics && lesson.key_topics.length > 0) ? (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Learning Objectives */}
          <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-900/10 rounded-xl border border-purple-200 dark:border-purple-800/30 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Цели обучения</h2>
            </div>
            {lesson.objectives && lesson.objectives.length > 0 ? (
              <ul className="space-y-2">
                {lesson.objectives.map((objective, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{objective}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">Цели обучения не указаны</p>
            )}
          </div>

          {/* Key Topics */}
          <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800/30 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ключевые темы</h2>
            </div>
            {lesson.key_topics && lesson.key_topics.length > 0 ? (
              <ul className="space-y-2">
                {(lesson.key_topics as string[]).map((topic: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{topic}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">Ключевые темы не указаны</p>
            )}
          </div>
        </div>
      ) : null}

      {/* Main Content */}
      <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-800">
        <MarkdownRendererFull content={markdownContent} preset="lesson" />
      </div>

      {/* Practical Tasks */}
      {lesson.activities && lesson.activities.length > 0 && (
        <div className="p-6 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-green-900/20 dark:to-green-900/10 rounded-xl border border-emerald-200 dark:border-green-800/30 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-emerald-600 dark:text-green-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Практические задания</h2>
          </div>
          <div className="space-y-3">
            {lesson.activities.map((activity, index) => {
              // Handle both old (string) and new (object) formats
              const activityTitle = isActivityObject(activity)
                ? activity.exercise_title || 'Задание'
                : activity
              const activityDescription = isActivityObject(activity)
                ? activity.exercise_description || ''
                : ''
              const activityType = isActivityObject(activity)
                ? activity.exercise_type
                : null

              return (
                <div
                  key={index}
                  className="flex items-start gap-3 cursor-pointer hover:bg-emerald-100/50 dark:hover:bg-green-900/10 p-3 rounded-lg transition-colors"
                  onClick={() => toggleTask(index)}
                >
                  <button
                    className="mt-0.5"
                    aria-label={completedTasks.has(index) ? "Отметить задание как невыполненное" : "Отметить задание как выполненное"}
                  >
                    {completedTasks.has(index) ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                  <div className="flex-1">
                    <span className={`text-gray-900 dark:text-gray-100 font-medium block ${completedTasks.has(index) ? 'line-through opacity-60' : ''}`}>
                      {activityTitle}
                    </span>
                    {activityDescription && (
                      <p className={`text-sm text-gray-600 dark:text-gray-400 mt-1 ${completedTasks.has(index) ? 'opacity-50' : ''}`}>
                        {activityDescription}
                      </p>
                    )}
                    {activityType && (
                      <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        {activityType === 'case_study' && 'Кейс'}
                        {activityType === 'hands_on' && 'Практика'}
                        {activityType === 'quiz' && 'Тест'}
                        {activityType === 'reflection' && 'Рефлексия'}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}