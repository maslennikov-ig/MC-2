'use client'

import { useState, useCallback } from 'react'
import { retryLessonGeneration } from '@/app/actions/lesson-actions'
import { pauseGeneration, resumeGeneration } from '@/app/actions/admin-generation'
import { toast } from 'sonner'

interface UseLessonActionsOptions {
  courseId: string
  onSuccess?: () => void
}

export function useLessonActions({ courseId, onSuccess }: UseLessonActionsOptions) {
  const [isLoading, setIsLoading] = useState(false)

  const retryLesson = useCallback(
    async (lessonId: string) => {
      setIsLoading(true)
      try {
        await retryLessonGeneration(courseId, lessonId)
        toast.success('Урок добавлен в очередь на повторную генерацию')
        onSuccess?.()
      } catch (error) {
        toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`)
      } finally {
        setIsLoading(false)
      }
    },
    [courseId, onSuccess]
  )

  const pause = useCallback(async () => {
    setIsLoading(true)
    try {
      await pauseGeneration(courseId)
      toast.success('Генерация приостановлена')
      onSuccess?.()
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`)
    } finally {
      setIsLoading(false)
    }
  }, [courseId, onSuccess])

  const resume = useCallback(async () => {
    setIsLoading(true)
    try {
      await resumeGeneration(courseId)
      toast.success('Генерация возобновлена')
      onSuccess?.()
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`)
    } finally {
      setIsLoading(false)
    }
  }, [courseId, onSuccess])

  return { retryLesson, pause, resume, isLoading }
}
