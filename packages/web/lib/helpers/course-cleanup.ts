import { TRPCClientError } from '@trpc/client'
import { logger, logPermanentFailure } from '@/lib/logger'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'

/**
 * Removing a course from the database is not removing a course.
 *
 * The rows go with `delete_course_cascade`; the Qdrant vectors, the Redis keys,
 * the RAG context cache and the uploaded files do not. They are cleared by
 * `generation.cleanupCourse`, and that call has to be made by hand at every
 * place a course can be deleted.
 *
 * There were three such places and three different behaviours (mc2-ipc80):
 * the server action and the POST route each carried their own copy of this
 * function, and `DELETE /api/courses/[orgSlug]/[courseSlug]` called neither, so
 * that door left the vectors, the files and the Redis keys behind on every
 * single use. That is the symptom the ticket reported — rows gone, everything
 * else still there — and it did not need a failure to produce it.
 *
 * One copy now, called by all three. Best-effort is deliberate and unchanged:
 * a cleanup that fails must not leave undeletable rows behind. What it must not
 * do is fail quietly, so a partial or failed cleanup writes a `COURSE_CLEANUP`
 * row to the permanent-failure log with the course id — the only record that
 * says which paid-for vectors are now orphaned.
 */
export interface CourseCleanupResult {
  success: boolean
  vectorsDeleted?: number
  filesDeleted?: number
  errors?: string[]
}

/** Ask the backend to drop this course's external resources. Never throws. */
export async function cleanupCourseResources(courseId: string): Promise<CourseCleanupResult> {
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.cleanupCourse.mutate({ courseId })

    return {
      success: result?.success ?? false,
      vectorsDeleted: result?.qdrant?.vectorsDeleted,
      filesDeleted: result?.files?.filesDeleted,
      errors: result?.errors,
    }
  } catch (error) {
    if (error instanceof TRPCClientError) {
      logger.warn('Cleanup tRPC call failed', {
        courseId,
        code: error.data?.code,
        message: error.message,
      })
      return { success: false, errors: [error.message || 'Cleanup request failed'] }
    }

    logger.error('Failed to call cleanup endpoint:', {
      courseId,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown cleanup error'],
    }
  }
}

/**
 * Clean up before deleting a course, and record what was left behind.
 *
 * Returns nothing on purpose: the caller deletes either way. The audit row is
 * the deliverable when it did not work.
 */
export async function cleanupCourseResourcesBeforeDelete(
  courseId: string,
  userId: string | undefined
): Promise<CourseCleanupResult> {
  const result = await cleanupCourseResources(courseId)

  if (result.success) {
    logger.info('Course cleanup completed successfully', {
      courseId,
      vectorsDeleted: result.vectorsDeleted,
      filesDeleted: result.filesDeleted,
    })
    return result
  }

  logger.warn('Some cleanup operations failed, proceeding with deletion', {
    courseId,
    errors: result.errors,
  })

  await logPermanentFailure({
    user_id: userId,
    error_message: `Course cleanup partially failed: ${result.errors?.join(', ') ?? 'no detail'}`,
    severity: 'WARNING',
    job_type: 'COURSE_CLEANUP',
    metadata: {
      courseId,
      vectorsDeleted: result.vectorsDeleted,
      filesDeleted: result.filesDeleted,
      errors: result.errors,
    },
  }).catch((e: Error) => logger.error('Log write failed:', { data: e.message }))

  return result
}
