import { NextRequest, NextResponse } from 'next/server'
import { getUserClient } from '@/lib/supabase/client-factory'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { logger, logPermanentFailure } from '@/lib/logger'
import { withOptionalAuth, withDevBypass, AuthUser } from '@/lib/auth'
import { getCourseByOrgAndSlug } from '@/lib/helpers/organization'
import { PostgrestError } from '@supabase/supabase-js'

interface Lesson {
  lesson_number: number
  [key: string]: unknown
}

interface Section {
  section_number: number
  lessons?: Lesson[]
  [key: string]: unknown
}

interface CourseWithSections {
  sections?: Section[]
  [key: string]: unknown
}

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

async function handleGetCourse(
  _request: NextRequest,
  user: AuthUser | null,
  { params }: RouteContext
) {
  try {
    const { orgSlug, courseSlug } = await params

    // Get course with organization validation
    const courseData = await getCourseByOrgAndSlug(orgSlug, courseSlug)
    if (!courseData) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Get appropriate client based on auth status
    const supabase = await getUserClient()

    // Build query based on auth status
    let query = supabase
      .from('courses')
      .select(
        `
        *,
        sections:sections(
          *,
          lessons:lessons(*)
        )
      `
      )
      .eq('id', courseData.id)

    // If user is not authenticated, only show public courses
    // If user is authenticated, show their courses OR public courses
    // Note: organization visibility is handled by RLS policy based on user's organization
    if (!user) {
      query = query.eq('visibility', 'public')
    } else {
      // Use separate queries combined with OR for safety - avoid string concatenation
      // First get public courses OR user's own courses using proper OR conditions
      // Note: Supabase .or() expects comma-separated conditions as string format
      // This is the expected Supabase syntax, but we validate user.id is a safe UUID
      if (
        typeof user.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
      ) {
        return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
      }
      query = query.or(`user_id.eq.${user.id},visibility.eq.public`)
    }

    const { data: course, error } = (await query.single()) as {
      data: CourseWithSections | null
      error: PostgrestError | null
    }

    // Sort sections and lessons after loading
    if (course && course.sections) {
      course.sections.sort((a: Section, b: Section) => a.section_number - b.section_number)
      course.sections.forEach((section: Section) => {
        if (section.lessons) {
          section.lessons.sort((a: Lesson, b: Lesson) => a.lesson_number - b.lesson_number)
        }
      })
    }

    if (error) {
      logger.error('Error fetching course:', error)
      logPermanentFailure({
        user_id: user?.id,
        error_message: error.message || 'Failed to fetch course',
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'COURSE_GET',
        metadata: {
          route: '/api/courses/[orgSlug]/[courseSlug]',
          orgSlug,
          courseSlug,
          errorCode: 'FETCH_ERROR',
        },
      }).catch((e) => console.error('Log write failed:', e.message))
      return NextResponse.json({ error: 'Failed to fetch course' }, { status: 500 })
    }

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    return NextResponse.json(course)
  } catch (error) {
    const { orgSlug, courseSlug } = await params
    logger.error('Error in GET /api/courses/[orgSlug]/[courseSlug]:', error)
    logPermanentFailure({
      user_id: user?.id,
      error_message: error instanceof Error ? error.message : 'Internal server error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'COURSE_GET',
      metadata: {
        route: '/api/courses/[orgSlug]/[courseSlug]',
        orgSlug,
        courseSlug,
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleDeleteCourse(_request: NextRequest, user: AuthUser, { params }: RouteContext) {
  const { orgSlug, courseSlug } = await params
  logger.devLog('DELETE course request:', { orgSlug, courseSlug, user })

  // Get course with organization validation
  const courseData = await getCourseByOrgAndSlug(orgSlug, courseSlug)
  if (!courseData) {
    logger.error('Course not found for deletion:', { orgSlug, courseSlug })
    logPermanentFailure({
      user_id: user?.id,
      error_message: 'Course not found for deletion',
      stack_trace: undefined,
      severity: 'ERROR',
      job_type: 'COURSE_DELETE',
      metadata: {
        route: '/api/courses/[orgSlug]/[courseSlug]',
        orgSlug,
        courseSlug,
        errorCode: 'NOT_FOUND_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))
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
  logger.devLog('DELETE request for course:', courseSlug, 'id:', id, 'by owner:', user.email)

  // Atomic database deletion via RPC
  // All deletions happen in a single transaction — if any step fails, everything rolls back.
  // The RPC function handles: lesson_progress cleanup (NO ACTION FK), then course deletion
  // with ON DELETE CASCADE handling all other child tables automatically.
  try {
    logger.devLog('Attempting atomic deletion of course:', id)

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('delete_course_cascade', {
      p_course_id: id,
    })
    const result = rpcData as unknown as DeleteCourseResult | null

    if (rpcError) {
      logger.error('Atomic course deletion failed:', rpcError)
      logPermanentFailure({
        user_id: user?.id,
        error_message: `Failed to delete course: ${rpcError.message}`,
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'COURSE_DELETE',
        metadata: {
          route: '/api/courses/[orgSlug]/[courseSlug]',
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
    logger.error('Error in DELETE /api/courses/[orgSlug]/[courseSlug]:', error)
    logPermanentFailure({
      user_id: user?.id,
      error_message: error instanceof Error ? error.message : 'Internal server error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'COURSE_DELETE',
      metadata: {
        route: '/api/courses/[orgSlug]/[courseSlug]',
        orgSlug,
        courseSlug,
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

async function handleUpdateCourse(request: NextRequest, user: AuthUser, { params }: RouteContext) {
  try {
    const { orgSlug, courseSlug } = await params
    logger.devLog('PUT request for course:', courseSlug, 'by user:', user.email)
    const body = await request.json()

    // Get course with organization validation
    const courseData = await getCourseByOrgAndSlug(orgSlug, courseSlug)
    if (!courseData) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Check permissions for update
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
      logger.warn('Unauthorized update attempt:', {
        courseId: courseData.id,
        courseOwnerId: courseData.user_id,
        requestUserId: user.id,
        userRole: user.role,
      })
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You can only update your own courses' },
        { status: 403 }
      )
    }

    const id = courseData.id

    // Whitelist allowed fields to prevent mass assignment
    const allowedFields = [
      'title',
      'course_description',
      'visibility',
      'style',
      'target_audience',
      'language',
      'difficulty_level',
      'url_name',
    ]
    const sanitizedBody = Object.fromEntries(
      Object.entries(body).filter(([key]) => allowedFields.includes(key))
    )

    if (Object.keys(sanitizedBody).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: course, error } = await supabaseAdmin
      .from('courses')
      .update(sanitizedBody)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Error updating course:', error)
      logPermanentFailure({
        user_id: user?.id,
        error_message: error.message || 'Failed to update course',
        stack_trace: undefined,
        severity: 'ERROR',
        job_type: 'COURSE_UPDATE',
        metadata: {
          route: '/api/courses/[orgSlug]/[courseSlug]',
          orgSlug,
          courseSlug,
          courseId: id,
          errorCode: 'UPDATE_ERROR',
        },
      }).catch((e) => console.error('Log write failed:', e.message))
      return NextResponse.json({ error: 'Failed to update course' }, { status: 500 })
    }

    return NextResponse.json(course)
  } catch (error) {
    const { orgSlug, courseSlug } = await params
    logger.error('Error in PUT /api/courses/[orgSlug]/[courseSlug]:', error)
    logPermanentFailure({
      user_id: user?.id,
      error_message: error instanceof Error ? error.message : 'Internal server error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'COURSE_UPDATE',
      metadata: {
        route: '/api/courses/[orgSlug]/[courseSlug]',
        orgSlug,
        courseSlug,
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Export handlers with appropriate authentication
export const GET = withOptionalAuth(handleGetCourse)

// For DELETE and PUT: use DevBypass in development/testing (with production safeguards), proper auth otherwise
export const DELETE = withDevBypass(async (request, user, params) => {
  return handleDeleteCourse(request, user!, params as RouteContext)
})

export const PUT = withDevBypass(async (request, user, params) => {
  return handleUpdateCourse(request, user!, params as RouteContext)
})
