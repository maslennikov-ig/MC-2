import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'
import { withDevBypass, withAuth, AuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * Calls the tRPC cleanup endpoint to clean up external resources
 * (Qdrant vectors, Redis, RAG context, files) before database deletion
 */
async function cleanupCourseResources(courseId: string, accessToken: string): Promise<{
  success: boolean;
  vectorsDeleted?: number;
  filesDeleted?: number;
  errors?: string[];
}> {
  const backendUrl = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456';
  const tRPCUrl = `${backendUrl}/trpc`;

  try {
    const response = await fetch(`${tRPCUrl}/generation.cleanupCourse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ courseId }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn('Cleanup tRPC call failed', {
        courseId,
        status: response.status,
        error: data,
      });
      return {
        success: false,
        errors: [data.error?.message || 'Cleanup request failed'],
      };
    }

    const result = data.result?.data;
    return {
      success: result?.success ?? false,
      vectorsDeleted: result?.qdrant?.vectorsDeleted,
      filesDeleted: result?.files?.filesDeleted,
      errors: result?.errors,
    };
  } catch (error) {
    logger.error('Failed to call cleanup endpoint:', {
      courseId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown cleanup error'],
    };
  }
}

async function handleDeleteCourse(
  _request: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  logger.devLog('DELETE course request:', { slug, user })

  // Use admin client for server-side operations
  const supabase = getAdminClient()

  // First get the course and check ownership
  const { data: courseData, error: fetchError } = await supabase
    .from('courses')
    .select('id, user_id')
    .eq('slug', slug)
    .single()
  
  logger.devLog('Course fetch result:', { courseData, fetchError })
  
  if (fetchError || !courseData) {
    logger.error('Course not found for deletion:', { slug, error: fetchError })
    return NextResponse.json(
      { error: 'Course not found', details: fetchError?.message },
      { status: 404 }
    )
  }
  
  // Check permissions for deletion
  // Allow if: super admin, owner, or no owner (n8n created)
  // Development bypass only if explicitly enabled and not in production
  const isProductionEnv = process.env.NEXT_PUBLIC_SITE_URL?.includes('megacampus') || 
                         process.env.VERCEL_ENV === 'production' ||
                         process.env.RAILWAY_ENVIRONMENT === 'production'
  
  const devBypassFlag = process.env.ENABLE_DEV_AUTH === 'true'

  const isDevelopmentBypass = process.env.NODE_ENV === 'development' &&
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
      userRole: user.role
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
    userRole: user.role
  })

  const id = courseData.id
  logger.devLog('DELETE request for course:', slug, 'id:', id, 'by user:', user.email)

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
    logger.warn('No access token available for cleanup, skipping external resource cleanup', { courseId: id })
  }

  // Step 2: Delete database records
  try {
    // Delete in correct order to avoid foreign key constraint violations
    // Note: Tests/questions tables will be added in future database schema updates
    // Currently these tables don't exist: tests, questions, documents, document_chunks, sources, user_favorites

    // 1. Delete assets
    await supabase
      .from('assets')
      .delete()
      .eq('course_id', id)

    // 3. Delete lessons (must be before sections)
    const { data: sectionsData } = await supabase
      .from('sections')
      .select('id')
      .eq('course_id', id)

    if (sectionsData && sectionsData.length > 0) {
      const sectionIds = sectionsData.map(s => s.id)
      await supabase
        .from('lessons')
        .delete()
        .in('section_id', sectionIds)
    }

    // 4. Delete sections
    await supabase
      .from('sections')
      .delete()
      .eq('course_id', id)

    // 5. Finally, delete the course
    const { error: courseError, data: deletedCourse } = await supabase
      .from('courses')
      .delete()
      .eq('id', id)
      .select()
      .single()
    
    if (courseError) {
      logger.error('Error deleting course:', courseError)
      return NextResponse.json(
        { 
          error: 'Failed to delete course',
          details: courseError.message,
          code: courseError.code
        },
        { status: 500 }
      )
    }
    
    if (!deletedCourse) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      )
    }
    
    logger.devLog('Successfully deleted course:', deletedCourse.title)
    
    return NextResponse.json(
      { 
        message: 'Course deleted successfully',
        deletedCourse: { id: deletedCourse.id, title: deletedCourse.title }
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Error in DELETE /api/courses/[slug]/delete:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Production safeguard: NEVER bypass authentication in production
// Additional check to prevent accidental bypass if NODE_ENV is misconfigured
const isProductionUrl = process.env.NEXT_PUBLIC_SITE_URL?.includes('megacampus') || 
                       process.env.VERCEL_ENV === 'production' ||
                       process.env.RAILWAY_ENVIRONMENT === 'production'

const devBypassFlag = process.env.ENABLE_DEV_AUTH === 'true'

const shouldBypassAuth = process.env.NODE_ENV === 'development' &&
                        !isProductionUrl &&
                        devBypassFlag // Explicit opt-in required

// Always use authentication in production or when bypass is not explicitly allowed
export const POST = shouldBypassAuth
  ? withDevBypass(async (request, user, params) => {
      logger.warn('Development authentication bypass is active - DO NOT USE IN PRODUCTION')
      return handleDeleteCourse(request, user!, params as { params: Promise<{ slug: string }> })
    })
  : withAuth(async (request, user, params) => {
      return handleDeleteCourse(request, user, params as { params: Promise<{ slug: string }> })
    })