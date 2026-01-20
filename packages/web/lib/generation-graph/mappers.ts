/**
 * Mapping utilities for generation graph data transformations
 * @module generation-graph/mappers
 */

import type { CourseSize } from '@megacampus/shared-types'
import type { Stage1CourseData } from '@/components/generation-graph/hooks/use-graph-data/types'

/**
 * Type for course from DB (based on Supabase schema)
 * Includes all fields needed for Stage1 display
 * Uses flexible types for JSON fields to match Supabase query results
 */
interface CourseFromDB {
  id: string
  title: string | null
  course_description: string | null
  target_audience: string | null
  style: string | null
  output_formats: string[] | null
  estimated_lessons: number | null
  estimated_sections: number | null
  content_strategy: string | null
  prerequisites: string | null
  learning_outcomes: string | null
  has_files: boolean | null
  language: string | null
  course_size: string | null
  generation_mode: string | null
  notify_on_completion: boolean | null
  notify_on_error: boolean | null
  notify_on_stage_complete: boolean | null
  user_id: string | null
  created_at: string | null
  // Settings is a JSON field in DB (Supabase Json type)
  settings: unknown
}

/**
 * Maps a course from DB to Stage1CourseData format
 * Centralizes all the mapping logic for Stage 1 display
 *
 * @param course - Course record from database
 * @returns Stage1CourseData for UI display
 */
export function mapCourseToStage1Data(course: CourseFromDB): Stage1CourseData {
  return {
    inputData: {
      topic: course.title || '',
      course_description: course.course_description || '',
      target_audience: course.target_audience || undefined,
      style: course.style || undefined,
      output_formats: (course.output_formats as Array<
        'text' | 'audio' | 'video' | 'presentation' | 'test'
      >) || ['text'],
      estimated_lessons: course.estimated_lessons || undefined,
      estimated_sections: course.estimated_sections || undefined,
      content_strategy:
        (course.content_strategy as 'auto' | 'create_from_scratch' | 'expand_and_enhance') ||
        'auto',
      prerequisites: course.prerequisites || undefined,
      learning_outcomes: course.learning_outcomes || undefined,
      has_files: course.has_files || false,
      language: course.language || 'ru',
      course_size: (course.course_size as CourseSize) || undefined,
      lesson_duration_minutes:
        (course.settings &&
        typeof course.settings === 'object' &&
        'lesson_duration_minutes' in course.settings
          ? (course.settings.lesson_duration_minutes as number | undefined)
          : undefined) || undefined,
      generation_mode: (course.generation_mode as 'automatic' | 'semi_automatic') || 'automatic',
      // Notification preferences
      notify_on_completion: course.notify_on_completion ?? true,
      notify_on_error: course.notify_on_error ?? true,
      notify_on_stage_complete: course.notify_on_stage_complete ?? false,
    },
    outputData: {
      courseId: course.id,
      ownerId: course.user_id || '',
      createdAt: course.created_at || new Date().toISOString(),
      status: 'ready' as const,
    },
  }
}
