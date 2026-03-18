import { getUserClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'

export async function getCurrentUser() {
  try {
    const supabase = await getUserClient()

    // SECURITY: First validate user authenticity with getUser()
    // getUser() validates JWT by contacting Supabase Auth server
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return null
    }

    // Now that user is validated, get session to access JWT custom claims
    // Custom claims from Auth Hook are in the JWT token
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return null
    }

    // Get role from JWT custom claims (added by custom_access_token_hook)
    // Decode JWT to get custom claims - they're in the access_token payload
    let role: string = 'student'
    let organizationId: string | null = null

    try {
      const token = session.access_token
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
      role = payload.role || 'student'
      // organization_id is included in JWT via custom_access_token_hook (T047)
      organizationId = payload.organization_id || null
    } catch {
      // Fallback to student/no-org if can't decode token
      role = 'student'
    }

    // Get full_name from user metadata
    const fullName = user.user_metadata?.full_name || user.email?.split('@')[0]

    return {
      id: user.id,
      email: user.email,
      name: fullName,
      role: role as 'superadmin' | 'admin' | 'instructor' | 'student',
      organizationId,
    }
  } catch {
    // Return null on auth error
    return null
  }
}

/**
 * Verify that a user has access to a course (owner OR same organization).
 * Matches backend logic in enrichment/helpers.ts:verifyEnrichmentAccess().
 *
 * Use from any server action or API route that needs course-level authorization.
 */
export async function verifyCourseAccess(
  supabase: Awaited<ReturnType<typeof getUserClient>>,
  courseId: string,
  currentUser: { id: string; organizationId?: string | null },
  actionName: string
): Promise<{ authorized: true } | { authorized: false; error: string }> {
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('user_id, organization_id')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    logger.error(`[${actionName}] Course not found`, { courseId })
    return { authorized: false, error: 'Course not found' }
  }

  const isOwner = course.user_id === currentUser.id
  const isSameOrg =
    currentUser.organizationId && course.organization_id === currentUser.organizationId

  if (!isOwner && !isSameOrg) {
    logger.error(`[${actionName}] Unauthorized access attempt`, {
      userId: currentUser.id,
      courseId,
      courseOwner: course.user_id,
    })
    return { authorized: false, error: 'Unauthorized' }
  }

  return { authorized: true }
}
