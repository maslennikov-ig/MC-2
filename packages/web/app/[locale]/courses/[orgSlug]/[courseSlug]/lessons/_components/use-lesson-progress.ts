'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { buildCourseApiUrl } from '@/lib/helpers/course-urls'

interface UseLessonProgressOptions {
  orgSlug: string
  courseSlug: string
  initialCompleted: string[]
  totalLessons: number
}

interface ProgressResponse {
  lessons_completed: string[]
  last_accessed: string | null
  last_accessed_lesson_id: string | null
}

/**
 * Hook for managing lesson progress with optimistic updates and milestones.
 * Calls POST /api/courses/[orgSlug]/[courseSlug]/progress to sync with server.
 */
export function useLessonProgress({
  orgSlug,
  courseSlug,
  initialCompleted,
  totalLessons,
}: UseLessonProgressOptions) {
  const t = useTranslations('course.lessons')
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(
    () => new Set(initialCompleted)
  )
  const [isUpdating, setIsUpdating] = useState<string | null>(null)

  // Check and show milestone toast
  const checkMilestone = useCallback(
    (prevCount: number, newCount: number) => {
      if (totalLessons === 0) return

      const prevPercent = Math.floor((prevCount / totalLessons) * 100)
      const newPercent = Math.floor((newCount / totalLessons) * 100)

      // Milestones at 25%, 50%, 75%, 100%
      const milestones = [
        { threshold: 100, message: t('milestones.completed'), icon: '🏆' },
        { threshold: 75, message: t('milestones.almostThere'), icon: '🚀' },
        { threshold: 50, message: t('milestones.halfWay'), icon: '🎯' },
        { threshold: 25, message: t('milestones.greatStart'), icon: '✨' },
      ]

      for (const { threshold, message, icon } of milestones) {
        if (prevPercent < threshold && newPercent >= threshold) {
          toast.success(`${icon} ${message}`, {
            duration: 4000,
            position: 'top-center',
          })
          break
        }
      }
    },
    [totalLessons, t]
  )

  // Toggle lesson completion
  const toggleLessonComplete = useCallback(
    async (lessonId: string) => {
      if (isUpdating) return // Prevent concurrent updates

      const isCurrentlyCompleted = completedLessons.has(lessonId)
      const action = isCurrentlyCompleted ? 'mark_incomplete' : 'mark_complete'
      const prevCount = completedLessons.size

      // Optimistic update
      setIsUpdating(lessonId)
      setCompletedLessons((prev) => {
        const next = new Set(prev)
        if (isCurrentlyCompleted) {
          next.delete(lessonId)
        } else {
          next.add(lessonId)
        }
        return next
      })

      try {
        const apiUrl = buildCourseApiUrl(orgSlug, courseSlug, 'progress')
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lesson_id: lessonId, action }),
        })

        if (!response.ok) {
          throw new Error('Failed to update progress')
        }

        const data = (await response.json()) as ProgressResponse

        // Sync with server response
        setCompletedLessons(new Set(data.lessons_completed))

        // Check for milestone
        const newCount = data.lessons_completed.length
        checkMilestone(prevCount, newCount)

        // Success feedback
        if (!isCurrentlyCompleted) {
          toast.success(t('lessonCompleted'), { duration: 2000 })
        }
      } catch {
        // Revert optimistic update on error
        setCompletedLessons((prev) => {
          const next = new Set(prev)
          if (isCurrentlyCompleted) {
            next.add(lessonId)
          } else {
            next.delete(lessonId)
          }
          return next
        })
        toast.error(t('updateError'), { duration: 3000 })
      } finally {
        setIsUpdating(null)
      }
    },
    [orgSlug, courseSlug, completedLessons, isUpdating, checkMilestone, t]
  )

  return {
    completedLessons,
    isUpdating,
    toggleLessonComplete,
    completedCount: completedLessons.size,
  }
}
