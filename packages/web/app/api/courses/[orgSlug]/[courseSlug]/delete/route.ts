import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { logger, logPermanentFailure } from '@/lib/logger'
import { ENV } from '@/lib/env'
import { withDevBypass, withAuth, AuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getCourseByOrgAndSlug } from '@/lib/helpers/organization'

interface RouteContext {
  params: Promise<{ orgSlug: string; courseSlug: string }>
}

/** Response shape from the delete_course_cascade RPC function */
interface DeleteCourseResult {
  success: boolean
  error?: string
  deleted_course_id?: string
  deleted_course_title?: string
  lesson_progress_deleted?: number
}

/**
 * Calls the tRPC cleanup endpoint to clean up external resources
 * (Qdrant vectors, Redis, RAG context, files) before database deletion
 */
async function cleanupCourseResources(
  courseId: string,
  accessToken: string
): Promise<{
  success: boolean
  vectorsDeleted?: number
  filesDeleted?: number
  errors?: string[]
}> {
  const backendUrl = ENV.COURSEGEN_BACKEND_URL
  const tRPCUrl = `${backendUrl}/trpc`

  try {
    const response = await fetch(`${tRPCUrl}/generation.cleanupCourse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ courseId }),
    })

    const data = await response.json()

    if (!response.ok) {
      logger.warn('Cleanup tRPC call failed', {
        courseId,
        status: response.status,
        error: data,
      })
      return {
        success: false,
        errors: [data.error?.message || 'Cleanup request failed'],
      }
    }

    const result = data.result?.data
    return {
      success: result?.success ?? false,
      vectorsDeleted: result?.qdrant?.vectorsDeleted,
      filesDeleted: result?.files?.filesDeleted,
      errors: result?.errors,
    }
  } catch (error) {
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

async function handleDeleteCourse(_request: NextRequest, user: AuthUser, { params }: RouteContext) {
  const { orgSlug, courseSlug } = await params
  logger.devLog('DELETE course request:', { orgSlug, courseSlug, user })

  // Use admin client for server-side operations
  const supabase = getAdminClient()

  // Get course with organization validation
  const courseData = await getCourseByOrgAndSlug(orgSlug, courseSlug)

  logger.devLog('Course fetch result:', { courseData })

  if (!courseData) {
    logger.error('Course not found for deletion:', { orgSlug, courseSlug })
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  // Check permissions for deletion
  // Allow if: super admin, owner, or no owner (n8n created)
  // Development bypass only if explicitly enabled and not in production
  const isProductionEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.includes('megacampus') ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.RAILWAY_ENVIRONMENT === 'production'

  const devBypassFlag = process.env.ENABLE_DEV_AUTH === 'true'

  const isDevelopmentBypass =
    process.env.NODE_ENV === 'development' &&
    !isProductionEnv &&
    devBypassFlag &&
    user.id === 'dev-user'

  const isSuperAdmin = user.role === 'superadmin'
  const isNoOwnerCourse = courseData.user_id === null
  const isOwner = courseData.user_id === user.id

  if (!isDevelopmentBypass && !isSuperAdmin && !isNoOwnerCourse && !isOwner) {
    logger.warn('Unauthorized deletion attempt:', {
      courseId: courseData.id,
      courseOwnerId: courseData.user_id,
      requestUserId: user.id,
      userRole: user.role,
    })
    return NextResponse.json(
      { error: 'Unauthorized', message: 'You can only delete your own courses' },
      { status: 403 }
    )
  }

  logger.devLog('Ownership check passed:', {
    isDevelopmentBypass,
    isSuperAdmin,
    isNoOwnerCourse,
    isOwner,
    userRole: user.role,
  })

  const id = courseData.id
  logger.devLog('DELETE request for course:', courseSlug, 'id:', id, 'by user:', user.email)

  // Step 1: Clean up external resources BEFORE database deletion
  // Get user's access token for tRPC call
  const userSupabase = await createClient()
  const { data: sessionData } = await userSupabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  if (accessToken) {
    try {
      const cleanupResult = await cleanupCourseResources(id, accessToken)

      if (!cleanupResult.success) {
        logger.warn('Some cleanup operations failed, proceeding with deletion', {
          courseId: id,
          errors: cleanupResult.errors,
        })
      } else {
        logger.info('Course cleanup completed successfully', {
          courseId: id,
          vectorsDeleted: cleanupResult.vectorsDeleted,
          filesDeleted: cleanupResult.filesDeleted,
        })
      }
    } catch (cleanupError) {
      // Log but don't block deletion - cleanup is best-effort
      logger.error('Course cleanup failed, proceeding with deletion:', {
        courseId: id,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    }
  } else {
    logger.warn('No access token available for cleanup, skipping external resource cleanup', {
      courseId: id,
    })
  }

  // Step 2: Atomic database deletion via RPC
  // All deletions happen in a single transaction — if any step fails, everything rolls back.
  // The RPC function handles: lesson_progress cleanup (NO ACTION FK), then course deletion
  // with ON DELETE CASCADE handling all other child tables automatically.
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('delete_course_cascade', {
      p_course_id: id,
    })
    const result = rpcData as unknown as DeleteCourseResult | null

    if (rpcError) {
      logger.error('Atomic course deletion failed:', rpcError)

      // Log to error_logs for admin visibility
      logPermanentFailure({
        user_id: user.id,
        error_message: `Failed to delete course: ${rpcError.message}`,
        severity: 'ERROR',
        job_type: 'COURSE_DELETE',
        metadata: {
          route: '/api/courses/[orgSlug]/[courseSlug]/delete',
          orgSlug,
          courseSlug,
          courseId: id,
          errorCode: rpcError.code,
        },
      }).catch((e) => console.error('Log write failed:', e.message))

      return NextResponse.json(
        {
          error: 'Failed to delete course',
          details: rpcError.message,
          code: rpcError.code,
        },
        { status: 500 }
      )
    }

    if (!result?.success) {
      return NextResponse.json(
        { error: result?.error || 'Deletion failed' },
        { status: 404 }
      )
    }

    logger.devLog('Successfully deleted course:', result.deleted_course_title)

    return NextResponse.json(
      {
        message: 'Course deleted successfully',
        deletedCourse: { id: result.deleted_course_id, title: result.deleted_course_title },
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Error in DELETE /api/courses/[orgSlug]/[courseSlug]/delete:', error)

    // Log to error_logs for admin visibility
    logPermanentFailure({
      user_id: user.id,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'COURSE_DELETE',
      metadata: {
        route: '/api/courses/[orgSlug]/[courseSlug]/delete',
        orgSlug,
        courseSlug,
        courseId: id,
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// Production safeguard: NEVER bypass authentication in production
// Additional check to prevent accidental bypass if NODE_ENV is misconfigured
const isProductionUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.includes('megacampus') ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.RAILWAY_ENVIRONMENT === 'production'

const devBypassFlag = process.env.ENABLE_DEV_AUTH === 'true'

const shouldBypassAuth = process.env.NODE_ENV === 'development' && !isProductionUrl && devBypassFlag // Explicit opt-in required

// Always use authentication in production or when bypass is not explicitly allowed
export const POST = shouldBypassAuth
  ? withDevBypass(async (request, user, params) => {
      logger.warn('Development authentication bypass is active - DO NOT USE IN PRODUCTION')
      return handleDeleteCourse(request, user!, params as RouteContext)
    })
  : withAuth(async (request, user, params) => {
      return handleDeleteCourse(request, user, params as RouteContext)
    })
