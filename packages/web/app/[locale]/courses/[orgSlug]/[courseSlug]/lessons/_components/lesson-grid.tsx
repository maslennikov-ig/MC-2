'use client'

import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { LessonCard } from './lesson-card'
import { buildCourseUrl } from '@/lib/helpers/course-urls'
import type { Database } from '@/types/database.generated'

type LessonRow = Database['public']['Tables']['lessons']['Row']
type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

interface LessonGridProps {
  lessons: LessonRow[]
  enrichments: Map<string, EnrichmentRow[]>
  completedLessons: Set<string>
  orgSlug: string
  courseSlug: string
  /** ID of lesson currently being updated */
  updatingLessonId?: string | null
  /** Callback to toggle lesson completion */
  onToggleComplete?: (lessonId: string) => void
}

// Convert enrichment rows to enrichment flags for LessonCard
function getEnrichmentFlags(enrichmentRows: EnrichmentRow[] | undefined) {
  if (!enrichmentRows || enrichmentRows.length === 0) return undefined

  const types = new Set(enrichmentRows.map((e) => e.enrichment_type))
  return {
    has_video: types.has('video'),
    has_audio: types.has('audio'),
    has_presentation: types.has('presentation'),
    has_quiz: types.has('quiz'),
  }
}

export function LessonGrid({
  lessons,
  enrichments,
  completedLessons,
  orgSlug,
  courseSlug,
  updatingLessonId,
  onToggleComplete,
}: LessonGridProps) {
  const router = useRouter()

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
      <AnimatePresence mode="popLayout">
        {lessons.map((lesson, index) => {
          const isCompleted = completedLessons.has(lesson.id)
          return (
            <motion.div
              key={lesson.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              layout
            >
              <LessonCard
                lesson={{
                  id: lesson.id,
                  title: lesson.title,
                  duration_minutes: lesson.duration_minutes,
                  order_index: lesson.order_index,
                }}
                enrichments={getEnrichmentFlags(enrichments.get(lesson.id))}
                isCompleted={isCompleted}
                isUpdating={updatingLessonId === lesson.id}
                onClick={() =>
                  router.push(`${buildCourseUrl(orgSlug, courseSlug)}?lesson=${lesson.id}`)
                }
                onToggleComplete={onToggleComplete}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
