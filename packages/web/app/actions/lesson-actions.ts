'use server'

import { TRPCClientError } from '@trpc/client'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'

/**
 * Approve a lesson after review
 */
export async function approveLesson(courseId: string, lessonId: string) {
  try {
    const client = await getServerTrpcClient()
    return await client.lessonContent.approveLesson.mutate({ courseId, lessonId })
  } catch (error) {
    throw toActionError(error, 'Failed to approve lesson')
  }
}

/**
 * Update lesson content (manual edits)
 */
export async function updateLessonContent(
  courseId: string,
  lessonId: string,
  content: Record<string, unknown>
) {
  try {
    const client = await getServerTrpcClient()
    return await client.lessonContent.updateLessonContent.mutate({ courseId, lessonId, content })
  } catch (error) {
    throw toActionError(error, 'Failed to update lesson content')
  }
}

/**
 * Regenerate a lesson (uses existing retryLesson procedure)
 */
export async function regenerateLesson(courseId: string, lessonId: string, lessonSpec: unknown) {
  try {
    const client = await getServerTrpcClient()
    return await client.lessonContent.retryLesson.mutate({
      courseId,
      lessonId,
      lessonSpec: lessonSpec as Parameters<
        typeof client.lessonContent.retryLesson.mutate
      >[0]['lessonSpec'],
    })
  } catch (error) {
    throw toActionError(error, 'Failed to regenerate lesson')
  }
}

/**
 * Retry lesson generation without requiring lessonSpec
 * Uses partialGenerate which builds spec from course_structure
 *
 * @param courseId - Course UUID
 * @param lessonId - Lesson ID in format "section.lesson" (e.g., "1.1", "2.3")
 * @param priority - Job priority 1-10 (default: 8 for retries)
 */
export async function retryLessonGeneration(
  courseId: string,
  lessonId: string,
  priority: number = 8
): Promise<{ success: boolean; jobId?: string }> {
  try {
    const client = await getServerTrpcClient()
    const result = await client.lessonContent.partialGenerate.mutate({
      courseId,
      lessonIds: [lessonId],
      priority,
    })

    return {
      success: result?.success ?? false,
      jobId: result?.jobIds?.[0],
    }
  } catch (error) {
    throw toActionError(error, 'Failed to retry lesson generation')
  }
}

/**
 * Delete a lesson and all related data (cascading delete)
 *
 * @param courseId - Course UUID
 * @param lessonId - Lesson ID in format "section.lesson" (e.g., "1.1", "2.3") or UUID
 */
export async function deleteLesson(
  courseId: string,
  lessonId: string
): Promise<{ success: boolean; deletedLessonId?: string; deletedAssetsCount?: number }> {
  try {
    const client = await getServerTrpcClient()
    const result = await client.lessonContent.deleteLesson.mutate({ courseId, lessonId })

    return {
      success: result?.success ?? false,
      deletedLessonId: result?.deletedLessonId,
      deletedAssetsCount: result?.deletedAssetsCount,
    }
  } catch (error) {
    throw toActionError(error, 'Failed to delete lesson')
  }
}

/**
 * Approve multiple lessons (batch operation)
 *
 * @param courseId - Course UUID
 * @param moduleNumber - Optional module number to approve only lessons in that module
 */
export async function approveLessons(
  courseId: string,
  moduleNumber?: number
): Promise<{ success: boolean; approvedCount: number; skippedCount: number }> {
  try {
    const client = await getServerTrpcClient()
    const result = await client.lessonContent.approveLessons.mutate({ courseId, moduleNumber })

    return {
      success: result?.success ?? false,
      approvedCount: result?.approvedCount ?? 0,
      skippedCount: result?.skippedCount ?? 0,
    }
  } catch (error) {
    throw toActionError(error, 'Failed to approve lessons')
  }
}

/**
 * Export lessons in a module as Markdown
 *
 * @param courseId - Course UUID
 * @param moduleNumber - Module number (1-based)
 */
export async function exportModuleLessons(
  courseId: string,
  moduleNumber: number
): Promise<{ content: string; filename: string; lessonsCount: number }> {
  try {
    const client = await getServerTrpcClient()
    const result = await client.lessonContent.exportLessons.query({ courseId, moduleNumber })

    return {
      content: result?.content ?? '',
      filename: result?.filename ?? `module_${moduleNumber}_export.md`,
      lessonsCount: result?.lessonsCount ?? 0,
    }
  } catch (error) {
    throw toActionError(error, 'Failed to export lessons')
  }
}

/**
 * Retry generation of multiple failed lessons (batch)
 * Uses partialGenerate which supports multiple lessonIds
 *
 * @param courseId - Course UUID
 * @param lessonIds - Array of lesson IDs in format "section.lesson" (e.g., ["1.1", "2.3"])
 * @param priority - Job priority 1-10 (default: 8 for retries)
 */
export async function retryMultipleLessons(
  courseId: string,
  lessonIds: string[],
  priority: number = 8
): Promise<{ success: boolean; jobCount: number }> {
  try {
    const client = await getServerTrpcClient()
    const result = await client.lessonContent.partialGenerate.mutate({
      courseId,
      lessonIds,
      priority,
    })

    return {
      success: result?.success ?? false,
      jobCount: result?.jobCount ?? 0,
    }
  } catch (error) {
    throw toActionError(error, 'Failed to retry lessons')
  }
}

/**
 * Convert tRPC or unknown errors to a plain Error for server action boundaries
 */
function toActionError(error: unknown, fallback: string): Error {
  if (error instanceof TRPCClientError) {
    return new Error(error.message)
  }
  if (error instanceof Error) {
    return error
  }
  return new Error(fallback)
}
