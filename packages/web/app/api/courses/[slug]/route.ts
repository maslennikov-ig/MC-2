import { NextRequest, NextResponse } from 'next/server'
import { getUserClient } from '@/lib/supabase/client-factory'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/logger'
import { withOptionalAuth, withDevBypass, withAuth, AuthUser } from '@/lib/auth'
import { PostgrestError } from '@supabase/supabase-js'

interface Lesson {
  lesson_number: number;
  [key: string]: unknown;
}

interface Section {
  section_number: number;
  lessons?: Lesson[];
  [key: string]: unknown;
}

interface CourseWithSections {
  sections?: Section[];
  [key: string]: unknown;
}

async function handleGetCourse(
  _request: NextRequest,
  user: AuthUser | null,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    
    // Get appropriate client based on auth status
    const supabase = await getUserClient()
    
    // Build query based on auth status
    let query = supabase
      .from('courses')
      .select(`
        *,
        sections:sections(
          *,
          lessons:lessons(*)
        )
      `)
      .eq('slug', slug)
    
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
      if (typeof user.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) {
        return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
      }
      query = query.or(`user_id.eq.${user.id},visibility.eq.public`)
    }
    
    const { data: course, error } = await query.single() as { data: CourseWithSections | null, error: PostgrestError | null }
    
    // Сортируем секции и уроки после загрузки
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
      return NextResponse.json(
        { error: 'Failed to fetch course' },
        { status: 500 }
      )
    }
    
    if (!course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(course)
  } catch (error) {
    logger.error('Error in GET /api/courses/[slug]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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
  const { data: courseData, error: fetchError } = await supabaseAdmin
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
  // Allow if: dev bypass, super admin, owner, or no owner (n8n created)
  const isDevelopmentBypass = process.env.NODE_ENV === 'development' && user.id === 'dev-user'
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
  logger.devLog('DELETE request for course:', slug, 'id:', id, 'by owner:', user.email)
  
  try {
    
    logger.devLog('Attempting to delete course:', id)
    
    // Delete in correct order to avoid foreign key constraint violations
    // Note: Tests/questions tables will be added in future database schema updates
    // Currently these tables don't exist in the database: tests, questions, user_favorites

    // 1. Delete assets
    const { error: assetsError } = await supabaseAdmin
      .from('assets')
      .delete()
      .eq('course_id', id)
    
    if (assetsError) {
      logger.error('Error deleting assets:', assetsError)
    }
    
    // 3. Delete lessons (must be before sections)
    const { data: sectionsData } = await supabaseAdmin
      .from('sections')
      .select('id')
      .eq('course_id', id)
    
    if (sectionsData && sectionsData.length > 0) {
      const sectionIds = sectionsData.map(s => s.id)
      const { error: lessonsError } = await supabaseAdmin
        .from('lessons')
        .delete()
        .in('section_id', sectionIds)

      if (lessonsError) {
        logger.error('Error deleting lessons:', lessonsError)
        // Note: lessons are now linked via section_id only, no course_id fallback
      }
    }
    
    // 4. Delete sections
    const { error: sectionsError } = await supabaseAdmin
      .from('sections')
      .delete()
      .eq('course_id', id)
    
    if (sectionsError) {
      logger.error('Error deleting sections:', sectionsError)
    }
    
    // Note: Document processing tables will be added in future database schema updates
    // Currently these tables don't exist in the database
    
    // 8. Finally, delete the course
    const { error: courseError, data: deletedCourse } = await supabaseAdmin
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
    logger.error('Error in DELETE /api/courses/[slug]:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

async function handleUpdateCourse(
  request: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    logger.devLog('PUT request for course:', slug, 'by user:', user.email)
    const body = await request.json()
    
    // First get the course and check ownership
    const { data: courseData, error: fetchError } = await supabaseAdmin
      .from('courses')
      .select('id, user_id')
      .eq('slug', slug)
      .single()
    
    if (fetchError || !courseData) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      )
    }
    
    // Check permissions for update
    // Allow if: dev bypass, super admin, owner, or no owner (n8n created)
    const isDevelopmentBypass = process.env.NODE_ENV === 'development' && user.id === 'dev-user'
    const isSuperAdmin = user.role === 'superadmin'
    const isNoOwnerCourse = courseData.user_id === null
    const isOwner = courseData.user_id === user.id
    
    if (!isDevelopmentBypass && !isSuperAdmin && !isNoOwnerCourse && !isOwner) {
      logger.warn('Unauthorized update attempt:', { 
        courseId: courseData.id, 
        courseOwnerId: courseData.user_id, 
        requestUserId: user.id,
        userRole: user.role
      })
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You can only update your own courses' },
        { status: 403 }
      )
    }
    
    const id = courseData.id
    
    const { data: course, error } = await supabaseAdmin
      .from('courses')
      .update(body)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      logger.error('Error updating course:', error)
      return NextResponse.json(
        { error: 'Failed to update course' },
        { status: 500 }
      )
    }
    
    return NextResponse.json(course)
  } catch (error) {
    logger.error('Error in PUT /api/courses/[slug]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Export handlers with appropriate authentication
export const GET = withOptionalAuth(handleGetCourse)

// Check if auth should be bypassed (dev mode OR explicit bypass flag)
const shouldBypassAuth = process.env.NODE_ENV === 'development' || 
                        process.env.BYPASS_AUTH === 'true'


// For DELETE and PUT: use DevBypass in development/testing, proper auth in production
export const DELETE = shouldBypassAuth
  ? withDevBypass(async (request, user, params) => {
      return handleDeleteCourse(request, user!, params as { params: Promise<{ slug: string }> })
    })
  : withAuth(async (request, user, params) => {
      return handleDeleteCourse(request, user, params as { params: Promise<{ slug: string }> })
    })

export const PUT = shouldBypassAuth
  ? withDevBypass(async (request, user, params) => {
      return handleUpdateCourse(request, user!, params as { params: Promise<{ slug: string }> })
    })
  : withAuth(handleUpdateCourse)