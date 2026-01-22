'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import LessonProgressCard from '@/components/common/lesson-progress-card'
import { LessonGrid } from './lesson-grid'
import { useLessonProgress } from './use-lesson-progress'
import type { Database } from '@/types/database.generated'

type SectionRow = Database['public']['Tables']['sections']['Row']
type LessonRow = Database['public']['Tables']['lessons']['Row']
type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

interface LessonsContentProps {
  course: {
    id: string
    title: string
    slug: string | null
  }
  sections: SectionRow[]
  lessons: LessonRow[]
  enrichments: EnrichmentRow[]
  lessonsCompleted: string[]
}

type FilterType = 'all' | 'with_video' | 'completed' | 'not_completed'

export function LessonsContent({
  course,
  sections,
  lessons,
  enrichments,
  lessonsCompleted,
}: LessonsContentProps) {
  const t = useTranslations('course.lessons')
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

  // Lesson progress with optimistic updates and milestone toasts
  const {
    completedLessons: completedLessonsSet,
    isUpdating,
    toggleLessonComplete,
    completedCount,
  } = useLessonProgress({
    courseSlug: course.slug || course.id,
    initialCompleted: lessonsCompleted,
    totalLessons: lessons.length,
  })

  // Create enrichment lookup map
  const enrichmentsByLesson = useMemo(() => {
    const map = new Map<string, EnrichmentRow[]>()
    enrichments.forEach((enrichment) => {
      const existing = map.get(enrichment.lesson_id) || []
      map.set(enrichment.lesson_id, [...existing, enrichment])
    })
    return map
  }, [enrichments])

  // Create section lookup map
  const sectionsById = useMemo(() => {
    const map = new Map<string, SectionRow>()
    sections.forEach((section) => {
      map.set(section.id, section)
    })
    return map
  }, [sections])


  // Calculate remaining time for uncompleted lessons
  const remainingMinutes = useMemo(() => {
    return lessons
      .filter((l) => !completedLessonsSet.has(l.id))
      .reduce((sum, l) => sum + (l.duration_minutes || 0), 0)
  }, [lessons, completedLessonsSet])

  // Filter lessons based on active filter
  const filteredLessons = useMemo(() => {
    switch (activeFilter) {
      case 'with_video':
        return lessons.filter((lesson) => {
          const lessonEnrichments = enrichmentsByLesson.get(lesson.id) || []
          return lessonEnrichments.some((e) => e.enrichment_type === 'video')
        })
      case 'completed':
        return lessons.filter((lesson) => completedLessonsSet.has(lesson.id))
      case 'not_completed':
        return lessons.filter((lesson) => !completedLessonsSet.has(lesson.id))
      case 'all':
      default:
        return lessons
    }
  }, [lessons, activeFilter, enrichmentsByLesson, completedLessonsSet])

  const handleBackToCourse = () => {
    router.push(`/courses/${course.slug || course.id}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={handleBackToCourse}
            className="mb-4 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            {t('backToCourse')}
          </Button>

          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 md:text-4xl dark:text-white">
              {course.title}
            </h1>
            <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
              {t('subtitle', { count: lessons.length })}
            </p>
          </div>

          {/* Progress card */}
          {lessons.length > 0 && (
            <LessonProgressCard
              completedCount={completedCount}
              totalLessons={lessons.length}
              remainingMinutes={remainingMinutes}
              compact
              className="mb-6"
            />
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setActiveFilter('all')}
              className={
                activeFilter === 'all'
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800'
              }
            >
              {t('filters.all')} ({lessons.length})
            </Button>
            <Button
              variant={activeFilter === 'with_video' ? 'default' : 'outline'}
              onClick={() => setActiveFilter('with_video')}
              className={
                activeFilter === 'with_video'
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800'
              }
            >
              {t('filters.withVideo')} (
              {
                lessons.filter((l) => {
                  const enrichs = enrichmentsByLesson.get(l.id) || []
                  return enrichs.some((e) => e.enrichment_type === 'video')
                }).length
              }
              )
            </Button>
            <Button
              variant={activeFilter === 'completed' ? 'default' : 'outline'}
              onClick={() => setActiveFilter('completed')}
              className={
                activeFilter === 'completed'
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800'
              }
            >
              {t('filters.completed')} ({completedCount})
            </Button>
            <Button
              variant={activeFilter === 'not_completed' ? 'default' : 'outline'}
              onClick={() => setActiveFilter('not_completed')}
              className={
                activeFilter === 'not_completed'
                  ? 'bg-gray-600 text-white hover:bg-gray-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800'
              }
            >
              {t('filters.notCompleted')} ({lessons.length - completedCount})
            </Button>
          </div>
        </div>

        {/* Lesson Grid */}
        <LessonGrid
          lessons={filteredLessons}
          sections={sectionsById}
          enrichments={enrichmentsByLesson}
          completedLessons={completedLessonsSet}
          courseSlug={course.slug || course.id}
          updatingLessonId={isUpdating}
          onToggleComplete={(lessonId) => {
            void toggleLessonComplete(lessonId)
          }}
        />

        {/* Empty State */}
        {filteredLessons.length === 0 && (
          <div className="py-12 text-center">
            <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-12 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-lg text-gray-600 dark:text-gray-400">{t('empty')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
